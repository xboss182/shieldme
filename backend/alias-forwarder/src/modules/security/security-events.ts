import { and, desc, gte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { auditLogs } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

type SecuritySeverity = 'info' | 'warn' | 'critical';

type SecurityEventInput = {
  action: string;
  targetType?: string;
  targetId?: string;
  actorType?: 'admin' | 'system' | 'user';
  actorId?: string | null;
  severity?: SecuritySeverity;
  metadata?: Record<string, unknown>;
};

const SECURITY_TARGET_ID = '00000000-0000-0000-0000-000000000000';

function sanitizeMetadata(metadata: Record<string, unknown> = {}) {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    redacted[key] = /secret|token|password|key|username|credential|ciphertext|wrapped|transcript|authorization/i.test(key) ? '[redacted]' : value;
  }
  return redacted;
}

export async function logSecurityEvent(input: SecurityEventInput) {
  const metadata = { severity: input.severity ?? 'info', securityEvent: true, ...sanitizeMetadata(input.metadata) };
  logger.info({ securityEvent: true, action: input.action, targetType: input.targetType ?? 'security', actorType: input.actorType ?? 'system', actorId: input.actorId ?? null, severity: metadata.severity, metadata }, 'Security event');
  try {
    await db.insert(auditLogs).values({ actorType: input.actorType ?? 'system', actorId: input.actorId ?? null, action: input.action, targetType: input.targetType ?? 'security', targetId: input.targetId ?? SECURITY_TARGET_ID, metadata });
  } catch (err) {
    logger.warn({ err, action: input.action }, 'Failed to persist security event');
  }
}

export async function listSecurityEvents(hours = 24, maxRows = 100) {
  const since = new Date(Date.now() - Math.max(1, Math.min(hours, 24 * 30)) * 60 * 60 * 1000);
  const limit = Math.max(1, Math.min(maxRows, 500));
  const rows = await db.select().from(auditLogs).where(and(gte(auditLogs.timestamp, since), sql`${auditLogs.metadata}->>'securityEvent' = 'true'`)).orderBy(desc(auditLogs.timestamp)).limit(limit);
  return { securityEvents: rows, since, limit };
}
