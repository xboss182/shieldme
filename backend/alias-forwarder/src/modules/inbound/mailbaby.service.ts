import nodemailer from 'nodemailer';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import type { ForwardPayload } from './resend.service.js';

const MAILBABY_HOST = 'relay.mailbaby.net';
const MAILBABY_PORT = 2525;

export type MailBabyFailureType = 'transient' | 'permanent';

export class MailBabyError extends Error {
  constructor(
    public readonly code: string,
    public readonly failureType: MailBabyFailureType,
    public readonly kind: 'recipient' | 'provider' | 'transport' = 'provider',
  ) {
    super(code);
  }
}

type MailBabyConfig = {
  auth: { user: string; pass: string };
  dkim: { domainName: string; keySelector: string; privateKey: string };
};

function configuration(): MailBabyConfig | undefined {
  const user = process.env['MAILBABY_SMTP_USERNAME'];
  const pass = process.env['MAILBABY_SMTP_PASSWORD'];
  const domainName = process.env['MAILBABY_DKIM_DOMAIN'];
  const keySelector = process.env['MAILBABY_DKIM_SELECTOR'];
  const privateKey = process.env['MAILBABY_DKIM_PRIVATE_KEY'];
  return user && pass && domainName && keySelector && privateKey
    ? { auth: { user, pass }, dkim: { domainName, keySelector, privateKey: privateKey.replace(/\\n/g, '\n') } }
    : undefined;
}

export function isMailBabyConfigured(): boolean {
  return Boolean(configuration());
}

const MAILBABY_FAILURES_KEY = 'outbound:mailbaby:failures';
const MAILBABY_CIRCUIT_KEY = 'outbound:mailbaby:circuit';

function classifyMailBabyError(error: unknown): MailBabyError {
  const detail = error as { code?: unknown; responseCode?: unknown; message?: unknown };
  const responseCode = typeof detail.responseCode === 'number' ? detail.responseCode : undefined;
  const code = typeof detail.code === 'string' ? detail.code.toUpperCase() : '';
  const message = typeof detail.message === 'string' ? detail.message.toLowerCase() : '';

  if (code === 'EAUTH' || /auth|login|credential/.test(message)) return new MailBabyError('mailbaby_auth_failed', 'permanent', 'provider');
  if (/certificate|starttls|tls/.test(message)) return new MailBabyError('mailbaby_tls_failed', 'permanent', 'transport');
  if (/dkim|signing/.test(message)) return new MailBabyError('mailbaby_dkim_failed', 'permanent', 'provider');
  if (responseCode !== undefined && [550, 551, 552, 553].includes(responseCode)) return new MailBabyError('mailbaby_recipient_5xx', 'permanent', 'recipient');
  if (responseCode !== undefined && responseCode >= 500) return new MailBabyError('mailbaby_provider_5xx', 'permanent', 'provider');
  if (responseCode !== undefined && responseCode >= 400) return new MailBabyError('mailbaby_smtp_4xx', 'transient', 'transport');
  if (/timeout|timed out/.test(message) || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code)) return new MailBabyError('mailbaby_connection_failed', 'transient', 'transport');
  return new MailBabyError('mailbaby_delivery_failed', 'transient', 'transport');
}

export async function isMailBabyCircuitOpen(): Promise<boolean> {
  return (await redis.get(MAILBABY_CIRCUIT_KEY)) === 'open';
}

export async function recordMailBabyFailure(error: MailBabyError): Promise<void> {
  if (error.kind === 'recipient') return;
  if (error.failureType === 'permanent') {
    await redis.set(MAILBABY_CIRCUIT_KEY, 'open', 'EX', 15 * 60);
    return;
  }
  const failures = await redis.incr(MAILBABY_FAILURES_KEY);
  if (failures === 1) await redis.expire(MAILBABY_FAILURES_KEY, 5 * 60);
  if (failures >= 3) await redis.set(MAILBABY_CIRCUIT_KEY, 'open', 'EX', 15 * 60);
}

export async function recordMailBabySuccess(): Promise<void> {
  await redis.del(MAILBABY_FAILURES_KEY, MAILBABY_CIRCUIT_KEY);
}

export async function sendViaMailBaby(payload: ForwardPayload): Promise<string> {
  const config = configuration();
  if (!config) throw new MailBabyError('mailbaby_forwarding_identity_missing', 'permanent');
  if (!payload.envelopeFrom) throw new MailBabyError('mailbaby_envelope_sender_missing', 'permanent');

  // requireTLS blocks SMTP AUTH until the certificate-verified STARTTLS upgrade succeeds.
  const transport = nodemailer.createTransport({
    host: MAILBABY_HOST,
    port: MAILBABY_PORT,
    secure: false,
    requireTLS: true,
    ignoreTLS: false,
    opportunisticTLS: false,
    auth: config.auth,
    dkim: config.dkim,
    connectionTimeout: 5_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: {
      servername: MAILBABY_HOST,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  });

  try {
    const result = await transport.sendMail({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      replyTo: payload.replyTo,
      text: payload.textBody,
      html: payload.htmlBody,
      headers: payload.headers,
      attachments: payload.attachments,
      raw: payload.raw,
      envelope: { from: payload.envelopeFrom, to: [payload.to] },
    });
    const messageId = String(result.messageId ?? 'mailbaby_submitted');
    logger.info({ provider: 'mailbaby', messageId }, 'Mail delivered via MailBaby');
    return messageId;
  } catch (error) {
    throw classifyMailBabyError(error);
  } finally {
    transport.close?.();
  }
}
