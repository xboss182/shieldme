import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { senderBlocklists, suppressionList } from '../../db/schema.js';
import { redis } from '../../lib/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export class AbuseError extends Error {
  constructor(message: string, public statusCode = 550) {
    super(message);
  }
}

function aliasRateKey(aliasId: string): string {
  const w = Math.floor(Date.now() / (env.RATE_LIMIT_ALIAS_WINDOW_SEC * 1000));
  return `rl:alias:${aliasId}:${w}`;
}

function userRateKey(ownerId: string): string {
  const w = Math.floor(Date.now() / (env.RATE_LIMIT_USER_WINDOW_SEC * 1000));
  return `rl:user:${ownerId}:${w}`;
}

export async function checkRateLimits(aliasId: string, ownerId: string): Promise<void> {
  const aliasKey = aliasRateKey(aliasId);
  const userKey = userRateKey(ownerId);
  const [aliasCount, userCount] = await Promise.all([
    redis.incr(aliasKey),
    redis.incr(userKey),
  ]);
  if (aliasCount === 1) await redis.expire(aliasKey, env.RATE_LIMIT_ALIAS_WINDOW_SEC * 2);
  if (userCount === 1) await redis.expire(userKey, env.RATE_LIMIT_USER_WINDOW_SEC * 2);
  if (aliasCount > env.RATE_LIMIT_ALIAS_MAX) {
    logger.warn({ aliasId, aliasCount }, "Per-alias rate limit exceeded");
    throw new AbuseError("Rate limit exceeded for alias", 452);
  }
  if (userCount > env.RATE_LIMIT_USER_MAX) {
    logger.warn({ ownerId, userCount }, "Per-user rate limit exceeded");
    throw new AbuseError("Rate limit exceeded for account", 452);
  }
}

export async function isSenderBlocked(aliasId: string, senderEmail: string): Promise<boolean> {
  const n = senderEmail.toLowerCase().trim();
  const row = await db.query.senderBlocklists.findFirst({
    where: and(eq(senderBlocklists.aliasId, aliasId), eq(senderBlocklists.senderEmail, n)),
  });
  return row !== undefined;
}

export async function addSenderBlock(aliasId: string, senderEmail: string) {
  const n = senderEmail.toLowerCase().trim();
  const [row] = await db.insert(senderBlocklists).values({ aliasId, senderEmail: n }).onConflictDoNothing().returning();
  return row;
}

export async function removeSenderBlock(aliasId: string, senderEmail: string) {
  const n = senderEmail.toLowerCase().trim();
  await db.delete(senderBlocklists).where(and(eq(senderBlocklists.aliasId, aliasId), eq(senderBlocklists.senderEmail, n)));
}

export async function listSenderBlocks(aliasId: string) {
  return db.query.senderBlocklists.findMany({
    where: eq(senderBlocklists.aliasId, aliasId),
    columns: { id: true, senderEmail: true, createdAt: true },
  });
}

export async function isRecipientSuppressed(email: string): Promise<boolean> {
  const n = email.toLowerCase().trim();
  const row = await db.query.suppressionList.findFirst({ where: eq(suppressionList.email, n) });
  return row !== undefined;
}

export async function addToSuppressionList(email: string, reason: "bounce" | "complaint" | "manual") {
  const n = email.toLowerCase().trim();
  const [row] = await db.insert(suppressionList).values({ email: n, reason }).onConflictDoNothing().returning();
  return row;
}

export async function removeFromSuppressionList(email: string) {
  const n = email.toLowerCase().trim();
  await db.delete(suppressionList).where(eq(suppressionList.email, n));
}

export async function listSuppressions() {
  return db.query.suppressionList.findMany({ columns: { id: true, email: true, reason: true, createdAt: true } });
}

export function isLoopSender(fromAddress: string, platformDomain: string): boolean {
  const lower = fromAddress.toLowerCase();
  const atIdx = lower.lastIndexOf("@");
  if (atIdx === -1) return false;
  return lower.slice(atIdx + 1) === platformDomain.toLowerCase();
}

export function detectAutoReplyHeaders(headers: Record<string, string>): string | null {
  const get = (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? "";
  const autoSubmitted = get("Auto-Submitted");
  if (autoSubmitted && autoSubmitted !== "no") return "auto_reply_loop";
  const precedence = get("Precedence");
  if (["bulk", "list", "junk"].includes(precedence)) return "bulk_precedence";
  if (get("X-Autoreply") || get("X-Auto-Response-Suppress")) return "auto_reply_loop";
  return null;
}

export async function isDuplicate(messageId: string): Promise<boolean> {
  const key = `dedup:msgid:${messageId}`;
  const result = await redis.set(key, "1", "EX", 86400, "NX");
  return result === null;
}
