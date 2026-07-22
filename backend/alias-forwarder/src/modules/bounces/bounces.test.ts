import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindFirst,
  mockUpdate,
  mockAddToSuppressionList,
  mockWriteAuditLog,
} = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockAddToSuppressionList: vi.fn(),
  mockWriteAuditLog: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: { mailLogs: { findFirst: mockFindFirst } },
    update: mockUpdate,
  },
}));
vi.mock('../abuse/abuse.service.js', () => ({ addToSuppressionList: mockAddToSuppressionList }));
vi.mock('../admin/admin.service.js', () => ({ writeAuditLog: mockWriteAuditLog }));
vi.mock('../smtp-relays/service.js', () => ({ hashBounceToken: (token: string) => `hash:${token}` }));

import { processSmtpBounce } from './bounces.service.js';

function makeUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockUpdate.mockReturnValue({ set });
  return { set };
}

describe('processSmtpBounce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddToSuppressionList.mockResolvedValue(undefined);
    mockWriteAuditLog.mockResolvedValue(undefined);
    makeUpdateChain();
  });

  it('correlates a MailBaby DSN, suppresses its destination, and records metadata only', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'log-1',
      outboundProvider: 'mailbaby',
      forwardedTo: 'recipient@example.test',
      smtpRelayId: null,
      bounceExpiresAt: null,
    });
    const { set } = makeUpdateChain();

    await expect(processSmtpBounce('a'.repeat(64))).resolves.toBe(true);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: 'bounced',
      failureType: 'bounce',
      failureReason: 'mailbaby_dsn_recipient_bounce',
      rejectionReason: 'mailbaby_dsn_recipient_bounce',
      smtpResponseClass: '5xx',
    }));
    expect(mockAddToSuppressionList).toHaveBeenCalledWith('recipient@example.test', 'bounce');
    expect(mockWriteAuditLog).toHaveBeenCalledWith('mailbaby.dsn_received', 'mail_log', 'log-1', { smtpRelayId: null });
  });

  it('rejects malformed or expired bounce tokens without a state change', async () => {
    expect(await processSmtpBounce('not-a-token')).toBe(false);
    expect(mockFindFirst).not.toHaveBeenCalled();

    mockFindFirst.mockResolvedValue({ id: 'log-1', bounceExpiresAt: new Date(0) });
    await expect(processSmtpBounce('a'.repeat(64))).resolves.toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAddToSuppressionList).not.toHaveBeenCalled();
  });
});
