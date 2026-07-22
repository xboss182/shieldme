import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aliases, domains, mailLogs, users } from '../../db/schema.js';
import { buildEncryptedEmailForwardingJob, emailForwardingQueue } from '../../queues/email-jobs.js';
import { logger } from '../../lib/logger.js';
import { getOutboundProvider, getPlatformDomain } from '../../config/runtime-config.js';
import { assertCustomRelayCanAccept, buildBounceToken, SmtpRelayError } from '../smtp-relays/service.js';
import {
  AbuseError,
  checkRateLimits,
  isSenderBlocked,
  isRecipientSuppressed,
  isLoopSender,
  detectAutoReplyHeaders,
  isDuplicate,
} from '../abuse/abuse.service.js';
import { isForwardingEnabled } from '../../config/runtime-config.js';
import { scanInboundMail } from '../spam/spam-scanner.service.js';

export class InboundError extends Error {
  constructor(message: string, public statusCode = 550) {
    super(message);
  }
}

export interface InboundEnvelope {
  from: string;
  to: string;
  messageId?: string;
  sizeBytes?: number;
  /** Optional parsed headers for loop/auto-reply detection */
  headers?: Record<string, string>;
  /** Parsed mail authentication signals from Authentication-Results, when present. */
  authResults?: MailAuthResults;
  /** Original email subject */
  subject?: string;
  /** Original email plain-text body */
  textBody?: string;
  /** Original email HTML body */
  htmlBody?: string;
  /** Raw RFC 822 message for spam scanning; never persisted. */
  rawMessage?: Buffer | string;
}

export interface MailAuthResults extends Record<string, unknown> {
  source: 'authentication-results-header' | 'smtp-session-unavailable';
  spf: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror' | 'unknown';
  dkim: 'pass' | 'fail' | 'neutral' | 'none' | 'temperror' | 'permerror' | 'unknown';
  dmarc: 'pass' | 'fail' | 'bestguesspass' | 'none' | 'temperror' | 'permerror' | 'unknown';
  raw?: string;
}

interface MailLogInsert {
  aliasId?: string | null;
  outboundRouteMode?: 'platform' | 'custom_smtp';
  smtpRelayId?: string | null;
  envelopeFrom: string;
  envelopeTo: string;
  forwardedTo?: string | null;
  externalMessageId?: string | null;
  status: 'queued' | 'delivered' | 'failed' | 'rejected';
  rejectionReason?: string | null;
  sizeBytes?: number | null;
  authResults?: MailAuthResults | null;
  authFailureCount?: number;
  spamScan?: Record<string, unknown> | null;
  spamScore?: number;
  spamCategory?: string | null;
  spamAction?: string | null;
  outboundProvider?: 'mailbaby' | 'resend' | 'ses' | 'custom_smtp' | null;
}


function normalizeHeaderKey(headers: Record<string, string>, key: string): string | undefined {
  return headers[key] ?? headers[key.toLowerCase()] ?? Object.entries(headers).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
}

function parseAuthToken(raw: string, token: 'spf' | 'dkim' | 'dmarc'): string {
  for (const part of raw.split(';')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed.startsWith(`${token}=`)) return trimmed.slice(token.length + 1).split(/\s+/)[0] ?? 'unknown';
  }
  return 'unknown';
}

function countAuthFailures(results: MailAuthResults | null): number {
  if (!results) return 0;
  return [results.spf, results.dkim, results.dmarc].filter((value) => ['fail', 'softfail', 'permerror'].includes(value)).length;
}

export function parseMailAuthResults(headers?: Record<string, string>): { results: MailAuthResults | null; failureCount: number } {
  const raw = headers ? normalizeHeaderKey(headers, 'Authentication-Results') : undefined;
  if (!raw) {
    const results: MailAuthResults = { source: 'smtp-session-unavailable', spf: 'unknown', dkim: 'unknown', dmarc: 'unknown' };
    return { results, failureCount: 0 };
  }

  const results: MailAuthResults = {
    source: 'authentication-results-header',
    spf: parseAuthToken(raw, 'spf') as MailAuthResults['spf'],
    dkim: parseAuthToken(raw, 'dkim') as MailAuthResults['dkim'],
    dmarc: parseAuthToken(raw, 'dmarc') as MailAuthResults['dmarc'],
    raw: raw.slice(0, 1000),
  };
  return { results, failureCount: countAuthFailures(results) };
}

async function insertMailLog(data: MailLogInsert) {
  return db
    .insert(mailLogs)
    .values({
      aliasId: data.aliasId ?? null,
      outboundRouteMode: data.outboundRouteMode ?? 'platform',
      smtpRelayId: data.smtpRelayId ?? null,
      envelopeFrom: data.envelopeFrom,
      envelopeTo: data.envelopeTo,
      forwardedTo: data.forwardedTo ?? null,
      externalMessageId: data.externalMessageId ?? null,
      status: data.status,
      rejectionReason: data.rejectionReason ?? null,
      sizeBytes: data.sizeBytes ?? null,
      authResults: data.authResults ?? null,
      authFailureCount: data.authFailureCount ?? 0,
      spamScan: data.spamScan ?? null,
      spamScore: data.spamScore ?? 0,
      spamCategory: data.spamCategory ?? null,
      spamAction: data.spamAction ?? null,
      outboundProvider: data.outboundProvider ?? null,
    })
    .returning({ id: mailLogs.id });
}

export async function resolveAlias(to: string) {
  const atIdx = to.lastIndexOf('@');
  if (atIdx === -1) return null;

  const localPart = to.slice(0, atIdx).toLowerCase();
  const domainName = to.slice(atIdx + 1).toLowerCase();

  const domain = await db.query.domains.findFirst({
    where: and(
      eq(domains.domain, domainName),
      eq(domains.status, 'verified'),
      eq(domains.isActive, true),
    ),
  });
  if (!domain) return null;

  const alias = await db.query.aliases.findFirst({
    where: and(eq(aliases.localPart, localPart), eq(aliases.domainId, domain.id)),
    with: {
      owner: { columns: { id: true, isActive: true } },
      recipient: {
        columns: { id: true, email: true, status: true, isActive: true },
      },
    },
  });
  if (!alias) return null;

  return { alias, domain };
}

export async function handleInbound(
  envelope: InboundEnvelope,
): Promise<{ jobId: string; logId: string }> {
  const auth = envelope.authResults ? { results: envelope.authResults, failureCount: countAuthFailures(envelope.authResults) } : parseMailAuthResults(envelope.headers);
  const baseLog = {
    envelopeFrom: envelope.from,
    envelopeTo: envelope.to,
    externalMessageId: envelope.messageId ?? null,
    sizeBytes: envelope.sizeBytes ?? null,
    authResults: auth.results,
    authFailureCount: auth.failureCount,
  };

  if ((envelope.sizeBytes ?? 0) > 10 * 1024 * 1024) {
    await insertMailLog({ ...baseLog, status: 'rejected', rejectionReason: 'message_too_large' });
    throw new InboundError('Message exceeds the 10 MB limit', 552);
  }

  // ── Global forwarding kill-switch ────────────────────────────────────────
  if (!isForwardingEnabled()) {
    await insertMailLog({ ...baseLog, status: 'rejected', rejectionReason: 'forwarding_disabled' });
    throw new InboundError('Forwarding is globally disabled by admin');
  }

  // ── Loop prevention: reject mail from our own platform domain ────────────
  const platformDomain = getPlatformDomain();
  if (platformDomain && isLoopSender(envelope.from, platformDomain)) {
    await insertMailLog({ ...baseLog, status: 'rejected', rejectionReason: 'loop_sender' });
    throw new InboundError('Loop detected: sender is platform domain');
  }

  // ── Auto-reply / mailing-list loop header detection ──────────────────────
  if (envelope.headers) {
    const loopReason = detectAutoReplyHeaders(envelope.headers);
    if (loopReason) {
      await insertMailLog({ ...baseLog, status: 'rejected', rejectionReason: loopReason });
      throw new InboundError('Auto-reply or loop header detected');
    }
  }

  // ── Deduplication by Message-ID ──────────────────────────────────────────
  if (envelope.messageId) {
    const dup = await isDuplicate(envelope.messageId);
    if (dup) {
      logger.info({ messageId: envelope.messageId }, 'Duplicate message-id — dropping');
      throw new InboundError('Duplicate message', 250); // treat as accepted to stop retries
    }
  }

  const resolved = await resolveAlias(envelope.to);

  if (!resolved) {
    await insertMailLog({ ...baseLog, status: 'rejected', rejectionReason: 'alias_not_found' });
    throw new InboundError(`No active alias for ${envelope.to}`);
  }

  const { alias } = resolved;
  const owner = (alias as any).owner as { id: string; isActive: boolean };

  if (owner && !owner.isActive) {
    await insertMailLog({ ...baseLog, aliasId: alias.id, status: 'rejected', rejectionReason: 'user_suspended' });
    throw new InboundError('Alias owner is suspended', 403);
  }


  if (alias.status === 'disabled') {
    await insertMailLog({ ...baseLog, aliasId: alias.id, status: 'rejected', rejectionReason: 'alias_disabled' });
    throw new InboundError(`Alias ${envelope.to} is disabled`);
  }

  if (alias.status === 'deleted') {
    await insertMailLog({ ...baseLog, aliasId: alias.id, status: 'rejected', rejectionReason: 'alias_deleted' });
    throw new InboundError(`Alias ${envelope.to} no longer exists`);
  }

  const recipient = (alias as any).recipient as {
    id: string; email: string; status: string; isActive: boolean;
  };

  if (recipient.status !== 'verified' || !recipient.isActive) {
    await insertMailLog({ ...baseLog, aliasId: alias.id, status: 'rejected', rejectionReason: 'recipient_unverified' });
    throw new InboundError('Forwarding recipient not available');
  }

  // ── Suppression check ────────────────────────────────────────────────────
  if (await isRecipientSuppressed(recipient.email)) {
    await insertMailLog({ ...baseLog, aliasId: alias.id, status: 'rejected', rejectionReason: 'recipient_suppressed' });
    throw new InboundError('Recipient is on suppression list');
  }

  // ── Sender blocklist ─────────────────────────────────────────────────────
  if (await isSenderBlocked(alias.id, envelope.from)) {
    await insertMailLog({ ...baseLog, aliasId: alias.id, status: 'rejected', rejectionReason: 'sender_blocked' });
    throw new InboundError('Sender is blocked for this alias');
  }

  // ── Rate limits ──────────────────────────────────────────────────────────
  try {
    await checkRateLimits(alias.id, alias.ownerId);
  } catch (err) {
    if (err instanceof AbuseError) {
      await insertMailLog({ ...baseLog, aliasId: alias.id, status: 'rejected', rejectionReason: 'rate_limited' });
      throw new InboundError(err.message, err.statusCode);
    }
    throw err;
  }

  const spamScan = await scanInboundMail({
    from: envelope.from,
    to: envelope.to,
    subject: envelope.subject,
    textBody: envelope.textBody,
    htmlBody: envelope.htmlBody,
    rawMessage: envelope.rawMessage,
  });
  const spamLogFields = {
    spamScan,
    spamScore: Math.round(spamScan.score * 1000),
    spamCategory: spamScan.category,
    spamAction: spamScan.action,
  };
  if (spamScan.action === 'reject' || spamScan.action === 'quarantine') {
    await insertMailLog({ ...baseLog, ...spamLogFields, aliasId: alias.id, status: 'rejected', rejectionReason: `spam_${spamScan.action}` });
    throw new InboundError(spamScan.action === 'quarantine' ? 'Message quarantined by spam policy' : 'Message rejected by spam policy');
  }

  const routeMode = alias.outboundMode ?? 'platform';
  const outboundProvider = routeMode === 'platform' ? getOutboundProvider() : undefined;
  const relayId = alias.smtpRelayId ?? undefined;
  let credentialVersion: number | undefined;
  let halfOpenProbe = false;
  if (routeMode === 'custom_smtp') {
    if (!relayId) throw new InboundError('Custom SMTP relay route is invalid', 451);
    try {
      const relay = await assertCustomRelayCanAccept(alias.ownerId, relayId);
      credentialVersion = relay.activeCredentialVersion ?? undefined;
      halfOpenProbe = relay.circuitStatus === 'half_open';
      if (!credentialVersion) throw new SmtpRelayError('Relay has no active credential version', 451, 'credential_version_unavailable');
    } catch (error) {
      const code = error instanceof SmtpRelayError ? error.code : 'relay_unavailable';
      await insertMailLog({ ...baseLog, ...spamLogFields, aliasId: alias.id, outboundRouteMode: 'custom_smtp', outboundProvider: 'custom_smtp', smtpRelayId: relayId, status: 'rejected', rejectionReason: code });
      throw new InboundError('Custom SMTP relay is unavailable', 451);
    }
  }

  const [log] = await insertMailLog({
    ...baseLog,
    ...spamLogFields,
    aliasId: alias.id,
    outboundRouteMode: routeMode,
    outboundProvider: routeMode === 'custom_smtp' ? 'custom_smtp' : outboundProvider,
    smtpRelayId: relayId ?? null,
    forwardedTo: recipient.email,
    status: 'queued',
  });

  const jobPayload = buildEncryptedEmailForwardingJob({
    aliasId: alias.id,
    messageId: log.id,
    routeMode,
    outboundProvider,
    relayId,
    credentialVersion,
    halfOpenProbe,
    bounceToken: routeMode === 'platform' && outboundProvider === 'mailbaby' ? buildBounceToken() : undefined,
    subject: envelope.subject,
    textBody: envelope.textBody,
    htmlBody: envelope.htmlBody,
    rawMessageBase64: envelope.rawMessage ? Buffer.from(envelope.rawMessage).toString('base64') : undefined,
    originalFrom: envelope.from,
    spamScan,
  });

  const job = await emailForwardingQueue.add('forward', jobPayload, {
    removeOnComplete: { age: Math.ceil((jobPayload.ttl.expiresAt - jobPayload.ttl.queuedAt) / 1000), count: 100 },
    removeOnFail: { age: Math.ceil((jobPayload.ttl.expiresAt - jobPayload.ttl.queuedAt) / 1000), count: 500 },
  });

  logger.info({ jobId: job.id, logId: log.id, to: envelope.to, authFailureCount: auth.failureCount }, 'Inbound mail queued for forwarding');
  return { jobId: job.id!, logId: log.id };
}
