import nodemailer from 'nodemailer';
import { logger } from '../../lib/logger.js';
import type { ForwardPayload } from './resend.service.js';

const MAILBABY_HOST = 'relay.mailbaby.net';
const MAILBABY_PORT = 2525;

export type MailBabyFailureType = 'transient' | 'permanent';

export class MailBabyError extends Error {
  constructor(
    public readonly code: string,
    public readonly failureType: MailBabyFailureType,
  ) {
    super(code);
  }
}

function credentials(): { user: string; pass: string } | undefined {
  const user = process.env['MAILBABY_SMTP_USERNAME'];
  const pass = process.env['MAILBABY_SMTP_PASSWORD'];
  return user && pass ? { user, pass } : undefined;
}

export function isMailBabyConfigured(): boolean {
  return Boolean(credentials());
}

function classifyMailBabyError(error: unknown): MailBabyError {
  const detail = error as { code?: unknown; responseCode?: unknown; message?: unknown };
  const responseCode = typeof detail.responseCode === 'number' ? detail.responseCode : undefined;
  const code = typeof detail.code === 'string' ? detail.code.toUpperCase() : '';
  const message = typeof detail.message === 'string' ? detail.message.toLowerCase() : '';

  if (code === 'EAUTH' || /auth|login|credential/.test(message)) return new MailBabyError('mailbaby_auth_failed', 'permanent');
  if (/certificate|starttls|tls/.test(message)) return new MailBabyError('mailbaby_tls_failed', 'permanent');
  if (responseCode !== undefined && responseCode >= 500) return new MailBabyError('mailbaby_smtp_5xx', 'permanent');
  if (responseCode !== undefined && responseCode >= 400) return new MailBabyError('mailbaby_smtp_4xx', 'transient');
  if (/timeout|timed out/.test(message) || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code)) return new MailBabyError('mailbaby_connection_failed', 'transient');
  return new MailBabyError('mailbaby_delivery_failed', 'transient');
}

export async function sendViaMailBaby(payload: ForwardPayload): Promise<string> {
  const auth = credentials();
  if (!auth) throw new MailBabyError('mailbaby_credentials_missing', 'permanent');

  // requireTLS blocks SMTP AUTH until the certificate-verified STARTTLS upgrade succeeds.
  const transport = nodemailer.createTransport({
    host: MAILBABY_HOST,
    port: MAILBABY_PORT,
    secure: false,
    requireTLS: true,
    ignoreTLS: false,
    opportunisticTLS: false,
    auth,
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
