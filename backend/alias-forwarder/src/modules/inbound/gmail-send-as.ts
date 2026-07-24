/**
 * MNC-712 — Gmail Send-As verification code detection and storage.
 *
 * When Gmail's "Send As" setup flow dispatches a verification email to a
 * ShieldMe alias, this module:
 *   1. Detects the email by sender + subject patterns.
 *   2. Extracts the numeric confirmation code.
 *   3. Stores ONLY the code (no message body) in Redis with a short TTL,
 *      keyed by alias ID.
 *
 * The dashboard alias detail view can then fetch the code via
 * GET /api/aliases/:id/verification-code (gated by INBOUND_REPLY_ENABLED).
 *
 * Privacy: we store only `{ code, storedAt }` — never sender, subject, or
 * body text beyond the extracted numeric code.
 */

import { redis } from '../../lib/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

// ── Detection patterns ────────────────────────────────────────────────────────

/** From addresses used by Gmail's Send As verification mailer. */
const GMAIL_SENDER_PATTERNS: RegExp[] = [
  /^mail-noreply@google\.com$/i,
  /^noreply@accounts\.google\.com$/i,
  /^send-as-noreply@google\.com$/i,
];

/**
 * Gmail subject patterns for Send-As confirmation.
 * The subject line varies slightly across locales but always contains the
 * confirmation code as a sequence of digits.
 *
 * Known forms (EN):
 *   "Gmail Confirmation - Send email as user@example.com"
 *   "Confirmation - user@example.com"
 *   "Gmail: verify your new email address"          ← older format
 */
const GMAIL_SUBJECT_PATTERNS: RegExp[] = [
  /gmail\s+confirmation/i,
  /send\s+email\s+as\b/i,
  /verify\s+your\s+(new\s+)?email\s+address/i,
  /\bgmail\b.*\bconfirm/i,
];

/**
 * Regex to extract the numeric verification code from the plain-text body.
 * Gmail typically embeds the code as a standalone line of 6–9 digits,
 * sometimes preceded by a label like "Confirmation code:" or just printed
 * in isolation.
 */
const CODE_REGEX = /\b(\d{6,9})\b/;

// ── Redis key helpers ─────────────────────────────────────────────────────────

function redisKey(aliasId: string): string {
  return `sm:send_as_code:${aliasId}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GmailSendAsDetection {
  isGmailSendAs: boolean;
  code?: string;
}

/**
 * Inspect an inbound message's sender and subject to determine whether it is a
 * Gmail Send-As verification email and, if so, extract the numeric code.
 *
 * No body is returned — only the extracted code string.
 */
export function detectGmailSendAs(params: {
  from: string;
  subject?: string;
  textBody?: string;
}): GmailSendAsDetection {
  const { from, subject, textBody } = params;

  // Must match a known Gmail sender.
  const senderMatch = GMAIL_SENDER_PATTERNS.some((pattern) => pattern.test(from.trim()));
  if (!senderMatch) return { isGmailSendAs: false };

  // Must match a known subject pattern (subject may be absent in malformed mail).
  const subjectMatch = subject
    ? GMAIL_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject))
    : false;

  if (!subjectMatch) return { isGmailSendAs: false };

  // Extract the code from the plain-text body.
  const code = textBody ? CODE_REGEX.exec(textBody)?.[1] : undefined;

  return { isGmailSendAs: true, code };
}

/**
 * Persist a Gmail Send-As code for the given alias in Redis.
 * Stores only `{ code, storedAt }` — no message body, no sender address.
 * Auto-expires after `GMAIL_SEND_AS_CODE_TTL_SECONDS`.
 */
export async function storeGmailSendAsCode(aliasId: string, code: string): Promise<void> {
  const ttl = env.GMAIL_SEND_AS_CODE_TTL_SECONDS;
  const value = JSON.stringify({ code, storedAt: new Date().toISOString() });
  await redis.set(redisKey(aliasId), value, 'EX', ttl);
  logger.info({ aliasId, ttlSeconds: ttl }, 'gmail-send-as: stored verification code');
}

/**
 * Retrieve a previously stored Gmail Send-As code for the alias.
 * Returns `null` when no code is present or the TTL has expired.
 * The raw code string is returned; the caller is responsible for delivery.
 */
export async function fetchGmailSendAsCode(aliasId: string): Promise<string | null> {
  const raw = await redis.get(redisKey(aliasId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { code?: string };
    return parsed.code ?? null;
  } catch {
    return null;
  }
}
