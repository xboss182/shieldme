import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mailLogs } from '../../db/schema.js';
import { addToSuppressionList } from '../abuse/abuse.service.js';
import { writeAuditLog } from '../admin/admin.service.js';

function hashBounceToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function processSmtpBounce(token: string) {
  if (!/^[a-f0-9]{48,128}$/i.test(token)) return false;
  const log = await db.query.mailLogs.findFirst({ where: eq(mailLogs.bounceTokenHash, hashBounceToken(token)) });
  if (!log || (log.bounceExpiresAt && log.bounceExpiresAt < new Date())) return false;
  await db.update(mailLogs).set({ status: 'bounced', smtpResponseClass: '5xx', updatedAt: new Date() }).where(eq(mailLogs.id, log.id));
  if (log.forwardedTo) await addToSuppressionList(log.forwardedTo, 'bounce');
  await writeAuditLog(log.outboundProvider === 'mailbaby' ? 'mailbaby.dsn_received' : 'smtp_relay.dsn_received', 'mail_log', log.id, { smtpRelayId: log.smtpRelayId, provider: log.outboundProvider });
  return true;
}
