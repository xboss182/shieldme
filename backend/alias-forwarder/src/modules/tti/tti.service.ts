import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { ttiChecks } from '../../db/schema.js';

export type TtiStatus = 'pending' | 'forwarded' | 'failed' | 'expired';

export type CreateTtiProbeInput = {
  probeToken: string;
  aliasAddress: string;
  provider?: string | null;
  syntheticInbox?: string | null;
  sentAt?: Date;
};

export type RecordForwardedInput = {
  probeToken?: string | null;
  externalMessageId?: string | null;
  providerMessageId?: string | null;
  provider?: string | null;
  receivedAt?: Date;
};

export function sanitizeTtiFailureReason(reason?: string | null): string | null {
  if (!reason) return null;
  return reason.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

export function computeLatencyMs(start: Date, end: Date): number {
  return Math.max(0, end.getTime() - start.getTime());
}

export async function createTtiProbe(input: CreateTtiProbeInput) {
  const sentAt = input.sentAt ?? new Date();
  const [row] = await db.insert(ttiChecks).values({
    probeToken: input.probeToken,
    aliasAddress: input.aliasAddress,
    provider: input.provider ?? null,
    syntheticInbox: input.syntheticInbox ?? null,
    status: 'pending',
    sentAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return row;
}

export async function recordTtiForwarded(input: RecordForwardedInput): Promise<boolean> {
  const receivedAt = input.receivedAt ?? new Date();
  const probeToken = input.probeToken?.trim();
  const externalMessageId = input.externalMessageId?.trim();

  if (!probeToken && !externalMessageId) return false;

  const whereClause = probeToken
    ? eq(ttiChecks.probeToken, probeToken)
    : eq(ttiChecks.externalMessageId, externalMessageId as string);

  const existing = await db.query.ttiChecks.findFirst({ where: whereClause });
  if (!existing || existing.status !== 'pending') return false;

  await db.update(ttiChecks).set({
    status: 'forwarded',
    provider: input.provider ?? existing.provider,
    providerMessageId: input.providerMessageId ?? existing.providerMessageId,
    receivedAt,
    latencyMs: computeLatencyMs(existing.sentAt, receivedAt),
    updatedAt: new Date(),
  }).where(eq(ttiChecks.id, existing.id));

  return true;
}

export async function recordTtiFailure(probeToken: string, reason: string, failedAt = new Date()): Promise<boolean> {
  const existing = await db.query.ttiChecks.findFirst({ where: eq(ttiChecks.probeToken, probeToken) });
  if (!existing || existing.status !== 'pending') return false;

  await db.update(ttiChecks).set({
    status: 'failed',
    receivedAt: failedAt,
    latencyMs: computeLatencyMs(existing.sentAt, failedAt),
    failureReason: sanitizeTtiFailureReason(reason),
    updatedAt: new Date(),
  }).where(eq(ttiChecks.id, existing.id));

  return true;
}

export async function listRecentTtiChecks(limit = 50) {
  return db.select({
    id: ttiChecks.id,
    aliasAddress: ttiChecks.aliasAddress,
    provider: ttiChecks.provider,
    status: ttiChecks.status,
    sentAt: ttiChecks.sentAt,
    receivedAt: ttiChecks.receivedAt,
    latencyMs: ttiChecks.latencyMs,
    failureReason: ttiChecks.failureReason,
    createdAt: ttiChecks.createdAt,
  }).from(ttiChecks).orderBy(desc(ttiChecks.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
}
