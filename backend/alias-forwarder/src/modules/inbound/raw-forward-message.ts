import { randomUUID } from 'node:crypto';
import { protectEmailTracking, type TrackingProtectionConfig, type TrackingProtectionMetadata } from '../tracking/tracking-protection.service.js';

export type RawForwardingMessageOptions = {
  rawMessage: Buffer;
  from: string;
  to: string;
  replyTo?: string;
  originalFrom?: string;
  originalMessageId?: string | null;
  forwardedAlias: string;
  messageIdDomain: string;
  headers?: Record<string, string>;
  trackingProtection?: TrackingProtectionConfig;
};

type HeaderBlock = { name: string; value: string };

const strippedHeaders = new Set([
  'arc-authentication-results',
  'arc-message-signature',
  'arc-seal',
  'authentication-results',
  'bcc',
  'delivered-to',
  'dkim-signature',
  'from',
  'message-id',
  'received',
  'received-spf',
  'reply-to',
  'return-path',
  'sender',
  'to',
  'x-forwarded-for-alias',
  'x-original-from',
  'x-original-message-id',
  'x-original-sender',
]);

export type RawTrackingResult = {
  body: Buffer;
  metadata: TrackingProtectionMetadata;
};

/**
 * Apply tracking protection to the HTML parts of a raw MIME body.
 * Handles both single-part text/html and multipart bodies with html parts.
 * Returns the modified body buffer and aggregated metadata.
 */
function applyTrackingProtectionToBody(body: Buffer, config: TrackingProtectionConfig): RawTrackingResult {
  if (!config.enabled) {
    return { body, metadata: { enabled: false, mode: config.mode, pixelsRemoved: 0, linksRewritten: 0 } };
  }

  // Work on latin1 string so byte positions are preserved
  const raw = body.toString('latin1');

  // Match HTML part content between MIME boundaries or in a single-part body.
  // We look for Content-Type: text/html (possibly with charset) followed by blank line + content.
  const htmlPartRe = /(Content-Type:\s*text\/html[^\r\n]*(?:\r?\n[^\r\n:]+)*\r?\n(?:[^\r\n]+:\s*[^\r\n]*\r?\n)*\r?\n)([\s\S]*?)(?=\r?\n--|\r?\n$|$)/gi;

  let totalPixelsRemoved = 0;
  let totalLinksRewritten = 0;
  let result = raw;

  result = result.replace(htmlPartRe, (match, partHeaders, partBody) => {
    const protected_ = protectEmailTracking(partBody, config);
    totalPixelsRemoved += protected_.metadata.pixelsRemoved;
    totalLinksRewritten += protected_.metadata.linksRewritten;
    return partHeaders + protected_.html;
  });

  return {
    body: Buffer.from(result, 'latin1'),
    metadata: {
      enabled: true,
      mode: config.mode,
      pixelsRemoved: totalPixelsRemoved,
      linksRewritten: totalLinksRewritten,
    },
  };
}


function splitMessage(rawMessage: Buffer) {
  const crlf = rawMessage.indexOf(Buffer.from('\r\n\r\n'));
  if (crlf !== -1) return { header: rawMessage.subarray(0, crlf), body: rawMessage.subarray(crlf + 4) };
  const lf = rawMessage.indexOf(Buffer.from('\n\n'));
  if (lf !== -1) return { header: rawMessage.subarray(0, lf), body: rawMessage.subarray(lf + 2) };
  throw new Error('invalid_raw_message');
}

function parseHeaders(header: Buffer): HeaderBlock[] {
  const lines = header.toString('latin1').split(/\r?\n/);
  const blocks: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && blocks.length) blocks[blocks.length - 1] += `\r\n${line}`;
    else blocks.push(line);
  }
  return blocks.flatMap((block) => {
    const separator = block.indexOf(':');
    if (separator <= 0) return [];
    return [{ name: block.slice(0, separator).trim().toLowerCase(), value: block }];
  });
}

function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 998);
}

function unsafeHeader(name: string): boolean {
  return strippedHeaders.has(name)
    || name.startsWith('arc-')
    || name.startsWith('resent-')
    || name.includes('dkim-signature')
    || name === 'domainkey-signature'
    || name.startsWith('x-ms-exchange-organization-auth');
}

function extraHeaders(headers: Record<string, string> | undefined): string[] {
  return Object.entries(headers ?? {}).flatMap(([name, value]) => {
    if (!/^[A-Za-z0-9-]+$/.test(name) || unsafeHeader(name.toLowerCase())) return [];
    return [`${name}: ${headerValue(value)}`];
  });
}

export type RawForwardMessageResult = {
  message: Buffer;
  trackingMetadata: TrackingProtectionMetadata;
};

export function rewriteRawForwardMessage(options: RawForwardingMessageOptions): RawForwardMessageResult {
  const { header, body: rawBody } = splitMessage(options.rawMessage);
  const preserved = parseHeaders(header)
    .filter(({ name }) => !unsafeHeader(name) && !name.startsWith('x-shieldme-'))
    .map(({ value }) => value);
  const originalFrom = headerValue(options.originalFrom ?? 'unknown');
  const originalMessageId = options.originalMessageId ? headerValue(options.originalMessageId) : undefined;
  const messageId = `<forward-${randomUUID()}@${headerValue(options.messageIdDomain)}>`;

  // Apply tracking protection to the body if configured
  const trackingConfig = options.trackingProtection ?? { enabled: false, mode: 'conservative' as const };
  const { body, metadata: trackingMetadata } = applyTrackingProtectionToBody(rawBody, trackingConfig);

  const rewritten = [
    `From: ${headerValue(options.from)}`,
    `To: ${headerValue(options.to)}`,
    ...(options.replyTo ? [`Reply-To: ${headerValue(options.replyTo)}`] : []),
    `Message-ID: ${messageId}`,
    `X-Original-Sender: ${originalFrom}`,
    ...(originalMessageId ? [`X-Original-Message-ID: ${originalMessageId}`] : []),
    `X-Forwarded-For-Alias: ${headerValue(options.forwardedAlias)}`,
    ...extraHeaders(options.headers),
    ...preserved,
  ].join('\r\n');
  const message = Buffer.concat([Buffer.from(`${rewritten}\r\n\r\n`, 'latin1'), body]);
  return { message, trackingMetadata };
}
