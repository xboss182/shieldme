import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { mailLogs } from '../../db/schema.js';
import { addToSuppressionList } from '../abuse/abuse.service.js';
import { writeAuditLog } from '../admin/admin.service.js';

type SmtpBounceInput = {
  rawMessage: Buffer;
  sizeBytes: number;
  envelopeFrom: string;
  remoteAddress?: string;
};

type ParsedHeaders = Map<string, string[]>;

const MAX_DSN_BYTES = 1024 * 1024;

function hashBounceToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function splitHeaderBody(input: string): { headers: string; body: string } | undefined {
  const separator = /\r?\n\r?\n/.exec(input);
  if (!separator || separator.index === undefined) return undefined;
  return { headers: input.slice(0, separator.index), body: input.slice(separator.index + separator[0].length) };
}

function parseHeaders(input: string): ParsedHeaders | undefined {
  const headers = new Map<string, string[]>();
  let previous: string | undefined;

  for (const line of input.split(/\r?\n/)) {
    if (/^[ \t]/.test(line)) {
      if (!previous) return undefined;
      const values = headers.get(previous);
      if (!values) return undefined;
      values[values.length - 1] += ` ${line.trim()}`;
      continue;
    }

    const match = /^([!-9;-~]+):[ \t]*(.*)$/.exec(line);
    if (!match) return undefined;
    const name = match[1].toLowerCase();
    headers.set(name, [...(headers.get(name) ?? []), match[2].trim()]);
    previous = name;
  }

  return headers;
}

function singleHeader(headers: ParsedHeaders, name: string): string | undefined {
  const values = headers.get(name);
  return values?.length === 1 ? values[0] : undefined;
}

function parseContentType(value: string): { type: string; parameters: Map<string, string> } | undefined {
  const [mediaType, ...rawParameters] = value.split(';');
  if (!mediaType) return undefined;
  const parameters = new Map<string, string>();

  for (const rawParameter of rawParameters) {
    const match = /^\s*([^=\s]+)\s*=\s*(?:"([^"]+)"|([^\s";]+))\s*$/.exec(rawParameter);
    if (!match) return undefined;
    const name = match[1].toLowerCase();
    const parameter = match[2] ?? match[3];
    if (!parameter || parameters.has(name)) return undefined;
    parameters.set(name, parameter);
  }

  return { type: mediaType.trim().toLowerCase(), parameters };
}

function multipartParts(body: string, boundary: string): string[] | undefined {
  const delimiter = `--${boundary}`;
  const parts: string[] = [];
  let current: string[] | undefined;
  let closed = false;

  for (const line of body.split(/\r?\n/)) {
    if (line === delimiter) {
      if (closed) return undefined;
      if (current) parts.push(current.join('\r\n'));
      current = [];
    } else if (line === `${delimiter}--`) {
      if (!current) return undefined;
      parts.push(current.join('\r\n'));
      current = undefined;
      closed = true;
    } else if (current) {
      current.push(line);
    }
  }

  return closed ? parts : undefined;
}

function normalizeRecipient(value: string): string | undefined {
  const match = /^rfc822\s*;\s*([^\s;]+)$/i.exec(value);
  if (!match) return undefined;
  const address = match[1];
  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) return undefined;
  return `${address.slice(0, at)}@${address.slice(at + 1).toLowerCase()}`;
}

function isTerminalDsn(input: SmtpBounceInput, expectedRecipient: string, expectedMessageId: string): boolean {
  if (input.sizeBytes > MAX_DSN_BYTES || input.sizeBytes !== input.rawMessage.length || input.envelopeFrom !== '') return false;

  const message = splitHeaderBody(input.rawMessage.toString('utf8'));
  if (!message) return false;
  const messageHeaders = parseHeaders(message.headers);
  const contentType = messageHeaders ? singleHeader(messageHeaders, 'content-type') : undefined;
  const reportType = contentType ? parseContentType(contentType) : undefined;
  const boundary = reportType?.parameters.get('boundary');
  if (reportType?.type !== 'multipart/report' || reportType.parameters.get('report-type')?.toLowerCase() !== 'delivery-status' || !boundary || !/^[A-Za-z0-9'()+_,./:=?-]{1,70}$/.test(boundary)) return false;

  const parts = multipartParts(message.body, boundary);
  if (!parts) return false;
  const typedParts = parts
    .map(splitHeaderBody)
    .filter((part): part is { headers: string; body: string } => Boolean(part))
    .map((part) => ({ part, headers: parseHeaders(part.headers) }))
    .filter((value): value is { part: { headers: string; body: string }; headers: ParsedHeaders } => Boolean(value.headers));
  const deliveryStatusParts = typedParts.filter(({ headers }) => parseContentType(singleHeader(headers, 'content-type') ?? '')?.type === 'message/delivery-status');
  const originalMessageParts = typedParts.filter(({ headers }) => parseContentType(singleHeader(headers, 'content-type') ?? '')?.type === 'message/rfc822');
  if (deliveryStatusParts.length !== 1 || originalMessageParts.length !== 1) return false;

  const fields = deliveryStatusParts[0].part.body.trim().split(/\r?\n\r?\n/).map(parseHeaders);
  const originalMessage = splitHeaderBody(originalMessageParts[0].part.body);
  const originalHeaders = originalMessage && parseHeaders(originalMessage.headers);
  if (fields.length !== 2 || fields.some((field) => !field) || !originalHeaders) return false;
  const recipient = fields[1]!;
  const originalRecipient = singleHeader(recipient, 'original-recipient');
  const finalRecipient = singleHeader(recipient, 'final-recipient');
  const action = singleHeader(recipient, 'action');
  const status = singleHeader(recipient, 'status');
  const expected = normalizeRecipient(`rfc822; ${expectedRecipient}`);

  return Boolean(
    expected
    && originalRecipient
    && finalRecipient
    && normalizeRecipient(originalRecipient) === expected
    && normalizeRecipient(finalRecipient) === expected
    && singleHeader(originalHeaders, 'message-id') === expectedMessageId
    && action?.toLowerCase() === 'failed'
    && /^5\.\d{1,3}\.\d{1,3}$/.test(status ?? ''),
  );
}

function normalizedIp(value: string | undefined): string | undefined {
  const address = value?.replace(/^::ffff:/i, '');
  return address && isIP(address) ? address.toLowerCase() : undefined;
}

function hasTrustedProvenance(outboundProvider: string | null, remoteAddress: string | undefined): boolean {
  if (outboundProvider !== 'custom_smtp') return false;
  const source = normalizedIp(remoteAddress);
  if (!source) return false;
  return new Set((process.env['SMTP_DSN_TRUSTED_SOURCE_IPS'] ?? '').split(',').map(normalizedIp).filter((value): value is string => Boolean(value))).has(source);
}

export async function processSmtpBounce(token: string, input: SmtpBounceInput) {
  if (!/^[a-f0-9]{48,128}$/i.test(token)) return false;
  const log = await db.query.mailLogs.findFirst({ where: eq(mailLogs.bounceTokenHash, hashBounceToken(token)) });
  if (!log || !log.forwardedTo || !log.providerMessageId || (log.bounceExpiresAt && log.bounceExpiresAt < new Date())) return false;
  if (!isTerminalDsn(input, log.forwardedTo, log.providerMessageId) || !hasTrustedProvenance(log.outboundProvider, input.remoteAddress)) return false;
  if (log.status === 'bounced') {
    await addToSuppressionList(log.forwardedTo, 'bounce');
    return true;
  }

  const updated = await db.update(mailLogs)
    .set({ status: 'bounced', smtpResponseClass: '5xx', updatedAt: new Date() })
    .where(and(eq(mailLogs.id, log.id), ne(mailLogs.status, 'bounced')))
    .returning({ id: mailLogs.id });
  await addToSuppressionList(log.forwardedTo, 'bounce');
  if (updated.length === 0) return true;

  await writeAuditLog('smtp_relay.dsn_received', 'mail_log', log.id, { smtpRelayId: log.smtpRelayId, provider: log.outboundProvider });
  return true;
}
