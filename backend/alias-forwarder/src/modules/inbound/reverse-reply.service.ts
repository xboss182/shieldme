import { createHash } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { reverseReplyTokens } from '../../db/schema.js';
import { generateToken } from '../../lib/tokens.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * Reverse-reply token store (MNC-708 Stage 1).
 *
 * An opaque token is minted at forward time and embedded in the outbound
 * `forwarded+<token>@<platform-domain>` From address. When the original
 * recipient replies, the inbound SMTP handler extracts the token, resolves it
 * back to its `{ aliasId, originalSender }` binding, and (in Stage 2) relays
 * the reply. The raw token is never persisted — only its SHA-256 hash, the same
 * posture used for bounce tokens.
 *
 * Fail-closed: unknown / malformed / expired tokens resolve to `null`. Callers
 * silently accept-and-discard on `null` (no bounce, no DSN, no enumeration).
 */

// 32-byte token => 64 hex chars. The local-part branch accepts 32–128 hex
// chars to leave headroom; enforce the same shape here before any DB lookup.
const TOKEN_HEX_REGEX = /^[a-f0-9]{32,128}$/i;

export interface ReverseReplyBinding {
  id: string;
  aliasId: string;
  originalSender: string;
  createdAt: Date;
  expiresAt: Date;
}

/** SHA-256 hash of the raw token for safe, constant-shape storage/lookup. */
export function hashReverseReplyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a reverse-reply token, persist its hashed binding, and return the raw
 * token for embedding in the outbound From local-part. The raw value is only
 * ever returned here and never stored.
 */
export async function mintReverseReplyToken(input: {
  aliasId: string;
  originalSender: string;
  now?: Date;
}): Promise<string> {
  const token = generateToken(32); // 64 hex chars
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + env.INBOUND_REPLY_TOKEN_TTL_MINUTES * 60_000);

  await db.insert(reverseReplyTokens).values({
    tokenHash: hashReverseReplyToken(token),
    aliasId: input.aliasId,
    originalSender: input.originalSender,
    expiresAt,
  });

  return token;
}

/**
 * Resolve a raw reverse-reply token to its binding.
 *
 * Returns `null` (fail-closed) when the token is malformed, unknown, or expired.
 * Never throws for lookup misses so callers can silently accept-and-discard.
 */
export async function resolveReverseReplyToken(
  token: string,
  now: Date = new Date(),
): Promise<ReverseReplyBinding | null> {
  if (!TOKEN_HEX_REGEX.test(token)) return null;

  const row = await db.query.reverseReplyTokens.findFirst({
    where: eq(reverseReplyTokens.tokenHash, hashReverseReplyToken(token)),
  });
  if (!row) return null;
  if (row.expiresAt <= now) return null;

  return {
    id: row.id,
    aliasId: row.aliasId,
    originalSender: row.originalSender,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/**
 * Best-effort cleanup of expired token rows. Safe to call opportunistically;
 * failures are logged and swallowed so they never block mail handling.
 */
export async function purgeExpiredReverseReplyTokens(now: Date = new Date()): Promise<number> {
  try {
    const deleted = await db
      .delete(reverseReplyTokens)
      .where(lt(reverseReplyTokens.expiresAt, now))
      .returning({ id: reverseReplyTokens.id });
    return deleted.length;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'reverse_reply_token_purge_failed');
    return 0;
  }
}

/** Exposed for tests / diagnostics: count of live (unexpired) tokens for an alias. */
export async function countLiveReverseReplyTokens(aliasId: string, now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ id: reverseReplyTokens.id })
    .from(reverseReplyTokens)
    .where(and(eq(reverseReplyTokens.aliasId, aliasId), gt(reverseReplyTokens.expiresAt, now)));
  return rows.length;
}
