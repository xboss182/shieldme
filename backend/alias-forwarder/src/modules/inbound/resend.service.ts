import { Resend } from 'resend';
import { getResendApiKey } from '../../config/runtime-config.js';
import { logger } from '../../lib/logger.js';

let _resend: Resend | null = null;
let _resendKeyUsed: string | undefined;

function getResend(): Resend | null {
  const key = getResendApiKey();
  if (!key) return null;
  // Re-create client if key changed at runtime
  if (!_resend || _resendKeyUsed !== key) {
    _resend = new Resend(key);
    _resendKeyUsed = key;
  }
  return _resend;
}

export interface ForwardPayload {
  from: string;
  to: string;
  subject: string;
  replyTo?: string;
  headers?: Record<string, string>;
  textBody: string;
  htmlBody?: string;
  rawMessage?: Buffer;
  envelopeFrom?: string;
}

export function isResendConfigured(): boolean {
  return Boolean(getResendApiKey());
}

export async function sendViaResend(payload: ForwardPayload): Promise<string> {
  const resend = getResend();
  if (!resend) {
    throw new Error('Resend not configured — RESEND_API_KEY is absent');
  }

  const { data, error } = await resend.emails.send({
    from: payload.from,
    to: [payload.to],
    subject: payload.subject,
    replyTo: payload.replyTo,
    text: payload.textBody,
    html: payload.htmlBody,
    headers: payload.headers,
  });

  if (error || !data) {
    logger.error({ error }, 'Resend delivery failed');
    throw new Error(`Resend error: ${error?.message ?? 'unknown'}`);
  }

  logger.info({ resendMessageId: data.id }, 'Mail delivered via Resend');
  return data.id;
}
