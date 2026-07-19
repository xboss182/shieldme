import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mailLogs } from '../../db/schema.js';
import { addToSuppressionList } from '../abuse/abuse.service.js';
import { writeAuditLog } from '../admin/admin.service.js';
import { hashBounceToken } from '../smtp-relays/service.js';

export async function processSmtpBounce(token: string) {
  if (!/^[a-f0-9]{48,128}$/i.test(token)) return false;
  const log = await db.query.mailLogs.findFirst({ where: and(eq(mailLogs.bounceTokenHash, hashBounceToken(token)), eq(mailLogs.outboundRouteMode, 'custom_smtp')) });
  if (!log || (log.bounceExpiresAt && log.bounceExpiresAt < new Date())) return false;
  await db.update(mailLogs).set({ status: 'bounced', smtpResponseClass: '5xx', updatedAt: new Date() }).where(eq(mailLogs.id, log.id));
  if (log.forwardedTo) await addToSuppressionList(log.forwardedTo, 'bounce');
  await writeAuditLog('smtp_relay.dsn_received', 'mail_log', log.id, { smtpRelayId: log.smtpRelayId });
  return true;
}
