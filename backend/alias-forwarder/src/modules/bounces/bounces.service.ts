import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mailLogs } from '../../db/schema.js';
import { addToSuppressionList } from '../abuse/abuse.service.js';
import { writeAuditLog } from '../admin/admin.service.js';
import { hashBounceToken } from '../smtp-relays/service.js';

export async function processSmtpBounce(token: string) {
  if (!/^[a-f0-9]{48,128}$/i.test(token)) return false;
  const log = await db.query.mailLogs.findFirst({ where: eq(mailLogs.bounceTokenHash, hashBounceToken(token)) });
  if (!log || (log.bounceExpiresAt && log.bounceExpiresAt < new Date())) return false;
  const mailBaby = log.outboundProvider === 'mailbaby';
  await db.update(mailLogs).set({
    status: 'bounced',
    failureType: 'bounce',
    failureReason: mailBaby ? 'mailbaby_dsn_recipient_bounce' : 'smtp_dsn_recipient_bounce',
    rejectionReason: mailBaby ? 'mailbaby_dsn_recipient_bounce' : 'smtp_dsn_recipient_bounce',
    smtpResponseClass: '5xx',
    updatedAt: new Date(),
  }).where(eq(mailLogs.id, log.id));
  if (log.forwardedTo) await addToSuppressionList(log.forwardedTo, 'bounce');
  await writeAuditLog(mailBaby ? 'mailbaby.dsn_received' : 'smtp_relay.dsn_received', 'mail_log', log.id, { smtpRelayId: log.smtpRelayId });
  return true;
}
