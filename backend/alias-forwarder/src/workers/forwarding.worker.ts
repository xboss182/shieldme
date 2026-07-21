import 'dotenv/config';
import { createServer } from 'node:http';
import { Worker, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { redis } from '../lib/redis.js';
import { db } from '../db/client.js';
import { aliases, mailLogs } from '../db/schema.js';
import { getPlatformDomain, isForwardingEnabled, getOutboundProvider, isOutboundConfigured } from '../config/runtime-config.js';
import { logger } from '../lib/logger.js';
import { isPermanentOutboundError, sendOutbound } from '../modules/inbound/outbound.service.js';
import { emailForwardingQueueName, type EmailForwardingJob, type EmailForwardingPayload } from '../queues/email-jobs.js';
import { decryptQueuePayload } from '../queues/secure-email-jobs.js';
import { buildForwardBanner, buildForwardBannerText } from '../lib/forward-banner.js';
import { getArmoredKeyForRecipient, encryptWithPgpKey } from '../modules/pgp/pgp.service.js';
import { assertByoSmtpAllowed, assertMonthlyForwardAllowed, assertOutboundProviderAllowed, PlanLimitError } from '../modules/plans/plans.js';
import { buildSpamHeaders, tagSubject, type SpamScanMetadata } from '../modules/spam/spam-scanner.service.js';
import { env } from '../config/env.js';
import { protectEmailTracking } from '../modules/tracking/tracking-protection.service.js';
import { recordTtiForwarded } from '../modules/tti/tti.service.js';
import { assertByoSmtpPilotQuota, buildBounceToken, hashBounceToken, recordCustomSmtpFailure, recordCustomSmtpSuccess, resolveCustomSmtpDelivery } from '../modules/smtp-relays/service.js';
import { sendSmtpRelayMessage } from '../modules/smtp-relays/transport.js';
import { acquireRelaySlot } from '../modules/smtp-relays/concurrency.js';
import { relayFailuresTotal, relayMetrics, relayMetricsContentType, relayQueueWaitSeconds, relayRetriesTotal, relaySubmissionsTotal } from '../modules/smtp-relays/metrics.js';
import { configureRelayKmsFromEnv } from '../modules/smtp-relays/local-kms.js';

configureRelayKmsFromEnv();

function replyToFromEnvelope(value: string): string | undefined {
  const mailbox = value.trim();
  return /^[^\s<>@\"]+@[^\s<>@\"]+\.[^\s<>@\"]+$/.test(mailbox) ? mailbox : undefined;
}

function smtpForwardFrom(value: string, identity: string): string {
  const display = value.replace(/[^\p{L}\p{N} ._-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return display ? `"${display} via ShieldMe" <${identity}>` : `ShieldMe <${identity}>`;
}

function headerValue(value: string): string {
  return value.replace(/[\r\n]/g, ' ').slice(0, 500);
}

function customSmtpFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/auth|login|credential/.test(message)) return 'custom_smtp_auth_failure';
  if (/tls|certificate|starttls/.test(message)) return 'custom_smtp_tls_failure';
  if (/dkim|signing/.test(message)) return 'custom_smtp_signing_failure';
  if (/kms|secret_decrypt/.test(message)) return 'custom_smtp_secret_decrypt_failure';
  if (/dns|host|unsafe/.test(message)) return 'custom_smtp_ssrf_failure';
  if (/timeout|connect|socket|greeting/.test(message)) return 'custom_smtp_connection_failure';
  return 'custom_smtp_send_failure';
}

async function processForwardingJob(job: Job<EmailForwardingJob>) {
  let payload: EmailForwardingPayload;
  try {
    payload = decryptQueuePayload<EmailForwardingPayload>(job.data);
  } catch (err) {
    logger.warn({ jobId: job.id, err }, 'Dropping expired or undecryptable forwarding job payload');
    return;
  }

  const { aliasId, messageId: logId } = payload;

  logger.info({ jobId: job.id, logId, aliasId }, 'Processing forwarding job');

  const customSmtp = payload.routeMode === 'custom_smtp';
  const effectiveProvider = payload.outboundProvider;

  if (!customSmtp) {
    if (!effectiveProvider) {
      logger.warn({ jobId: job.id, logId }, 'Legacy unpinned forwarding job rejected — missing outbound provider');
      await db.update(mailLogs).set({
        status: 'failed',
        failureType: 'permanent',
        failureReason: 'unpinned_legacy_job_rejected',
        rejectionReason: 'unpinned_legacy_job_rejected',
        updatedAt: new Date(),
      }).where(eq(mailLogs.id, logId));
      return;
    }

    if (!isOutboundConfigured(effectiveProvider)) {
      logger.warn({ jobId: job.id, logId, provider: effectiveProvider }, 'Pinned outbound provider not configured — forwarding skipped');
      await db.update(mailLogs).set({
        status: 'failed',
        outboundProvider: effectiveProvider,
        failureType: 'permanent',
        failureReason: 'outbound_not_configured',
        rejectionReason: 'outbound_not_configured',
        updatedAt: new Date(),
      }).where(eq(mailLogs.id, logId));
      return;
    }
  }

  // ── Global kill-switch check ────────────────────────────────────────────
  if (!isForwardingEnabled()) {
    logger.warn({ jobId: job.id, logId }, 'Forwarding globally disabled — skipping');
    await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'forwarding_disabled', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    return;
  }

  const log = await db.query.mailLogs.findFirst({ where: eq(mailLogs.id, logId) });
  if (!log) { logger.error({ logId }, 'Mail log not found — skipping'); return; }

  const alias = await db.query.aliases.findFirst({
    where: eq(aliases.id, aliasId),
    with: {
      domain: { columns: { domain: true, isActive: true } },
      recipient: { columns: { id: true, email: true, status: true, isActive: true } },
      owner: { columns: { id: true, isActive: true } },
    },
  });

  if (!alias) {
    await db.update(mailLogs).set({ status: 'failed', rejectionReason: 'alias_not_found', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    return;
  }

  const recipient = (alias as any).recipient as { id: string; email: string; status: string; isActive: boolean };
  const domain = (alias as any).domain as { domain: string; isActive: boolean };
  const owner = (alias as any).owner as { id: string; isActive: boolean } | undefined;
  const ownerId = owner?.id ?? alias.ownerId;

  if (owner && !owner.isActive) {
    await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'user_suspended', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    logger.warn({ aliasId, logId }, 'Alias owner suspended — dropping');
    return;
  }

  try {
    await assertMonthlyForwardAllowed(ownerId);
    if (payload.routeMode === 'custom_smtp') {
      await assertByoSmtpAllowed(ownerId);
    }
    else await assertOutboundProviderAllowed(ownerId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'plan_limit_exceeded', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
      logger.warn({ aliasId, logId, userId: ownerId, err: err.message }, 'Plan limit blocked forwarding');
      return;
    }
    throw err;
  }

  if (alias.status !== 'active' || !domain.isActive || recipient.status !== 'verified' || !recipient.isActive) {
    await db.update(mailLogs).set({ status: 'failed', rejectionReason: 'state_changed_before_delivery', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    logger.warn({ aliasId, logId }, 'Alias/recipient state changed — dropping');
    return;
  }

  const platformDomain = getPlatformDomain();
  if (!platformDomain) {
    await db.update(mailLogs).set({ status: 'failed', rejectionReason: 'platform_domain_not_configured', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
    return;
  }

  // ── PGP mode check ────────────────────────────────────────────────────────
  const pgpMode = alias.pgpMode ?? 'none';
  let pgpArmoredKey: string | null = null;

  if (pgpMode !== 'none') {
    pgpArmoredKey = await getArmoredKeyForRecipient(recipient.id);
    if (!pgpArmoredKey && pgpMode === 'required') {
      await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'pgp_key_required', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
      logger.warn({ aliasId, logId }, 'PGP key required but not configured — rejecting');
      return;
    }
  }

  const originalFrom = payload.originalFrom ?? log.envelopeFrom;
  const forwardFrom = originalFrom
    ? `${originalFrom.replace(/[<>"]/g, '')} via ${log.envelopeTo} <forwarded+${alias.localPart}@${platformDomain}>`
    : `forwarded+${alias.localPart}@${platformDomain}`;

  const spamScan = payload.spamScan as SpamScanMetadata | undefined;
  const baseSubject = payload.subject ?? `[Forwarded] Message to ${log.envelopeTo}`;
  const subject = spamScan ? tagSubject(baseSubject, spamScan) : baseSubject;

  const dashboardUrl = `https://app.${platformDomain}/aliases`;

  const rawText = payload.textBody ?? [
    `This message was forwarded by the alias ${log.envelopeTo}.`,
    `Original sender: ${originalFrom}`,
    `Original message-id: ${log.externalMessageId ?? '(unknown)'}`,
  ].join('\n');

  const rawHtml = payload.htmlBody ?? undefined;
  const rawHtmlForProtection = rawHtml ?? `<pre style="font-family:inherit;white-space:pre-wrap;">${rawText.replace(/[&]/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
  const trackingProtection = protectEmailTracking(rawHtmlForProtection, {
    enabled: !['0', 'false', 'no'].includes(env.TRACKING_PROTECTION_ENABLED.toLowerCase()),
    mode: env.TRACKING_PROTECTION_MODE,
  });
  const trackingNotice = trackingProtection.metadata.enabled
    ? {
        enabled: true,
        pixelsRemoved: trackingProtection.metadata.pixelsRemoved,
        linksRewritten: trackingProtection.metadata.linksRewritten,
      }
    : undefined;
  const bannerOpts = { matchedAlias: log.envelopeTo, dashboardUrl, trackingProtection: trackingNotice };
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

  // ── Encrypt if PGP key available ──────────────────────────────────────────
  let textBody = composedText;
  let htmlBody: string | undefined = composedHtml;
  let pgpEncrypted = false;

  if (pgpArmoredKey) {
    try {
      const encryptedText = await encryptWithPgpKey(pgpArmoredKey, composedText);
      textBody = encryptedText;
      htmlBody = '<pre style="font-family:monospace;white-space:pre-wrap;">' + encryptedText + '</pre>';
      pgpEncrypted = true;
      logger.info({ logId, aliasId }, 'Email body encrypted with PGP');
    } catch (err) {
      if (pgpMode === 'required') {
        logger.error({ logId, aliasId, err }, 'PGP encryption failed — aborting delivery');
        await db.update(mailLogs).set({ status: 'rejected', rejectionReason: 'pgp_encryption_failed', updatedAt: new Date() }).where(eq(mailLogs.id, logId));
        return;
      }
      logger.warn({ logId, aliasId, err }, 'PGP encryption failed — falling back to plaintext');
    }
  }

  const headers: Record<string, string> = {
    'X-Original-Sender': headerValue(originalFrom),
    'X-Forwarded-For-Alias': headerValue(log.envelopeTo),
  };
  if (log.externalMessageId) headers['X-Original-Message-Id'] = headerValue(log.externalMessageId);
  if (pgpEncrypted) headers['X-PGP-Encrypted'] = 'true';
  if (trackingProtection.metadata.enabled) {
    headers['X-ShieldMe-Tracking-Protection'] = 'enabled';
    headers['X-ShieldMe-Tracking-Pixels-Removed'] = String(trackingProtection.metadata.pixelsRemoved);
    headers['X-ShieldMe-Tracking-Links-Rewritten'] = String(trackingProtection.metadata.linksRewritten);
  }
  if (spamScan) Object.assign(headers, buildSpamHeaders(spamScan));

  if (customSmtp && job.attemptsMade > 0) relayRetriesTotal.inc();
  if (customSmtp && log.createdAt instanceof Date) relayQueueWaitSeconds.observe(Math.max(0, (Date.now() - log.createdAt.getTime()) / 1_000));
  let outboundMessageId: string;
  try {
    if (customSmtp) {
      if (!payload.relayId || !payload.credentialVersion) throw new Error('custom_smtp_route_snapshot_missing');
      const { relay, transport } = await resolveCustomSmtpDelivery(ownerId, payload.relayId, payload.credentialVersion, payload.halfOpenProbe);
      const release = await acquireRelaySlot(ownerId, relay.id);
      try {
        await assertByoSmtpPilotQuota(ownerId);
        const bounceToken = buildBounceToken();
        const envelopeFrom = `b+${bounceToken}@sm-bounces.${domain.domain}`;
        const identity = `${relay.identityLocalPart}@${domain.domain}`;
        outboundMessageId = await sendSmtpRelayMessage(transport, {
          from: smtpForwardFrom(originalFrom, identity),
          to: recipient.email,
          subject,
          replyTo: replyToFromEnvelope(originalFrom),
          textBody,
          htmlBody,
          headers,
          envelopeFrom,
        });
        await recordCustomSmtpSuccess(relay.id);
        relaySubmissionsTotal.inc();
        await db.update(mailLogs).set({ bounceTokenHash: hashBounceToken(bounceToken), bounceExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }).where(eq(mailLogs.id, logId));
      } finally {
        await release();
      }
    } else {
      outboundMessageId = await sendOutbound({
        from: forwardFrom,
        to: recipient.email,
        subject,
        replyTo: replyToFromEnvelope(originalFrom),
        textBody,
        htmlBody,
        headers,
      }, { pgpRequired: pgpMode === 'required', pgpEncrypted, pinnedProvider: effectiveProvider });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'outbound_send_failed';
    const customRouteUnavailable = /custom_smtp_route_snapshot_missing|relay_unavailable|credential_version_unavailable|BYO SMTP is unavailable|Relay credentials are unavailable/.test(message);
    const permanent = customRouteUnavailable || isPermanentOutboundError(err) || /invalid|suppressed|blocked|complaint|bounce|permanent|5\d\d|auth|tls|certificate|dns|unsafe/.test(message);
    const exhausted = job.attemptsMade + 1 >= 3;
    const failureCode = customSmtp ? customSmtpFailureCode(err) : message.slice(0, 80);
    if (customSmtp) relayFailuresTotal.inc({ phase: failureCode.replace('custom_smtp_', '').replace('_failure', '') });
    if (customSmtp && payload.relayId && !customRouteUnavailable) await recordCustomSmtpFailure(payload.relayId, failureCode);
    await db.update(mailLogs).set({
      status: permanent || exhausted ? 'failed' : 'queued',
      outboundProvider: customSmtp ? 'custom_smtp' : effectiveProvider,
      failureType: permanent || exhausted ? 'permanent' : 'transient',
      failureReason: customSmtp ? failureCode : message.slice(0, 500),
      rejectionReason: customSmtp ? failureCode : message.slice(0, 500),
      smtpResponseClass: customSmtp ? (permanent ? '5xx' : '4xx') : null,
      attemptCount: job.attemptsMade + 1,
      nextAttemptAt: permanent || exhausted ? null : new Date(Date.now() + 30_000 * 2 ** job.attemptsMade),
      updatedAt: new Date(),
    }).where(eq(mailLogs.id, logId));
    if (permanent || exhausted || (customSmtp && payload.halfOpenProbe)) return;
    throw err;
  }

  await db.update(mailLogs).set({ status: 'delivered', resendMessageId: customSmtp ? null : outboundMessageId, providerMessageId: outboundMessageId, outboundProvider: customSmtp ? 'custom_smtp' : effectiveProvider, smtpResponseClass: customSmtp ? '2xx' : null, attemptCount: job.attemptsMade + 1, trackingProtection: trackingProtection.metadata, updatedAt: new Date() }).where(eq(mailLogs.id, logId));
  const ttiProbeToken = subject.match(/\[shieldme-tti:([a-zA-Z0-9_-]{8,128})\]/)?.[1];
  if (ttiProbeToken) {
    await recordTtiForwarded({
      probeToken: ttiProbeToken,
      externalMessageId: log.externalMessageId,
      providerMessageId: outboundMessageId,
      provider: getOutboundProvider(),
    });
  }
  logger.info({ logId, outboundMessageId, pgpEncrypted, ttiProbe: Boolean(ttiProbeToken) }, 'Mail forwarding complete');
}

const worker = new Worker<EmailForwardingJob>(
  emailForwardingQueueName,
  processForwardingJob,
  { connection: redis, concurrency: 5 },
);

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Forwarding job failed');
});
worker.on('error', (err) => {
  logger.error({ err: err.message }, 'Worker error');
});

const metricsPort = env.RELAY_METRICS_PORT;
if (metricsPort) {
  createServer(async (_req, res) => {
    try {
      res.writeHead(200, { 'Content-Type': relayMetricsContentType });
      res.end(await relayMetrics());
    } catch {
      res.writeHead(503).end();
    }
  }).listen(metricsPort, '127.0.0.1');
}

logger.info('Forwarding worker started');
