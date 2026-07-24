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
  /** HTML banner to prepend inside the forwarded message body */
  bannerHtml?: string;
  /** Plain-text banner to prepend inside the forwarded message body */
  bannerText?: string;
};

export type RawForwardMessageResult = {
  message: Buffer;
  trackingMetadata: TrackingProtectionMetadata;
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
  'in-reply-to',
  'message-id',
  'received',
  'received-spf',
  'references',
  'reply-to',
  'return-path',
  'sender',
  'to',
  'x-forwarded-for-alias',
  'x-original-from',
  'x-original-message-id',
  'x-original-sender',
]);

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

/**
 * Apply tracking protection and banner injection to a raw MIME body.
 * Handles multipart bodies by locating text/html and text/plain parts.
 */
function applyBodyTransforms(
  body: Buffer,
  trackingConfig: TrackingProtectionConfig,
  bannerHtml: string | undefined,
  bannerText: string | undefined,
): { body: Buffer; trackingMetadata: TrackingProtectionMetadata } {
  const noopMeta: TrackingProtectionMetadata = {
    enabled: false,
    mode: trackingConfig.mode,
    pixelsRemoved: 0,
    linksRewritten: 0,
  };

  if (!trackingConfig.enabled && !bannerHtml && !bannerText) {
    return { body, metadata: noopMeta } as unknown as { body: Buffer; trackingMetadata: TrackingProtectionMetadata };
  }

  // Work in latin1 so byte positions are preserved
  let raw = body.toString('latin1');
  let totalPixelsRemoved = 0;
  let totalLinksRewritten = 0;
  let trackingRan = false;

  // Match MIME part headers + blank line + content, terminated by next boundary or end.
  // We handle both text/html and text/plain parts.
  const mimePartRe = /(Content-Type:\s*(text\/html|text\/plain)[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*(?:\r?\n[A-Za-z0-9-]+:[^\r\n]*)*\r?\n\r?\n)([\s\S]*?)(?=\r?\n--|$)/gi;

  raw = raw.replace(mimePartRe, (match, partHeaders: string, contentType: string, partBody: string) => {
    const isHtml = /text\/html/i.test(contentType);
    const isText = /text\/plain/i.test(contentType);
    let transformed = partBody;

    if (isHtml) {
      // Apply tracking protection first
      if (trackingConfig.enabled) {
        const result = protectEmailTracking(partBody, trackingConfig);
        totalPixelsRemoved += result.metadata.pixelsRemoved;
        totalLinksRewritten += result.metadata.linksRewritten;
        transformed = result.html;
        trackingRan = true;
      }
      // Inject HTML banner
      if (bannerHtml) {
        if (/<body[^>]*>/i.test(transformed)) {
          transformed = transformed.replace(/(<body[^>]*>)/i, `$1\r\n${bannerHtml}`);
        } else {
          transformed = bannerHtml + transformed;
        }
      }
    } else if (isText && bannerText) {
      // Prepend plain-text banner
      transformed = bannerText + transformed;
    }

    return partHeaders + transformed;
  });

  // If no MIME parts matched (single-part HTML body), try to inject banner directly
  if (bannerHtml && !mimePartRe.test(body.toString('latin1'))) {
    const bodyStr = body.toString('latin1');
    if (/<html/i.test(bodyStr) || /<body/i.test(bodyStr)) {
      if (/<body[^>]*>/i.test(bodyStr)) {
        raw = bodyStr.replace(/(<body[^>]*>)/i, `$1\r\n${bannerHtml}`);
      } else {
        raw = bannerHtml + bodyStr;
      }
    }
  }

  return {
    body: Buffer.from(raw, 'latin1'),
    trackingMetadata: {
      enabled: trackingRan,
      mode: trackingConfig.mode,
      pixelsRemoved: totalPixelsRemoved,
      linksRewritten: totalLinksRewritten,
    },
  };
}

export function rewriteRawForwardMessage(options: RawForwardingMessageOptions): RawForwardMessageResult {
  const { header, body: rawBody } = splitMessage(options.rawMessage);
  const preserved = parseHeaders(header)
    .filter(({ name }) => !unsafeHeader(name) && !name.startsWith('x-shieldme-'))
    .map(({ value }) => value);
  const originalFrom = headerValue(options.originalFrom ?? 'unknown');
  const originalMessageId = options.originalMessageId ? headerValue(options.originalMessageId) : undefined;
  const messageId = `<forward-${randomUUID()}@${headerValue(options.messageIdDomain)}>`;

  const trackingConfig = options.trackingProtection ?? { enabled: false, mode: 'conservative' as const };
  const { body, trackingMetadata } = applyBodyTransforms(
    rawBody,
    trackingConfig,
    options.bannerHtml,
    options.bannerText,
  );

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
