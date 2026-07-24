import 'dotenv/config';
import SMTPServer from 'smtp-server';
import { simpleParser } from 'mailparser';
import type { SMTPServerDataStream, SMTPServerSession } from 'smtp-server';
import { handleInbound, parseMailAuthResults } from '../modules/inbound/inbound.service.js';
import { processSmtpBounce } from '../modules/bounces/bounces.service.js';
import { resolveReverseReplyToken } from '../modules/inbound/reverse-reply.service.js';
import { validateReverseReplyAuthenticity } from '../modules/inbound/reverse-reply-validation.js';
import { detectReverseReplyLoop, enforceReverseReplyRateLimit, nextRelayHop } from '../modules/inbound/reverse-reply-guard.js';
import { isLoopSender } from '../modules/abuse/abuse.service.js';
import { buildEncryptedReverseReplyJob, reverseReplyQueue } from '../queues/reverse-reply-jobs.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { getPlatformDomain } from '../config/runtime-config.js';
import { configureRelayKmsFromEnv } from '../modules/smtp-relays/local-kms.js';

configureRelayKmsFromEnv();

// Reverse-reply local-part shape: `forwarded+<token>` where <token> is 32–128
// hex chars (32-byte token => 64 hex). Evaluated only on the platform domain.
const REVERSE_REPLY_LOCAL_PART_REGEX = /^forwarded\+([a-f0-9]{32,128})$/i;

/**
 * MNC-708 Stage 1 reverse-reply branch. Returns true when the recipient was a
 * `forwarded+<token>@<platform-domain>` address and this handler took ownership
 * of it (accept-and-discard on any failure; relay itself is Stage 2 / MNC-711).
 * Returns false when the recipient is not a reverse-reply address, so the caller
 * falls through to the existing alias-forward path unchanged.
 *
 * Fail-closed: unknown / malformed / expired token, or oversized message =>
 * silently accept (return true, enqueue nothing) and log metadata only. No
 * bounce, no DSN, no enumeration.
 */
interface ReverseReplyContext {
  envelopeFrom: string;
  rawMessage: Buffer;
  messageId?: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  headers?: Record<string, string>;
}

function getHeader(headers: Record<string, string> | undefined, key: string): string | undefined {
  if (!headers) return undefined;
  return headers[key] ?? headers[key.toLowerCase()] ?? Object.entries(headers).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
}

async function tryHandleReverseReply(
  localPart: string,
  domain: string,
  sizeBytes: number,
  ctx: ReverseReplyContext,
): Promise<boolean> {
  if (!env.INBOUND_REPLY_ENABLED) return false;

  const platformDomain = getPlatformDomain()?.toLowerCase();
  if (!platformDomain || domain !== platformDomain) return false;

  const match = REVERSE_REPLY_LOCAL_PART_REGEX.exec(localPart);
  if (!match) return false;

  // From here on this recipient belongs to the reverse-reply namespace. Every
  // outcome is accept-and-discard so we never bounce or leak token validity.
  if (sizeBytes > env.INBOUND_REPLY_MAX_MESSAGE_BYTES) {
    logger.warn({ event: 'reverse_reply_token_invalid', reason: 'message_too_large', sizeBytes }, 'Reverse-reply message oversized — dropping');
    return true;
  }

  const token = match[1];
  let binding: Awaited<ReturnType<typeof resolveReverseReplyToken>> = null;
  try {
    binding = await resolveReverseReplyToken(token);
  } catch (err) {
    // DB error: fail closed, drop silently. Never surface token existence.
    logger.warn({ event: 'reverse_reply_token_invalid', reason: 'lookup_error', err: err instanceof Error ? err.message : String(err) }, 'Reverse-reply token lookup failed — dropping');
    return true;
  }

  if (!binding) {
    logger.warn({ event: 'reverse_reply_token_invalid', reason: 'unknown_or_expired' }, 'Reverse-reply token unknown/expired — dropping');
    return true;
  }

  // ── Loop prevention (Auto-Submitted / bulk / our own relay marker) ────────
  // Platform-domain senders are our own relayed mail bouncing back — drop.
  if (isLoopSender(ctx.envelopeFrom, platformDomain)) {
    logger.warn({ event: 'reverse_reply_dropped', reason: 'loop_sender', aliasId: binding.aliasId }, 'Reverse-reply loop (platform sender) — dropping');
    return true;
  }
  const loopReason = detectReverseReplyLoop(ctx.headers);
  if (loopReason) {
    logger.warn({ event: 'reverse_reply_dropped', reason: loopReason, aliasId: binding.aliasId }, 'Reverse-reply loop detected — dropping');
    return true;
  }

  // ── Sender authenticity (never trust From alone) ──────────────────────────
  // Require a genuine mail-auth verdict from our own inbound path (DMARC pass or
  // DKIM pass) AND that the authenticated domain aligns with the token-bound
  // verified recipient. Anything short of a clear pass is dropped silently.
  const auth = parseMailAuthResults(ctx.headers).results;
  const headerFrom = getHeader(ctx.headers, 'From');
  const decision = validateReverseReplyAuthenticity({
    envelopeFrom: ctx.envelopeFrom,
    headerFrom,
    headers: ctx.headers,
    authResults: auth,
    boundOriginalSender: binding.originalSender,
  });
  if (!decision.ok) {
    logger.warn({ event: 'reverse_reply_auth_failed', reason: decision.reason, aliasId: binding.aliasId }, 'Reverse-reply sender authenticity failed — dropping');
    return true;
  }

  // ── Rate limiting (per-alias/day + per-recipient/day) ─────────────────────
  let rateDrop: Awaited<ReturnType<typeof enforceReverseReplyRateLimit>> = null;
  try {
    rateDrop = await enforceReverseReplyRateLimit(binding.aliasId, binding.originalSender);
  } catch (err) {
    // Redis failure: fail closed (drop) rather than risk an unbounded relay.
    logger.warn({ event: 'reverse_reply_dropped', reason: 'rate_limit_error', err: err instanceof Error ? err.message : String(err), aliasId: binding.aliasId }, 'Reverse-reply rate-limit check failed — dropping');
    return true;
  }
  if (rateDrop) {
    logger.warn({ event: 'reverse_reply_dropped', reason: rateDrop, aliasId: binding.aliasId }, 'Reverse-reply rate limit exceeded — dropping');
    return true;
  }

  // ── Enqueue the relay job ────────────────────────────────────────────────
  try {
    const job = buildEncryptedReverseReplyJob({
      tokenId: token,
      aliasId: binding.aliasId,
      originalSender: binding.originalSender,
      replyFrom: ctx.envelopeFrom,
      rawMessage: ctx.rawMessage.toString('base64'),
      subject: ctx.subject,
      textBody: ctx.textBody,
      htmlBody: ctx.htmlBody,
      inReplyTo: getHeader(ctx.headers, 'In-Reply-To'),
      references: getHeader(ctx.headers, 'References'),
      messageId: ctx.messageId,
      hop: nextRelayHop(ctx.headers),
      authResults: decision.authResults as unknown as Record<string, unknown>,
    });
    await reverseReplyQueue.add('relay', job, {
      removeOnComplete: { age: Math.ceil((job.ttl.expiresAt - job.ttl.queuedAt) / 1000), count: 100 },
      removeOnFail: { age: Math.ceil((job.ttl.expiresAt - job.ttl.queuedAt) / 1000), count: 500 },
    });
    logger.info({ event: 'reverse_reply_enqueued', aliasId: binding.aliasId, authenticatedDomain: decision.authenticatedDomain }, 'Reverse-reply validated and enqueued for relay');
  } catch (err) {
    // Enqueue failure: accept-and-discard so the sending MTA doesn't retry. The
    // reply is lost but we never bounce or enumerate.
    logger.error({ event: 'reverse_reply_enqueue_failed', err: err instanceof Error ? err.message : String(err), aliasId: binding.aliasId }, 'Reverse-reply enqueue failed — dropping');
  }
  return true;
}

// smtp-server ships CJS; handle ESM interop
const Server: typeof SMTPServer.SMTPServer =
  (SMTPServer as any).SMTPServer ?? (SMTPServer as any).default?.SMTPServer ?? (SMTPServer as any);

export function createSmtpServer() {
  const server = new Server({
    authOptional: true,
    secure: false,
    disabledCommands: ['AUTH'],

    onData(
      stream: SMTPServerDataStream,
      session: SMTPServerSession,
      callback: (err?: Error | null) => void,
    ) {
      const chunks: Buffer[] = [];
      let sizeBytes = 0;

      stream.on('data', (chunk: Buffer) => {
        sizeBytes += chunk.length;
        if (sizeBytes <= 10 * 1024 * 1024) chunks.push(chunk);
      });

      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);

        let messageId: string | undefined;
        let subject: string | undefined;
        let textBody: string | undefined;
        let htmlBody: string | undefined;
        let headers: Record<string, string> | undefined;
        try {
          const parsed = await simpleParser(raw, { skipHtmlToText: false, skipTextToHtml: false });
          messageId = parsed.messageId ?? undefined;
          subject = parsed.subject ?? undefined;
          textBody = typeof parsed.text === 'string' ? parsed.text : undefined;
          htmlBody = typeof parsed.html === 'string' ? parsed.html : (parsed.textAsHtml ?? undefined);
          headers = {};
          for (const [key, value] of parsed.headers.entries()) {
            headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
          }
        } catch {
          // non-fatal — forward with envelope-only metadata
        }

        const rcptTo = session.envelope.rcptTo;
        if (!rcptTo || rcptTo.length === 0) return callback(new Error('No recipients'));

        const errors: string[] = [];
        for (const rcpt of rcptTo) {
          try {
            const at = rcpt.address.indexOf('@');
            const localPart = at === -1 ? '' : rcpt.address.slice(0, at);
            const domain = at === -1 ? '' : rcpt.address.slice(at + 1).toLowerCase();
            const bounceToken = domain.startsWith('sm-bounces.') ? localPart.match(/^b\+([a-f0-9]{48,128})$/i)?.[1] : undefined;
            if (bounceToken) {
              if (!(await processSmtpBounce(bounceToken, {
                rawMessage: raw,
                sizeBytes,
                envelopeFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
                remoteAddress: session.remoteAddress,
              }))) throw new Error('Invalid bounce DSN');
              continue;
            }
            // Reverse-reply branch (MNC-708 Stage 1): forwarded+<token>@<platform>.
            // Owns the recipient fully (accept-and-discard) when the flag is on
            // and the address matches; otherwise falls through unchanged.
            if (await tryHandleReverseReply(localPart, domain, sizeBytes, {
              envelopeFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
              rawMessage: raw,
              messageId,
              subject,
              textBody,
              htmlBody,
              headers,
            })) {
              continue;
            }
            await handleInbound({
              from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
              to: rcpt.address,
              messageId,
              sizeBytes,
              subject,
              textBody,
              htmlBody,
              headers,
              rawMessage: raw,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const from = session.envelope.mailFrom ? session.envelope.mailFrom.address : '';
            logger.warn({ to: rcpt.address, from, err: msg }, 'Inbound rejected');
            errors.push(msg);
          }
        }

        if (errors.length === rcptTo.length) return callback(new Error(errors[0]));
        callback();
      });

      stream.on('error', (err: Error) => {
        logger.error({ err: err.message }, 'SMTP stream error');
        callback(err);
      });
    },

  });

  return server;
}

// Standalone entry point
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 2525);
const server = createSmtpServer();
server.listen(SMTP_PORT, () => {
  logger.info({ port: SMTP_PORT }, 'SMTP ingress server listening');
});
