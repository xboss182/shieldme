import { createHash, randomUUID } from 'node:crypto';

const FORWARDED_HEADERS = new Set([
  'content-description',
  'content-disposition',
  'content-id',
  'content-language',
  'content-location',
  'content-transfer-encoding',
  'content-type',
  'in-reply-to',
  'list-archive',
  'list-help',
  'list-id',
  'list-post',
  'list-subscribe',
  'list-unsubscribe',
  'mime-version',
  'references',
]);

function splitMessage(rawMessage: Buffer): { headers: Buffer; body: Buffer } {
  const crlfBoundary = rawMessage.indexOf('\r\n\r\n');
  if (crlfBoundary >= 0) return { headers: rawMessage.subarray(0, crlfBoundary), body: rawMessage.subarray(crlfBoundary + 4) };
  const lfBoundary = rawMessage.indexOf('\n\n');
  if (lfBoundary >= 0) return { headers: rawMessage.subarray(0, lfBoundary), body: rawMessage.subarray(lfBoundary + 2) };
  throw new Error('forward_raw_message_missing_header_body_boundary');
}

function retainedHeaders(headers: Buffer): string[] {
  const fields = headers.toString('latin1').split(/\r?\n(?=[^ \t])/);
  return fields.filter((field) => {
    const colon = field.indexOf(':');
    if (colon <= 0) return false;
    return FORWARDED_HEADERS.has(field.slice(0, colon).toLowerCase());
  });
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
  headers?: Record<string, string>;
}): Buffer {
  const { headers, body } = splitMessage(input.rawMessage);
  const boundary = contentBoundary(input.rawMessage);
  if (boundary && !hasClosingBoundary(body, boundary)) throw new Error('forward_raw_message_multipart_boundary_missing');
  const generatedMessageId = input.messageId ?? `<${randomUUID()}@${header(input.messageDomain)}>`;
  const originalHash = createHash('sha256').update(input.rawMessage).digest('hex');
  const outbound = [
    `From: ${header(input.from)}`,
    `To: ${header(input.to)}`,
    `Subject: ${header(input.subject)}`,
    `Message-ID: ${generatedMessageId}`,
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
    'X-ShieldMe-Forwarded-By: ShieldMe',
    `X-ShieldMe-Original-SHA256: ${originalHash}`,
    'X-ShieldMe-Original-DKIM: removed-after-rewrite',
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
  outbound.push(...retainedHeaders(headers));
  return Buffer.concat([Buffer.from(`${outbound.join('\r\n')}\r\n\r\n`, 'latin1'), body]) as Buffer;
}
