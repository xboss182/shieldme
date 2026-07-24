import { createHash } from 'node:crypto';
import { redis } from '../../lib/redis.js';
import { env } from '../../config/env.js';
import { detectAutoReplyHeaders } from '../abuse/abuse.service.js';

/**
 * Loop prevention + rate limiting for the reverse-reply relay (MNC-708 Stage 2).
 *
 * Loop prevention has three layers:
 *   1. Auto-Submitted / bulk-precedence / auto-responder headers (reuses the
 *      existing `detectAutoReplyHeaders` guard from the inbound path).
 *   2. Our own hop marker `X-ShieldMe-Relay`. Every relayed reply carries it
 *      with an incrementing hop count. An inbound message already carrying the
 *      marker at/over the hop cap is one of ours bouncing back — drop it.
 *   3. The `loop_sender` guard (sender is our platform domain) is applied by the
 *      caller via the shared `isLoopSender` helper before this runs.
 *
 * Rate limiting mirrors the abuse-service sliding-window counters but on a
 * dedicated key space so reverse-reply volume never interacts with inbound
 * forwarding limits: per-alias/day and per-(alias, recipient)/day.
 */

export const RELAY_HOP_HEADER = 'X-ShieldMe-Relay';

/** Header emitted on every relayed reply so we can detect our own messages. */
export function buildRelayHopHeaderValue(hop: number): string {
  return `hop=${hop}; by=shieldme.cc`;
}

/** Parse the hop count from an inbound `X-ShieldMe-Relay` header, if present. */
export function parseRelayHop(headerValue: string | undefined): number | null {
  if (!headerValue) return null;
  const match = headerValue.match(/hop=(\d+)/i);
  if (!match) return null;
  const hop = Number(match[1]);
  return Number.isFinite(hop) ? hop : null;
}

function getHeader(headers: Record<string, string> | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  return headers[key] ?? headers[key.toLowerCase()] ?? Object.entries(headers).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
}

export type LoopDropReason =
  | 'auto_reply_loop'
  | 'bulk_precedence'
  | 'relay_marker_loop';

/**
 * Returns a drop reason when the inbound reply is a loop (auto-reply, bulk, or
 * one of our own relayed messages coming back), or `null` when it is safe to
 * relay. The `loop_sender` (platform-domain sender) check is applied separately
 * by the caller using the shared `isLoopSender` guard.
 */
export function detectReverseReplyLoop(headers: Record<string, string> | undefined): LoopDropReason | null {
  const autoReply = headers ? detectAutoReplyHeaders(headers) : null;
  if (autoReply === 'auto_reply_loop') return 'auto_reply_loop';
  if (autoReply === 'bulk_precedence') return 'bulk_precedence';

  const hop = parseRelayHop(getHeader(headers, RELAY_HOP_HEADER));
  if (hop !== null && hop >= env.REVERSE_REPLY_MAX_HOPS) return 'relay_marker_loop';

  return null;
}

/** Next hop count to stamp on an outbound relay, given the inbound message. */
export function nextRelayHop(headers: Record<string, string> | undefined): number {
  const inboundHop = parseRelayHop(getHeader(headers, RELAY_HOP_HEADER));
  return (inboundHop ?? 0) + 1;
}

function dayWindow(): number {
  return Math.floor(Date.now() / (24 * 60 * 60 * 1000));
}

function recipientHash(originalSender: string): string {
  return createHash('sha256').update(originalSender.toLowerCase().trim()).digest('hex').slice(0, 32);
}

export type RateLimitDropReason = 'alias_rate_limited' | 'recipient_rate_limited';

/**
 * Enforce the per-alias and per-(alias, recipient) daily relay caps. Increments
 * the counters and returns a drop reason when a cap is exceeded, or `null` when
 * the relay is within limits. Counters expire after 48h so windows self-clean.
 */
export async function enforceReverseReplyRateLimit(
  aliasId: string,
  originalSender: string,
): Promise<RateLimitDropReason | null> {
  const w = dayWindow();
  const aliasKey = `rr:alias:${aliasId}:${w}`;
  const recipientKey = `rr:recip:${aliasId}:${recipientHash(originalSender)}:${w}`;
  const ttl = 48 * 60 * 60;

  const [aliasCount, recipientCount] = await Promise.all([
    redis.incr(aliasKey),
    redis.incr(recipientKey),
  ]);
  if (aliasCount === 1) await redis.expire(aliasKey, ttl);
  if (recipientCount === 1) await redis.expire(recipientKey, ttl);

  if (aliasCount > env.REVERSE_REPLY_MAX_PER_ALIAS_PER_DAY) return 'alias_rate_limited';
  if (recipientCount > env.REVERSE_REPLY_MAX_PER_RECIPIENT_PER_DAY) return 'recipient_rate_limited';
  return null;
}
