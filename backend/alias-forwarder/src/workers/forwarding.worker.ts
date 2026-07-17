import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { redis } from '../lib/redis.js';
import { db } from '../db/client.js';
import { aliases, mailLogs } from '../db/schema.js';
import { getPlatformDomain, isForwardingEnabled, getOutboundProvider, isOutboundConfigured } from '../config/runtime-config.js';
import { logger } from '../lib/logger.js';
import { sendOutbound } from '../modules/inbound/outbound.service.js';
import { emailForwardingQueueName, type EmailForwardingJob, type EmailForwardingPayload } from '../queues/email-jobs.js';
import { decryptQueuePayload } from '../queues/secure-email-jobs.js';
import { buildForwardBanner, buildForwardBannerText } from '../lib/forward-banner.js';
import { getArmoredKeyForRecipient, encryptWithPgpKey } from '../modules/pgp/pgp.service.js';
import { assertMonthlyForwardAllowed, assertOutboundProviderAllowed, PlanLimitError } from '../modules/plans/plans.js';
import { buildSpamHeaders, tagSubject, type SpamScanMetadata } from '../modules/spam/spam-scanner.service.js';
import { env } from '../config/env.js';
import { protectEmailTracking } from '../modules/tracking/tracking-protection.service.js';
import { recordTtiForwarded } from '../modules/tti/tti.service.js';

async function processForwardingJob(job: Job<EmailForwardingJob>) {
  let payload: EmailForwardingPayload;
  try {
    payload = decryptQueuePayload<EmailForwardingPayload>(job.data);
  } catch (err) {
    logger.warn({ jobId: job.id, err }, 'Dropping expired or undecryptable forwarding job payload');
    return;
  }

  const { aliasId, messageId: logId } = payload;

  logger.info({ jobId: job.id, logId, aliasId }, 'Processing forwarding job');

  if (!isOutboundConfigured()) {
    logger.warn({ jobId: job.id, logId }, 'Outbound provider not configured — forwarding skipped');
    await db.update(mailLogs).set({ status: 'failed', rejectionReason: 'outbound_not_configured', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    return;
  }

  // ── Global kill-switch check ────────────────────────────────────────────
  if (!isForwardingEnabled()) {
    logger.warn({ jobId: job.id, logId }, 'Forwarding globally disabled — skipping');
    await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'forwarding_disabled', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    return;
  }

  const log = await db.query.mailLogs.findFirst({ where: eq(mailLogs.id, logId) });
  if (!log) { logger.error({ logId }, 'Mail log not found — skipping'); return; }

  const alias = await db.query.aliases.findFirst({
    where: eq(aliases.id, aliasId),
    with: {
      domain: { columns: { domain: true, isActive: true } },
      recipient: { columns: { id: true, email: true, status: true, isActive: true } },
      owner: { columns: { id: true, isActive: true } },
    },
  });

  if (!alias) {
    await db.update(mailLogs).set({ status: 'failed', rejectionReason: 'alias_not_found', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    return;
  }

  const recipient = (alias as any).recipient as { id: string; email: string; status: string; isActive: boolean };
  const domain = (alias as any).domain as { domain: string; isActive: boolean };
  const owner = (alias as any).owner as { id: string; isActive: boolean } | undefined;
  const ownerId = owner?.id ?? alias.ownerId;

  if (owner && !owner.isActive) {
    await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'user_suspended', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    logger.warn({ aliasId, logId }, 'Alias owner suspended — dropping');
    return;
  }

  try {
    await assertMonthlyForwardAllowed(ownerId);
    await assertOutboundProviderAllowed(ownerId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'plan_limit_exceeded', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
      logger.warn({ aliasId, logId, userId: ownerId, err: err.message }, 'Plan limit blocked forwarding');
      return;
    }
    throw err;
  }

  if (alias.status !== 'active' || !domain.isActive || recipient.status !== 'verified' || !recipient.isActive) {
    await db.update(mailLogs).set({ status: 'failed', rejectionReason: 'state_changed_before_delivery', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    logger.warn({ aliasId, logId }, 'Alias/recipient state changed — dropping');
    return;
  }

  const platformDomain = getPlatformDomain();
  if (!platformDomain) {
    await db.update(mailLogs).set({ status: 'failed', rejectionReason: 'platform_domain_not_configured', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    return;
  }

  // ── PGP mode check ────────────────────────────────────────────────────────
  const pgpMode = alias.pgpMode ?? 'none';
  let pgpArmoredKey: string | null = null;

  if (pgpMode !== 'none') {
    pgpArmoredKey = await getArmoredKeyForRecipient(recipient.id);
    if (!pgpArmoredKey && pgpMode === 'required') {
      await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'pgp_key_required', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
      logger.warn({ aliasId, logId }, 'PGP key required but not configured — rejecting');
      return;
    }
  }

  const originalFrom = payload.originalFrom ?? log.envelopeFrom;
  const forwardFrom = originalFrom
    ? `${originalFrom.replace(/[<>"]/g, '')} via ${log.envelopeTo} <forwarded+${alias.localPart}@${platformDomain}>`
    : `forwarded+${alias.localPart}@${platformDomain}`;

  const spamScan = payload.spamScan as SpamScanMetadata | undefined;
  const baseSubject = payload.subject ?? `[Forwarded] Message to ${log.envelopeTo}`;
  const subject = spamScan ? tagSubject(baseSubject, spamScan) : baseSubject;

  const dashboardUrl = `https://app.${platformDomain}/aliases`;

  const rawText = payload.textBody ?? [
    `This message was forwarded by the alias ${log.envelopeTo}.`,
    `Original sender: ${originalFrom}`,
    `Original message-id: ${log.externalMessageId ?? '(unknown)'}`,
  ].join('\n');

  const rawHtml = payload.htmlBody ?? undefined;
  const rawHtmlForProtection = rawHtml ?? `<pre style="font-family:inherit;white-space:pre-wrap;">${rawText.replace(/[&]/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  const trackingProtection = protectEmailTracking(rawHtmlForProtection, {
    enabled: !['0', 'false', 'no'].includes(env.TRACKING_PROTECTION_ENABLED.toLowerCase()),
    mode: env.TRACKING_PROTECTION_MODE,
  });
  const trackingNotice = trackingProtection.metadata.enabled
    ? {
        enabled: true,
        pixelsRemoved: trackingProtection.metadata.pixelsRemoved,
        linksRewritten: trackingProtection.metadata.linksRewritten,
      }
    : undefined;
  const bannerOpts = { originalSender: originalFrom, dashboardUrl, trackingProtection: trackingNotice };
  const bannerHtml = buildForwardBanner(bannerOpts);
  const bannerText = buildForwardBannerText(bannerOpts);
  const composedText = bannerText + rawText;
  let composedHtml: string;
  if (rawHtml) {
    composedHtml = trackingProtection.html.toLowerCase().includes('<body')
      ? trackingProtection.html.replace(/(<body[^>]*>)/i, `$1\n${bannerHtml}`)
      : bannerHtml + trackingProtection.html;
  } else {
    composedHtml = bannerHtml + trackingProtection.html;
  }

  // ── Encrypt if PGP key available ──────────────────────────────────────────
  let textBody = composedText;
  let htmlBody: string | undefined = composedHtml;
  let pgpEncrypted = false;

  if (pgpArmoredKey) {
    try {
      const encryptedText = await encryptWithPgpKey(pgpArmoredKey, composedText);
      textBody = encryptedText;
      htmlBody = '<pre style="font-family:monospace;white-space:pre-wrap;">' + encryptedText + '</pre>';
      pgpEncrypted = true;
      logger.info({ logId, aliasId }, 'Email body encrypted with PGP');
    } catch (err) {
      if (pgpMode === 'required') {
        logger.error({ logId, aliasId, err }, 'PGP encryption failed — aborting delivery');
        await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'pgp_encryption_failed', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
        return;
      }
      logger.warn({ logId, aliasId, err }, 'PGP encryption failed — falling back to plaintext');
    }
  }

  const headers: Record<string, string> = {
    'X-Original-Sender': originalFrom,
    'X-Forwarded-For-Alias': log.envelopeTo,
  };
  if (log.externalMessageId) headers['X-Original-Message-Id'] = log.externalMessageId;
  if (pgpEncrypted) headers['X-PGP-Encrypted'] = 'true';
  if (trackingProtection.metadata.enabled) {
    headers['X-ShieldMe-Tracking-Protection'] = 'enabled';
    headers['X-ShieldMe-Tracking-Pixels-Removed'] = String(trackingProtection.metadata.pixelsRemoved);
    headers['X-ShieldMe-Tracking-Links-Rewritten'] = String(trackingProtection.metadata.linksRewritten);
  }
  if (spamScan) Object.assign(headers, buildSpamHeaders(spamScan));

  let outboundMessageId: string;
  try {
    outboundMessageId = await sendOutbound({
    from: forwardFrom,
    to: recipient.email,
    subject,
    replyTo: originalFrom,
    textBody,
    htmlBody,
    headers,
    }, { pgpRequired: pgpMode === 'required', pgpEncrypted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'outbound_send_failed';
    const permanent = /invalid|suppressed|blocked|complaint|bounce|permanent|5\d\d/i.test(message);
    await db.update(mailLogs).set({ status: permanent ? 'failed' : 'queued', outboundProvider: getOutboundProvider(), failureType: permanent ? 'permanent' : 'transient', failureReason: message.slice(0, 500), rejectionReason: message.slice(0, 500), updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    if (permanent) return;
    throw err;
  }

  await db.update(mailLogs).set({ status: 'delivered', resendMessageId: outboundMessageId, outboundProvider: getOutboundProvider(), trackingProtection: trackingProtection.metadata, updatedAt: new Date() }).where(eq(mailLogs.id, logId));
  const ttiProbeToken = subject.match(/\[shieldme-tti:([a-zA-Z0-9_-]{8,128})\]/)?.[1];
  if (ttiProbeToken) {
    await recordTtiForwarded({
      probeToken: ttiProbeToken,
      externalMessageId: log.externalMessageId,
      providerMessageId: outboundMessageId,
      provider: getOutboundProvider(),
    });
  }
  logger.info({ logId, outboundMessageId, pgpEncrypted, ttiProbe: Boolean(ttiProbeToken) }, 'Mail forwarding complete');
}

const worker = new Worker<EmailForwardingJob>(
  emailForwardingQueueName,
  processForwardingJob,
  { connection: redis, concurrency: 5 },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Forwarding job failed');
});
worker.on('error', (err) => {
  logger.error({ err: err.message }, 'Worker error');
});

logger.info('Forwarding worker started');
