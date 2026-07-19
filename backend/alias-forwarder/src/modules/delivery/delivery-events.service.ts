import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mailLogs, deliveryFailureLog } from '../../db/schema.js';
import { addToSuppressionList } from '../abuse/abuse.service.js';
import { relayDeliveryEventsTotal } from '../smtp-relays/metrics.js';

export type DeliveryProvider = 'resend' | 'ses';
export type DeliveryEventType = 'delivered' | 'failed' | 'bounced' | 'complained';

export type NormalizedDeliveryEvent = {
  provider: DeliveryProvider;
  providerMessageId: string;
  type: DeliveryEventType;
  recipient?: string;
  failureType?: 'transient' | 'permanent' | 'bounce' | 'complaint';
  reason?: string;
};

function safeReason(reason?: string): string | null {
  if (!reason) return null;
  return reason.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function statusForEvent(type: DeliveryEventType): 'delivered' | 'failed' | 'bounced' | 'complained' {
  if (type === 'bounced') return 'bounced';
  if (type === 'complained') return 'complained';
  if (type === 'delivered') return 'delivered';
  return 'failed';
}

function failureReasonForEvent(type: DeliveryEventType): 'bounce' | 'complaint' | 'failed' | null {
  if (type === 'bounced') return 'bounce';
  if (type === 'complained') return 'complaint';
  if (type === 'failed') return 'failed';
  return null;
}

export async function recordDeliveryEvent(event: NormalizedDeliveryEvent): Promise<void> {
  relayDeliveryEventsTotal.inc({ event: event.type });
  const status = statusForEvent(event.type);
  const failureReason = safeReason(event.reason);

  // Update mail log status — never stores body material
  await db.update(mailLogs).set({
    status,
    resendMessageId: event.providerMessageId,
    outboundProvider: event.provider,
    failureType: event.failureType ?? null,
    failureReason,
    rejectionReason: status === 'delivered' ? null : failureReason,
    updatedAt: new Date(),
  }).where(eq(mailLogs.resendMessageId, event.providerMessageId));

  // For failure events: write to delivery_failure_log (metadata only, no body)
  const failureLogReason = failureReasonForEvent(event.type);
  if (failureLogReason && event.recipient) {
    // Look up the mail log to get alias info
    const log = await db.query.mailLogs.findFirst({
      where: eq(mailLogs.resendMessageId, event.providerMessageId),
      columns: { aliasId: true, envelopeTo: true },
    });

    await db.insert(deliveryFailureLog).values({
      aliasId: log?.aliasId ?? null,
      aliasAddress: log?.envelopeTo ?? event.recipient,
      recipient: event.recipient,
      provider: event.provider,
      providerMessageId: event.providerMessageId,
      reason: failureLogReason,
      failureDetail: failureReason,
    });
  }

  // Bounce and complaint suppression — prevents future delivery attempts
  if ((event.type === 'bounced' || event.type === 'complained') && event.recipient) {
    await addToSuppressionList(event.recipient, event.type === 'bounced' ? 'bounce' : 'complaint');
  }
}

export function normalizeResendWebhook(body: unknown): NormalizedDeliveryEvent | null {
  const payload = body as { type?: string; data?: { email_id?: string; id?: string; to?: string[] | string; reason?: string } };
  const data = payload.data ?? {};
  const providerMessageId = String(data.email_id ?? data.id ?? '');
  if (!providerMessageId) return null;
  const to = Array.isArray(data.to) ? String(data.to[0] ?? '') : typeof data.to === 'string' ? data.to : undefined;
  if (payload.type === 'email.delivered') return { provider: 'resend', providerMessageId, type: 'delivered', recipient: to };
  if (payload.type === 'email.bounced') return { provider: 'resend', providerMessageId, type: 'bounced', recipient: to, failureType: 'bounce', reason: data.reason ?? 'bounced' };
  if (payload.type === 'email.complained') return { provider: 'resend', providerMessageId, type: 'complained', recipient: to, failureType: 'complaint', reason: data.reason ?? 'complained' };
  return null;
}

export function normalizeSesWebhook(body: unknown): NormalizedDeliveryEvent | null {
  const payload = body as { notificationType?: string; mail?: { messageId?: string; destination?: string[] }; bounce?: { bounceType?: string; bouncedRecipients?: Array<{ emailAddress?: string; diagnosticCode?: string }> }; complaint?: { complainedRecipients?: Array<{ emailAddress?: string }> } };
  const providerMessageId = payload.mail?.messageId;
  if (!providerMessageId) return null;
  if (payload.notificationType === 'Delivery') return { provider: 'ses', providerMessageId, type: 'delivered', recipient: payload.mail?.destination?.[0] };
  if (payload.notificationType === 'Bounce') {
    const recipient = payload.bounce?.bouncedRecipients?.[0];
    const permanent = payload.bounce?.bounceType === 'Permanent';
    return { provider: 'ses', providerMessageId, type: permanent ? 'bounced' : 'failed', recipient: recipient?.emailAddress, failureType: permanent ? 'bounce' : 'transient', reason: recipient?.diagnosticCode ?? payload.bounce?.bounceType ?? 'bounce' };
  }
  if (payload.notificationType === 'Complaint') return { provider: 'ses', providerMessageId, type: 'complained', recipient: payload.complaint?.complainedRecipients?.[0]?.emailAddress, failureType: 'complaint', reason: 'complaint' };
  return null;
}
