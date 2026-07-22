import { createHash } from 'node:crypto';

function splitMessage(rawMessage: Buffer): { headers: Buffer; body: Buffer } {
  const crlfBoundary = rawMessage.indexOf('\r\n\r\n');
  if (crlfBoundary >= 0) return { headers: rawMessage.subarray(0, crlfBoundary), body: rawMessage.subarray(crlfBoundary + 4) };
  const lfBoundary = rawMessage.indexOf('\n\n');
  if (lfBoundary >= 0) return { headers: rawMessage.subarray(0, lfBoundary), body: rawMessage.subarray(lfBoundary + 2) };
  throw new Error('forward_raw_message_missing_header_body_boundary');
}

function header(value: string): string {
  return value.replace(/[\r\n]/g, ' ').trim().slice(0, 998);
}

function headerName(value: string): boolean {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value);
}

function contentBoundary(rawMessage: Buffer): string | undefined {
  const match = rawMessage.toString('latin1', 0, Math.min(rawMessage.length, 64 * 1024)).match(/^content-type:[^\r\n;]*(?:;[^\r\n]*)*?\bboundary\s*=\s*(?:"([^"\r\n]+)"|([^;\s\r\n]+))/im);
  return match?.[1] ?? match?.[2];
}

function hasClosingBoundary(body: Buffer, boundary: string): boolean {
  return body.toString('latin1').includes(`--${boundary}--`);
}

export function buildRawForwardedMessage(input: {
  rawMessage: Buffer;
  from: string;
  to: string;
  subject: string;
  replyTo?: string;
  originalFrom?: string;
  originalMessageId?: string;
  messageId?: string;
  messageDomain: string;
  date: Date;
  bannerText: string;
  bannerHtml: string;
  headers?: Record<string, string>;
}): Buffer {
  const { body } = splitMessage(input.rawMessage);
  const boundary = contentBoundary(input.rawMessage);
  if (boundary && !hasClosingBoundary(body, boundary)) throw new Error('forward_raw_message_multipart_boundary_missing');
  const originalHash = createHash('sha256').update(input.rawMessage).digest('hex');
  const generatedMessageId = input.messageId ?? `<${originalHash.slice(0, 32)}@${header(input.messageDomain)}>`;
  const boundarySeed = createHash('sha256').update(generatedMessageId).digest('hex');
  const outerBoundary = `shieldme-${boundarySeed.slice(0, 32)}`;
  const alternativeBoundary = `shieldme-alt-${boundarySeed.slice(32)}`;
  const outbound = [
    `From: ${header(input.from)}`,
    `To: ${header(input.to)}`,
    `Subject: ${header(input.subject)}`,
    `Date: ${input.date.toUTCString()}`,
    `Message-ID: ${generatedMessageId}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
    'X-ShieldMe-Forwarded-By: ShieldMe',
    `X-ShieldMe-Original-SHA256: ${originalHash}`,
    'X-ShieldMe-Original-DKIM: nested-original-not-valid-for-forward',
  ];
  const emitted = new Set(outbound.map((line) => line.slice(0, line.indexOf(':')).toLowerCase()));
  if (input.replyTo) {
    outbound.push(`Reply-To: ${header(input.replyTo)}`);
    emitted.add('reply-to');
  }
  if (input.originalFrom) {
    outbound.push(`X-Original-Sender: ${header(input.originalFrom)}`);
    emitted.add('x-original-sender');
  }
  if (input.originalMessageId) {
    outbound.push(`X-Original-Message-ID: ${header(input.originalMessageId)}`);
    emitted.add('x-original-message-id');
  }
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (headerName(name) && !emitted.has(name.toLowerCase())) {
      outbound.push(`${name}: ${header(value)}`);
      emitted.add(name.toLowerCase());
    }
  }

  const prefix = Buffer.from([
    outbound.join('\r\n'),
    '',
    `--${outerBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.bannerText,
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.bannerHtml,
    `--${alternativeBoundary}--`,
    `--${outerBoundary}`,
    'Content-Type: message/rfc822',
    'Content-Disposition: inline; filename="forwarded-message.eml"',
    '',
  ].join('\r\n'), 'utf8');
  const suffix = Buffer.from(`\r\n--${outerBoundary}--\r\n`, 'ascii');
  return Buffer.concat([prefix, input.rawMessage, suffix]);
}
