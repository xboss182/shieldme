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

function updateChain() {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn().mockReturnValue({ where });
  mockUpdate.mockReturnValue({ set });
  return { set };
}

describe('SMTP DSN processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuppression.mockResolvedValue(undefined);
    mockAudit.mockResolvedValue(undefined);
  });

  it('marks a MailBaby token bounce, suppresses the recipient, and stores no DSN body', async () => {
    const token = 'a'.repeat(64);
    const { set } = updateChain();
    mockFindFirst.mockResolvedValue({
      id: 'mail-log-1',
      outboundProvider: 'mailbaby',
      forwardedTo: 'recipient@example.net',
      bounceExpiresAt: new Date(Date.now() + 60_000),
      smtpRelayId: null,
    });

    await expect(processSmtpBounce(token)).resolves.toBe(true);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'bounced', smtpResponseClass: '5xx' }));
    expect(mockSuppression).toHaveBeenCalledWith('recipient@example.net', 'bounce');
    expect(mockAudit).toHaveBeenCalledWith('mailbaby.dsn_received', 'mail_log', 'mail-log-1', expect.objectContaining({ provider: 'mailbaby' }));
    expect(set.mock.calls[0][0]).not.toHaveProperty('rawMessage');
  });

  it('rejects malformed, unknown, and expired tokens', async () => {
    await expect(processSmtpBounce('not-a-token')).resolves.toBe(false);
    expect(mockFindFirst).not.toHaveBeenCalled();

    updateChain();
    mockFindFirst.mockResolvedValue(null);
    await expect(processSmtpBounce('b'.repeat(64))).resolves.toBe(false);

    mockFindFirst.mockResolvedValue({ id: 'expired', bounceExpiresAt: new Date(Date.now() - 1) });
    await expect(processSmtpBounce('c'.repeat(64))).resolves.toBe(false);
  });
});
