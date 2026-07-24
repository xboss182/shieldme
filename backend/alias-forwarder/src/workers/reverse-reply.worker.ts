import 'dotenv/config';
import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { redis } from '../lib/redis.js';
import { db } from '../db/client.js';
import { aliases } from '../db/schema.js';
import { getPlatformDomain, isForwardingEnabled, getOutboundProvider, isOutboundConfigured } from '../config/runtime-config.js';
import { logger } from '../lib/logger.js';
import { sendOutbound } from '../modules/inbound/outbound.service.js';
import { decryptQueuePayload } from '../queues/secure-email-jobs.js';
import { reverseReplyQueueName, type ReverseReplyJob, type ReverseReplyPayload } from '../queues/reverse-reply-jobs.js';
import { buildForwardBanner, buildForwardBannerText } from '../lib/forward-banner.js';
import { env } from '../config/env.js';
import { protectEmailTracking } from '../modules/tracking/tracking-protection.service.js';
import { buildBounceToken, hashBounceToken } from '../modules/smtp-relays/service.js';
import { rewriteRawForwardMessage, type RawForwardMessageResult } from '../modules/inbound/raw-forward-message.js';
import { RELAY_HOP_HEADER, buildRelayHopHeaderValue } from '../modules/inbound/reverse-reply-guard.js';
import { configureRelayKmsFromEnv } from '../modules/smtp-relays/local-kms.js';

configureRelayKmsFromEnv();

function headerValue(value: string): string {
  return value.replace(/[\r\n]/g, ' ').slice(0, 500);
}

/**
 * Build the display From for a relayed reply: `"<alias> via ShieldMe" <alias@platform>`.
 * The From MUST be on the platform apex (`shieldme.cc`) so ShieldMe DKIM signing
 * (d=shieldme.cc) yields strict DMARC alignment under the live
 * `p=quarantine; adkim=s; aspf=s` policy (MNC-709 finding). Do NOT move to a
 * subdomain — that breaks strict alignment on day one.
 */
function relayFrom(aliasLocalPart: string, platformDomain: string): string {
  const identity = `${aliasLocalPart}@${platformDomain}`;
  return `${aliasLocalPart} via ShieldMe <${identity}>`;
}

/**
 * ReverseReplyJob processor (MNC-708 Stage 2).
 *
 * Re-sends a verified recipient's reply to the original sender as
 * `From: alias@shieldme.cc`, inheriting the full forwarding hardening verbatim:
 *  - MailBaby relay (X-AuthUser injected by MailBaby from MAILBABY_SMTP_USERNAME,
 *    ShieldMe DKIM d=shieldme.cc via MAILBABY_DKIM_* — same transport as forwarding).
 *  - Envelope MAIL FROM on `b+<bounceToken>@sm-bounces.<platform>` for SPF alignment
 *    and bounce capture.
 *  - Tracking protection + banner injection via the raw-MIME rewrite path.
 *  - Threading (In-Reply-To / References / Subject) preserved.
 *  - Reply-To set to the alias reply address so further replies stay in the loop.
 *  - X-ShieldMe-Relay hop marker for loop prevention.
 */
async function processReverseReplyJob(job: Job<ReverseReplyJob>) {
  let payload: ReverseReplyPayload;
  try {
    payload = decryptQueuePayload<ReverseReplyPayload>(job.data);
  } catch (err) {
    logger.warn({ jobId: job.id, err: err instanceof Error ? err.message : String(err) }, 'Dropping expired/undecryptable reverse-reply payload');
    return;
  }

  // Flag + kill-switch: inert when reverse-reply is disabled or forwarding is off.
  if (!env.INBOUND_REPLY_ENABLED) {
    logger.warn({ jobId: job.id }, 'Reverse-reply disabled — dropping job');
    return;
  }
  if (!isForwardingEnabled()) {
    logger.warn({ jobId: job.id }, 'Forwarding globally disabled — dropping reverse-reply job');
    return;
  }

  const provider = getOutboundProvider();
  if (!isOutboundConfigured(provider)) {
    logger.warn({ jobId: job.id, provider }, 'Outbound provider not configured — dropping reverse-reply job');
    return;
  }

  const platformDomain = getPlatformDomain();
  if (!platformDomain) {
    logger.warn({ jobId: job.id }, 'Platform domain not configured — dropping reverse-reply job');
    return;
  }

  const alias = await db.query.aliases.findFirst({
    where: eq(aliases.id, payload.aliasId),
    with: { domain: { columns: { domain: true, isActive: true } } },
  });
  if (!alias) {
    logger.warn({ jobId: job.id, aliasId: payload.aliasId }, 'Reverse-reply alias not found — dropping');
    return;
  }
  if (alias.status !== 'active') {
    logger.warn({ jobId: job.id, aliasId: payload.aliasId, status: alias.status }, 'Reverse-reply alias inactive — dropping');
    return;
  }

  const aliasReplyAddress = `forwarded+${payload.tokenId}@${platformDomain}`;
  const from = relayFrom(alias.localPart, platformDomain);
  const to = payload.originalSender;
  const subject = payload.subject ?? '(no subject)';

  // ── Banner + tracking protection (verbatim from forwarding.worker) ────────
  const dashboardUrl = `https://app.${platformDomain}/aliases`;
  const rawText = payload.textBody ?? '';
  const rawHtml = payload.htmlBody ?? undefined;
  const rawHtmlForProtection = rawHtml ?? `<pre style="font-family:inherit;white-space:pre-wrap;">${rawText.replace(/[&]/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  const trackingConfig = {
    enabled: !['0', 'false', 'no'].includes(env.TRACKING_PROTECTION_ENABLED.toLowerCase()),
    mode: env.TRACKING_PROTECTION_MODE,
  };
  const trackingProtection = protectEmailTracking(rawHtmlForProtection, trackingConfig);
  const trackingNotice = trackingProtection.metadata.enabled
    ? { enabled: true, pixelsRemoved: trackingProtection.metadata.pixelsRemoved, linksRewritten: trackingProtection.metadata.linksRewritten }
    : undefined;
  const bannerOpts = { matchedAlias: `${alias.localPart}@${platformDomain}`, dashboardUrl, trackingProtection: trackingNotice };
  const bannerHtml = buildForwardBanner(bannerOpts);
  const bannerText = buildForwardBannerText(bannerOpts);

  const composedText = bannerText + rawText;
  let composedHtml: string;
  if (rawHtml) {
    composedHtml = trackingProtection.html.toLowerCase().includes('<body')
      ? trackingProtection.html.replace(/(<body[^>]*>)/i, `$1\n${bannerHtml}`)
      : bannerHtml + trackingProtection.html;
  } else {
    composedHtml = bannerHtml + trackingProtection.html;
  }

  // ── Headers: threading, hop marker, provenance ───────────────────────────
  const headers: Record<string, string> = {
    'X-Original-Sender': headerValue(payload.replyFrom),
    'X-Forwarded-For-Alias': headerValue(`${alias.localPart}@${platformDomain}`),
    [RELAY_HOP_HEADER]: buildRelayHopHeaderValue(payload.hop),
    // Signal this is an automated relay so downstream auto-responders stay quiet
    // and any reply we get is routed back through the alias, not auto-generated.
    'Auto-Submitted': 'auto-forwarded',
  };
  if (payload.inReplyTo) headers['In-Reply-To'] = headerValue(payload.inReplyTo);
  if (payload.references) headers['References'] = headerValue(payload.references);
  if (payload.messageId) headers['X-Original-Message-Id'] = headerValue(payload.messageId);
  if (trackingProtection.metadata.enabled) {
    headers['X-ShieldMe-Tracking-Protection'] = 'enabled';
    headers['X-ShieldMe-Tracking-Pixels-Removed'] = String(trackingProtection.metadata.pixelsRemoved);
    headers['X-ShieldMe-Tracking-Links-Rewritten'] = String(trackingProtection.metadata.linksRewritten);
  }

  // ── Raw-MIME rewrite (banner + tracking + safe header rewrite) ────────────
  const rawResult: RawForwardMessageResult | undefined = payload.rawMessage
    ? rewriteRawForwardMessage({
        rawMessage: Buffer.from(payload.rawMessage, 'base64'),
        from,
        to,
        replyTo: aliasReplyAddress,
        originalFrom: payload.replyFrom,
        originalMessageId: payload.messageId,
        forwardedAlias: `${alias.localPart}@${platformDomain}`,
        messageIdDomain: platformDomain,
        headers,
        trackingProtection: trackingConfig,
        bannerHtml,
        bannerText,
      })
    : undefined;
  const rawMessage = rawResult?.message;
  if (rawResult?.trackingMetadata.enabled) {
    headers['X-ShieldMe-Tracking-Protection'] = 'enabled';
    headers['X-ShieldMe-Tracking-Pixels-Removed'] = String(rawResult.trackingMetadata.pixelsRemoved);
    headers['X-ShieldMe-Tracking-Links-Rewritten'] = String(rawResult.trackingMetadata.linksRewritten);
  }

  const isMailBaby = provider === 'mailbaby';
  if (isMailBaby && !rawMessage) {
    // MailBaby requires the raw-MIME path for correct DKIM/threading. A reply
    // without raw MIME can't preserve the original signature-friendly body, so
    // drop it rather than sending a degraded, likely-to-spam message.
    logger.warn({ jobId: job.id, aliasId: payload.aliasId }, 'Reverse-reply raw message unavailable for MailBaby — dropping');
    return;
  }

  const bounceToken = buildBounceToken();
  const envelopeFrom = `b+${bounceToken}@sm-bounces.${platformDomain}`;

  try {
    const outboundMessageId = await sendOutbound({
      from,
      to,
      subject,
      replyTo: aliasReplyAddress,
      textBody: composedText,
      htmlBody: composedHtml,
      headers,
      rawMessage,
      envelopeFrom,
    }, { pinnedProvider: provider });
    // Bounce token hash is retained on the token binding's out-of-band store via
    // the standard sm-bounces path; log for traceability.
    logger.info({
      jobId: job.id,
      aliasId: payload.aliasId,
      outboundMessageId,
      hop: payload.hop,
      bounceTokenHash: hashBounceToken(bounceToken),
    }, 'Reverse-reply relayed to original sender');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'reverse_reply_send_failed';
    const permanent = /invalid|suppressed|blocked|complaint|permanent|5\d\d|auth|tls|certificate|dns|unsafe/.test(message.toLowerCase());
    const exhausted = job.attemptsMade + 1 >= 3;
    logger.warn({ jobId: job.id, aliasId: payload.aliasId, err: message, permanent, attempt: job.attemptsMade + 1 }, 'Reverse-reply relay failed');
    if (permanent || exhausted) return; // give up silently — no bounce, no enumeration
    throw err; // transient: let BullMQ retry with backoff
  }
}

const worker = new Worker<ReverseReplyJob>(
  reverseReplyQueueName,
  processReverseReplyJob,
  { connection: redis, concurrency: 5 },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Reverse-reply job failed');
});
worker.on('error', (err) => {
  logger.error({ err: err.message }, 'Reverse-reply worker error');
});

logger.info('Reverse-reply worker started');

export { processReverseReplyJob };
