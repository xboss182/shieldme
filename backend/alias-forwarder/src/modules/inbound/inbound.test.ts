import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDomainsFind, mockAliasesFind, mockMailLogsInsert, mockQueueAdd, mockInsertValues, mockBuildEncryptedEmailForwardingJob,
        mockIsSenderBlocked, mockIsRecipientSuppressed, mockCheckRateLimits,
        mockIsLoopSender, mockDetectAutoReplyHeaders, mockIsDuplicate, mockScanInboundMail } = vi.hoisted(() => ({
  mockDomainsFind: vi.fn(),
  mockAliasesFind: vi.fn(),
  mockMailLogsInsert: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockInsertValues: vi.fn(),
  mockBuildEncryptedEmailForwardingJob: vi.fn((payload) => ({ encrypted: true, iv: 'iv', tag: 'tag', ciphertext: Buffer.from(JSON.stringify(payload)).toString('base64'), ttl: { queuedAt: 1000, expiresAt: 901000 } })),
  mockIsSenderBlocked: vi.fn(),
  mockIsRecipientSuppressed: vi.fn(),
  mockCheckRateLimits: vi.fn(),
  mockIsLoopSender: vi.fn(),
  mockDetectAutoReplyHeaders: vi.fn(),
  mockIsDuplicate: vi.fn(),
  mockScanInboundMail: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      domains: { findFirst: mockDomainsFind },
      aliases: { findFirst: mockAliasesFind },
      mailLogs: { findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnValue({
      values: mockInsertValues.mockReturnValue({
        returning: mockMailLogsInsert,
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock('../../queues/email-jobs.js', () => ({
  emailForwardingQueueName: 'email-forwarding',
  buildEncryptedEmailForwardingJob: mockBuildEncryptedEmailForwardingJob,
  emailForwardingQueue: { add: mockQueueAdd },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../config/env.js', () => ({
  env: { PLATFORM_DOMAIN: 'mail.platform.com' },
}));

vi.mock('../../config/runtime-config.js', () => ({
  getPlatformDomain: () => 'mail.platform.com',
  getResendApiKey: () => undefined,
  getOutboundProvider: () => 'mailbaby',
  setRuntimeConfig: vi.fn(),
  getRuntimeConfig: () => ({}),
  isForwardingEnabled: () => true,
}));

vi.mock('../spam/spam-scanner.service.js', () => ({
  scanInboundMail: mockScanInboundMail,
}));

vi.mock('../abuse/abuse.service.js', () => ({
  AbuseError: class AbuseError extends Error {
    constructor(msg: string, public statusCode = 550) { super(msg); }
  },
  isSenderBlocked: mockIsSenderBlocked,
  isRecipientSuppressed: mockIsRecipientSuppressed,
  checkRateLimits: mockCheckRateLimits,
  isLoopSender: mockIsLoopSender,
  detectAutoReplyHeaders: mockDetectAutoReplyHeaders,
  isDuplicate: mockIsDuplicate,
}));

import { handleInbound, resolveAlias, InboundError } from './inbound.service.js';

const ALIAS_ID = 'a0000000-0000-0000-0000-000000000001';
const DOMAIN_ID = 'd0000000-0000-0000-0000-000000000002';
const LOG_ID    = 'l0000000-0000-0000-0000-000000000003';
const JOB_ID    = 'j0000000-0000-0000-0000-000000000004';

function makeDomain(overrides = {}) {
  return { id: DOMAIN_ID, domain: 'example.com', status: 'verified', isActive: true, ...overrides };
}

function makeAlias(overrides = {}) {
  return {
    id: ALIAS_ID, localPart: 'hello', domainId: DOMAIN_ID, status: 'active', ownerId: 'owner-1',
    recipient: { id: 'r1', email: 'user@personal.com', status: 'verified', isActive: true },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMailLogsInsert.mockResolvedValue([{ id: LOG_ID }]);
  mockQueueAdd.mockResolvedValue({ id: JOB_ID });
  mockIsSenderBlocked.mockResolvedValue(false);
  mockIsRecipientSuppressed.mockResolvedValue(false);
  mockCheckRateLimits.mockResolvedValue(undefined);
  mockIsLoopSender.mockReturnValue(false);
  mockDetectAutoReplyHeaders.mockReturnValue(null);
  mockIsDuplicate.mockResolvedValue(false);
  mockScanInboundMail.mockResolvedValue({ enabled: true, score: 0, category: 'clean', reason: 'Ham', action: 'allow' });
  mockBuildEncryptedEmailForwardingJob.mockImplementation((payload) => ({ encrypted: true, iv: 'iv', tag: 'tag', ciphertext: Buffer.from(JSON.stringify(payload)).toString('base64'), ttl: { queuedAt: 1000, expiresAt: 901000 } }));
});

describe('resolveAlias', () => {
  it('returns null for address without @', async () => {
    expect(await resolveAlias('noDomain')).toBeNull();
  });

  it('returns null when domain not found', async () => {
    mockDomainsFind.mockResolvedValue(null);
    expect(await resolveAlias('hello@unknown.com')).toBeNull();
  });

  it('returns null when alias local-part not found', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(null);
    expect(await resolveAlias('notexist@example.com')).toBeNull();
  });

  it('returns alias+domain when found', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    const result = await resolveAlias('hello@example.com');
    expect(result).not.toBeNull();
    expect(result!.alias.localPart).toBe('hello');
  });
});

describe('handleInbound', () => {
  const validEnvelope = { from: 'sender@external.com', to: 'hello@example.com' };

  it('enqueues job for valid alias', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    const result = await handleInbound(validEnvelope);
    expect(result.jobId).toBe(JOB_ID);
    expect(result.logId).toBe(LOG_ID);
    expect(mockQueueAdd).toHaveBeenCalledOnce();
    expect(mockScanInboundMail).toHaveBeenCalledOnce();
  });

  it('persists the matched SMTP alias and queues its authoritative mail-log reference', async () => {
    const matchedAlias = 'netflix-2sdf7@shieldme.cc';
    mockDomainsFind.mockResolvedValue(makeDomain({ domain: 'shieldme.cc' }));
    mockAliasesFind.mockResolvedValue(makeAlias({ localPart: 'netflix-2sdf7' }));

    await handleInbound({
      from: 'original-sender@senderdomain.test',
      to: matchedAlias,
      subject: 'Subscription notice',
    });

    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      aliasId: ALIAS_ID,
      envelopeFrom: 'original-sender@senderdomain.test',
      envelopeTo: matchedAlias,
      forwardedTo: 'user@personal.com',
      status: 'queued',
    }));
    expect(mockBuildEncryptedEmailForwardingJob).toHaveBeenCalledWith(expect.objectContaining({
      aliasId: ALIAS_ID,
      messageId: LOG_ID,
      originalFrom: 'original-sender@senderdomain.test',
    }));
  });

  it('stores parsed mail authentication results without rejecting the message', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());

    await handleInbound({
      ...validEnvelope,
      headers: {
        'Authentication-Results': 'mx.shieldme.cc; spf=pass smtp.mailfrom=external.com; dkim=fail header.d=external.com; dmarc=pass header.from=external.com',
      },
    });

    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      authResults: expect.objectContaining({
        spf: 'pass',
        dkim: 'fail',
        dmarc: 'pass',
        source: 'authentication-results-header',
      }),
      authFailureCount: 1,
    }));
  });


  it('stores spam metadata and tags suspicious mail without plaintext persistence', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    mockScanInboundMail.mockResolvedValue({ enabled: true, score: 1, category: 'spam', reason: 'GTUBE', action: 'tag' });

    await handleInbound({ ...validEnvelope, subject: 'Win money', textBody: 'body text', rawMessage: Buffer.from('raw message body') });

    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      spamScore: 1000,
      spamCategory: 'spam',
      spamAction: 'tag',
      spamScan: expect.objectContaining({ reason: 'GTUBE' }),
    }));
    expect(mockInsertValues.mock.calls[0][0]).not.toHaveProperty('textBody');
    expect(mockInsertValues.mock.calls[0][0]).not.toHaveProperty('rawMessage');
    expect(mockBuildEncryptedEmailForwardingJob).toHaveBeenCalledWith(expect.objectContaining({
      spamScan: expect.objectContaining({ action: 'tag' }),
      textBody: 'body text',
      rawMessage: Buffer.from('raw message body').toString('base64'),
    }));
    const queuedPayload = mockQueueAdd.mock.calls[0][1];
    expect(queuedPayload).toEqual(expect.objectContaining({ encrypted: true, ciphertext: expect.any(String) }));
    expect(queuedPayload).not.toHaveProperty('textBody');
  });

  it('rejects high-confidence spam when configured by scanner action', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    mockScanInboundMail.mockResolvedValue({ enabled: true, score: 1, category: 'spam', reason: 'GTUBE', action: 'reject' });

    await expect(handleInbound(validEnvelope)).rejects.toMatchObject({ statusCode: 550 });
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected',
      rejectionReason: 'spam_reject',
      spamAction: 'reject',
    }));
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('does not scan when scanner is disabled', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    mockScanInboundMail.mockResolvedValue({ enabled: false, score: 0, category: 'clean', reason: 'scanner_disabled', action: 'allow' });

    await handleInbound(validEnvelope);

    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      spamScan: expect.objectContaining({ enabled: false }),
      spamAction: 'allow',
    }));
    expect(mockQueueAdd).toHaveBeenCalledOnce();
  });

  it('rejects when alias not found', async () => {
    mockDomainsFind.mockResolvedValue(null);
    await expect(handleInbound(validEnvelope)).rejects.toBeInstanceOf(InboundError);
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('rejects disabled alias', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias({ status: 'disabled' }));
    await expect(handleInbound(validEnvelope)).rejects.toMatchObject({ statusCode: 550 });
  });

  it('rejects deleted alias', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias({ status: 'deleted' }));
    await expect(handleInbound(validEnvelope)).rejects.toMatchObject({ statusCode: 550 });
  });

  it('rejects unverified recipient', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias({ recipient: { id: 'r1', email: 'x@y.com', status: 'pending', isActive: true } }));
    await expect(handleInbound(validEnvelope)).rejects.toMatchObject({ statusCode: 550 });
  });

  it('rejects suppressed recipient', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    mockIsRecipientSuppressed.mockResolvedValue(true);
    await expect(handleInbound(validEnvelope)).rejects.toMatchObject({ statusCode: 550 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('rejects blocked sender', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    mockIsSenderBlocked.mockResolvedValue(true);
    await expect(handleInbound(validEnvelope)).rejects.toMatchObject({ statusCode: 550 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('rejects when rate limited', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    const { AbuseError } = await import('../abuse/abuse.service.js');
    mockCheckRateLimits.mockRejectedValue(new AbuseError('Rate limit exceeded for alias', 452));
    await expect(handleInbound(validEnvelope)).rejects.toMatchObject({ statusCode: 452 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('rejects loop sender (platform domain)', async () => {
    mockIsLoopSender.mockReturnValue(true);
    await expect(handleInbound({ from: 'forward+x@mail.platform.com', to: 'hello@example.com' }))
      .rejects.toMatchObject({ statusCode: 550 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('rejects auto-reply headers', async () => {
    mockDetectAutoReplyHeaders.mockReturnValue('auto_reply_loop');
    await expect(handleInbound({ ...validEnvelope, headers: { 'Auto-Submitted': 'auto-replied' } }))
      .rejects.toMatchObject({ statusCode: 550 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('rejects duplicate message-id', async () => {
    mockIsDuplicate.mockResolvedValue(true);
    await expect(handleInbound({ ...validEnvelope, messageId: '<dup@host>' }))
      .rejects.toMatchObject({ statusCode: 250 });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it('does not check dedup when no messageId', async () => {
    mockDomainsFind.mockResolvedValue(makeDomain());
    mockAliasesFind.mockResolvedValue(makeAlias());
    const result = await handleInbound(validEnvelope); // no messageId
    expect(mockIsDuplicate).not.toHaveBeenCalled();
    expect(result.jobId).toBe(JOB_ID);
  });
});
