import {
  SESClient,
  SendRawEmailCommand,
} from '@aws-sdk/client-ses';
import { logger } from '../../lib/logger.js';
import type { ForwardPayload } from './resend.service.js';

let _sesClient: SESClient | null = null;
let _sesRegionUsed: string | undefined;

function getSesClient(): SESClient {
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  if (!_sesClient || _sesRegionUsed !== region) {
    _sesClient = new SESClient({ region });
    _sesRegionUsed = region;
  }
  return _sesClient;
}

export function isSesConfigured(): boolean {
  return Boolean(
    (process.env['AWS_ACCESS_KEY_ID'] || process.env['AWS_PROFILE']) &&
    process.env['AWS_REGION'],
  );
}

/**
 * Build a minimal RFC 2822 raw message string from a ForwardPayload.
 * We use SendRawEmailCommand so we can carry arbitrary headers end-to-end.
 */
function buildRawMessage(payload: ForwardPayload): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];

  lines.push(`From: ${payload.from}`);
  lines.push(`To: ${payload.to}`);
  lines.push(`Subject: ${payload.subject}`);
  if (payload.replyTo) lines.push(`Reply-To: ${payload.replyTo}`);

  // Custom headers
  if (payload.headers) {
    for (const [k, v] of Object.entries(payload.headers)) {
      lines.push(`${k}: ${v}`);
    }
  }

  if (payload.htmlBody) {
    lines.push('MIME-Version: 1.0');
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(payload.textBody);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(payload.htmlBody);
    lines.push('');
    lines.push(`--${boundary}--`);
  } else {
    lines.push('MIME-Version: 1.0');
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(payload.textBody);
  }

  return lines.join('\r\n');
}

export async function sendViaSes(payload: ForwardPayload): Promise<string> {
  if (!isSesConfigured()) {
    throw new Error('SES not configured — AWS_REGION and credentials are required');
  }

  const client = getSesClient();
  const rawMessage = buildRawMessage(payload);
  const encoded = Buffer.from(rawMessage, 'utf8');

  const cmd = new SendRawEmailCommand({
    RawMessage: { Data: encoded },
    Source: payload.from,
    Destinations: [payload.to],
  });

  const result = await client.send(cmd);
  const messageId = result.MessageId ?? '(no-message-id)';

  logger.info({ sesMessageId: messageId, to: payload.to }, 'Mail delivered via SES');
  return messageId;
}
