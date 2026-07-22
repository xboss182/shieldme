import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindFirst, mockUpdate, mockSuppression, mockAudit } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockSuppression: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: { query: { mailLogs: { findFirst: mockFindFirst } }, update: mockUpdate },
}));
vi.mock('../abuse/abuse.service.js', () => ({ addToSuppressionList: mockSuppression }));
vi.mock('../admin/admin.service.js', () => ({ writeAuditLog: mockAudit }));

import { processSmtpBounce } from './bounces.service.js';

const RECIPIENT = 'recipient@example.net';
const TOKEN = 'a'.repeat(64);

function dsn({
  originalRecipient = RECIPIENT,
  finalRecipient = RECIPIENT,
  originalMessageId = '<provider-message@example.test>',
  action = 'failed',
  status = '5.1.1',
  contentType = 'multipart/report; report-type=delivery-status; boundary="dsn-boundary"',
}: Partial<{ originalRecipient: string; finalRecipient: string; originalMessageId: string; action: string; status: string; contentType: string }> = {}) {
  return Buffer.from([
    'From: mailer-daemon@example.test',
    `Content-Type: ${contentType}`,
    '',
    '--dsn-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Delivery failed.',
    '--dsn-boundary',
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; relay.example.test',
    '',
    `Original-Recipient: rfc822; ${originalRecipient}`,
    `Final-Recipient: rfc822; ${finalRecipient}`,
    `Action: ${action}`,
    `Status: ${status}`,
    '',
    '--dsn-boundary',
    'Content-Type: message/rfc822',
    '',
    `Message-ID: ${originalMessageId}`,
    '',
    'Original message body.',
    '--dsn-boundary--',
    '',
  ].join('\r\n'));
}

function input(rawMessage = dsn(), overrides: Partial<{ sizeBytes: number; envelopeFrom: string; remoteAddress: string }> = {}) {
  return {
    rawMessage,
    sizeBytes: rawMessage.length,
    envelopeFrom: '',
    remoteAddress: '192.0.2.10',
    ...overrides,
  };
}

function updateChain(returned = [{ id: 'mail-log-1' }]) {
  const returning = vi.fn().mockResolvedValue(returned);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  mockUpdate.mockReturnValue({ set });
  return { set, where, returning };
}

function log(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mail-log-1',
    outboundProvider: 'custom_smtp',
    forwardedTo: RECIPIENT,
    bounceExpiresAt: new Date(Date.now() + 60_000),
    smtpRelayId: 'relay-1',
    providerMessageId: '<provider-message@example.test>',
    status: 'delivered',
    ...overrides,
  };
}

describe('SMTP DSN processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['SMTP_DSN_TRUSTED_SOURCE_IPS'] = '192.0.2.10';
    process.env['MAILBABY_DSN_VERIFIED'] = 'true';
    mockSuppression.mockResolvedValue(undefined);
    mockAudit.mockResolvedValue(undefined);
  });

  it('suppresses only a trusted, terminal DSN with matching recipients', async () => {
    const { set } = updateChain();
    mockFindFirst.mockResolvedValue(log());

    await expect(processSmtpBounce(TOKEN, input())).resolves.toBe(true);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'bounced', smtpResponseClass: '5xx' }));
    expect(mockSuppression).toHaveBeenCalledWith(RECIPIENT, 'bounce');
    expect(mockAudit).toHaveBeenCalledWith('smtp_relay.dsn_received', 'mail_log', 'mail-log-1', expect.objectContaining({ provider: 'custom_smtp' }));
    expect(set.mock.calls[0][0]).not.toHaveProperty('rawMessage');
  });

  it.each<readonly [string, Buffer, Partial<{ sizeBytes: number; envelopeFrom: string; remoteAddress: string }> | undefined]>([
    ['a plaintext message', Buffer.from('delivery failed'), undefined],
    ['a wrong content type', dsn({ contentType: 'text/plain' }), undefined],
    ['a missing null envelope sender', dsn(), { envelopeFrom: 'sender@example.test' }],
    ['a delayed delivery status', dsn({ action: 'delayed', status: '4.2.0' }), undefined],
    ['a non-terminal status', dsn({ status: '2.0.0' }), undefined],
    ['a mismatched original recipient', dsn({ originalRecipient: 'other@example.net' }), undefined],
    ['a mismatched final recipient', dsn({ finalRecipient: 'other@example.net' }), undefined],
    ['a mismatched original message', dsn({ originalMessageId: '<other@example.test>' }), undefined],
    ['an oversized payload', dsn(), { sizeBytes: 1024 * 1024 + 1 }],
    ['an untrusted source', dsn(), { remoteAddress: '192.0.2.11' }],
  ])('rejects %s without suppressing', async (_name, rawMessage, overrides) => {
    mockFindFirst.mockResolvedValue(log());

    await expect(processSmtpBounce(TOKEN, input(rawMessage, overrides))).resolves.toBe(false);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSuppression).not.toHaveBeenCalled();
  });

  it('rejects MailBaby DSNs even when MAILBABY_DSN_VERIFIED is true', async () => {
    mockFindFirst.mockResolvedValue(log({ outboundProvider: 'mailbaby' }));

    await expect(processSmtpBounce(TOKEN, input())).resolves.toBe(false);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSuppression).not.toHaveBeenCalled();
  });

  it('replays idempotently without a duplicate status update or audit event', async () => {
    mockFindFirst.mockResolvedValue(log({ status: 'bounced' }));

    await expect(processSmtpBounce(TOKEN, input())).resolves.toBe(true);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSuppression).toHaveBeenCalledWith(RECIPIENT, 'bounce');
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('repairs a missing suppression if a concurrent processor already marked the message bounced', async () => {
    updateChain([]);
    mockFindFirst.mockResolvedValue(log());

    await expect(processSmtpBounce(TOKEN, input())).resolves.toBe(true);

    expect(mockSuppression).toHaveBeenCalledWith(RECIPIENT, 'bounce');
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('rejects malformed, unknown, and expired tokens', async () => {
    await expect(processSmtpBounce('not-a-token', input())).resolves.toBe(false);
    expect(mockFindFirst).not.toHaveBeenCalled();

    mockFindFirst.mockResolvedValue(null);
    await expect(processSmtpBounce('b'.repeat(64), input())).resolves.toBe(false);

    mockFindFirst.mockResolvedValue(log({ bounceExpiresAt: new Date(Date.now() - 1) }));
    await expect(processSmtpBounce('c'.repeat(64), input())).resolves.toBe(false);
  });
});
