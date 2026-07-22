import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockMailLogsFindFirst,
  mockAliasesFindFirst,
  mockMailLogsUpdate,
  mockIsOutboundConfigured,
  mockSendOutbound,
  mockGetArmoredKey,
  mockEncryptWithPgpKey,
  mockGetPlatformDomain,
  mockIsForwardingEnabled,
  mockGetOutboundProvider,
  mockAssertMonthlyForwardAllowed,
  mockAssertOutboundProviderAllowed,
  mockDecryptQueuePayload,
  mockBuildForwardBanner,
  mockBuildForwardBannerText,
  mockIsMailBabyCircuitOpen,
  mockRecordMailBabyFailure,
  mockRecordMailBabySuccess,
  mockAddToSuppressionList,
  MockMailBabyError,
} = vi.hoisted(() => {
  class MailBabyError extends Error {
    constructor(
      code: string,
      public readonly failureType: 'transient' | 'permanent',
      public readonly kind: 'recipient' | 'provider' | 'transport',
    ) {
      super(code);
    }
  }
  return {
  mockMailLogsFindFirst: vi.fn(),
  mockAliasesFindFirst: vi.fn(),
  mockMailLogsUpdate: vi.fn(),
  mockIsOutboundConfigured: vi.fn().mockReturnValue(true),
  mockSendOutbound: vi.fn().mockResolvedValue('outbound-msg-id'),
  mockGetArmoredKey: vi.fn(),
  mockEncryptWithPgpKey: vi.fn(),
  mockGetPlatformDomain: vi.fn().mockReturnValue('shieldme.cc'),
  mockIsForwardingEnabled: vi.fn().mockReturnValue(true),
  mockGetOutboundProvider: vi.fn().mockReturnValue('resend'),
  mockAssertMonthlyForwardAllowed: vi.fn().mockResolvedValue(undefined),
  mockAssertOutboundProviderAllowed: vi.fn().mockResolvedValue(undefined),
  mockDecryptQueuePayload: vi.fn((data) => data),
  mockBuildForwardBanner: vi.fn().mockReturnValue('<banner/>'),
  mockBuildForwardBannerText: vi.fn().mockReturnValue('[banner] '),
  mockIsMailBabyCircuitOpen: vi.fn().mockResolvedValue(false),
  mockRecordMailBabyFailure: vi.fn().mockResolvedValue(undefined),
  mockRecordMailBabySuccess: vi.fn().mockResolvedValue(undefined),
  mockAddToSuppressionList: vi.fn().mockResolvedValue(undefined),
  MockMailBabyError: MailBabyError,
  };
});

vi.mock('../db/client.js', () => ({
  db: {
    query: {
      mailLogs: { findFirst: mockMailLogsFindFirst },
      aliases: { findFirst: mockAliasesFindFirst },
    },
    update: mockMailLogsUpdate,
  },
}));

vi.mock('../modules/inbound/outbound.service.js', () => ({
  sendOutbound: mockSendOutbound,
  isOutboundConfigured: mockIsOutboundConfigured,
  isPermanentOutboundError: vi.fn((error) => error?.failureType === 'permanent'),
  isMailBabyCircuitOpen: mockIsMailBabyCircuitOpen,
  recordMailBabyFailure: mockRecordMailBabyFailure,
  recordMailBabySuccess: mockRecordMailBabySuccess,
  MailBabyError: MockMailBabyError,
}));

vi.mock('../modules/pgp/pgp.service.js', () => ({
  getArmoredKeyForRecipient: mockGetArmoredKey,
  encryptWithPgpKey: mockEncryptWithPgpKey,
}));

vi.mock('../modules/abuse/abuse.service.js', () => ({
  addToSuppressionList: mockAddToSuppressionList,
}));

vi.mock('../modules/plans/plans.js', () => ({
  assertMonthlyForwardAllowed: mockAssertMonthlyForwardAllowed,
  assertOutboundProviderAllowed: mockAssertOutboundProviderAllowed,
  PlanLimitError: class PlanLimitError extends Error { constructor(message: string, public statusCode = 402) { super(message); } },
}));

vi.mock('../config/runtime-config.js', () => ({
  getPlatformDomain: mockGetPlatformDomain,
  isForwardingEnabled: mockIsForwardingEnabled,
  getOutboundProvider: mockGetOutboundProvider,
  isOutboundConfigured: mockIsOutboundConfigured,
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../modules/spam/spam-scanner.service.js', () => ({
  buildSpamHeaders: vi.fn((scan) => ({ 'X-ShieldMe-Spam-Status': scan.category === 'spam' ? 'Yes' : 'No', 'X-ShieldMe-Spam-Action': scan.action })),
  tagSubject: vi.fn((subject, scan) => scan.action === 'tag' && scan.category === 'spam' ? `[SPAM] ${subject}` : subject),
}));

vi.mock('../lib/forward-banner.js', () => ({
  buildForwardBanner: mockBuildForwardBanner,
  buildForwardBannerText: mockBuildForwardBannerText,
}));

vi.mock('../lib/redis.js', () => ({ redis: {} }));

vi.mock('../config/env.js', () => ({
  env: {
    APP_URL: 'http://localhost:4000',
    DATABASE_URL: 'postgres://localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379/0',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    BCRYPT_SALT_ROUNDS: 4,
    EMAIL_QUEUE_PAYLOAD_TTL_SECONDS: 900,
    TRACKING_PROTECTION_ENABLED: 'true',
    TRACKING_PROTECTION_MODE: 'conservative',
  },
}));

vi.mock('../queues/secure-email-jobs.js', () => ({
  decryptQueuePayload: mockDecryptQueuePayload,
}));

// Mock bullmq — must include both Worker and Queue as constructable classes
vi.mock('bullmq', () => {
  class MockWorker {
    constructor(_name: string, processor: Function) {
      (globalThis as any).__forwardingProcessor = processor;
    }
    on() {}
  }
  class MockQueue {
    constructor() {}
    on() {}
  }
  return { Worker: MockWorker, Queue: MockQueue };
});

// Import worker module to trigger Worker instantiation
import '../workers/forwarding.worker.js';

function getProcessor(): Function {
  const processor = (globalThis as any).__forwardingProcessor;
  if (!processor) throw new Error('Worker processor not captured');
  return processor;
}

function makeUpdateChain() {
  const whereFn = vi.fn().mockResolvedValue([]);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  mockMailLogsUpdate.mockReturnValue({ set: setFn });
  return { setFn, whereFn };
}

function makeAlias(pgpMode: 'none' | 'optional' | 'required' = 'none') {
  return {
    id: 'alias-1',
    localPart: 'hello',
    status: 'active',
    pgpMode,
    domain: { domain: 'example.com', isActive: true },
    recipient: { id: 'recip-1', email: 'user@personal.com', status: 'verified', isActive: true },
  };
}

function makeLog() {
  return {
    id: 'log-1',
    envelopeFrom: 'sender@sender.com',
    envelopeTo: 'hello@example.com',
    externalMessageId: 'ext-msg-1',
  };
}

function makeJob(overrides = {}) {
  return {
    id: 'job-1',
    data: {
      aliasId: 'alias-1',
      messageId: 'log-1',
      originalFrom: 'sender@sender.com',
      subject: 'Test subject',
      textBody: 'Hello world',
       htmlBody: '<p>Hello world</p>',
       bounceToken: 'a'.repeat(64),
       outboundProvider: 'mailbaby',
      ...overrides,
    },
  };
}

describe('forwarding worker — outbound provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBuildForwardBanner.mockReturnValue('<banner/>');
    mockBuildForwardBannerText.mockReturnValue('[banner] ');
    mockIsOutboundConfigured.mockImplementation((provider) => provider === 'resend' || provider === 'mailbaby');
    mockSendOutbound.mockResolvedValue('outbound-msg-id');
    mockGetPlatformDomain.mockReturnValue('shieldme.cc');
    mockIsForwardingEnabled.mockReturnValue(true);
    mockGetOutboundProvider.mockReturnValue('mailbaby');
    mockAssertMonthlyForwardAllowed.mockClear();
    mockAssertOutboundProviderAllowed.mockClear();
    mockDecryptQueuePayload.mockImplementation((data) => data);
    makeUpdateChain();
  });

  it('skips forwarding and marks failed when pinned outbound provider is not configured', async () => {
    mockIsOutboundConfigured.mockImplementation((provider) => provider === 'resend');
    const { setFn } = makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob({ outboundProvider: 'mailbaby' }));

    expect(mockSendOutbound).not.toHaveBeenCalled();
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        outboundProvider: 'mailbaby',
        failureType: 'permanent',
        failureReason: 'outbound_not_configured',
        rejectionReason: 'outbound_not_configured',
      }),
    );
  });

  it('fails closed when legacy queue payload is unpinned', async () => {
    const { setFn } = makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob({ outboundProvider: null }));

    expect(mockSendOutbound).not.toHaveBeenCalled();
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureType: 'permanent',
        failureReason: 'unpinned_legacy_job_rejected',
        rejectionReason: 'unpinned_legacy_job_rejected',
      }),
    );
  });

  it('delivers MailBaby with a rewritten raw MIME message and explicit bounce envelope', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    makeUpdateChain();
    const rawMessage = Buffer.from([
      'From: sender@sender.com',
      'Message-ID: <original@example.test>',
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="part"',
      '',
      '--part',
      'Content-Type: text/plain',
      '',
      'Message body',
      '--part',
      'Content-Type: image/png',
      'Content-Disposition: inline; filename="logo.png"',
      'Content-ID: <logo>',
      'Content-Transfer-Encoding: base64',
      '',
      'aW1hZ2UtYnl0ZXM=',
      '--part--',
      '',
    ].join('\r\n'));

    const processor = getProcessor();
    await processor(makeJob({ outboundProvider: 'mailbaby', rawMessageBase64: rawMessage.toString('base64') }));

    expect(mockSendOutbound).toHaveBeenCalledOnce();
    const [message, policy] = mockSendOutbound.mock.calls[0];
    expect(policy.pinnedProvider).toBe('mailbaby');
    expect(message.envelopeFrom).toMatch(/^b\+[a-f0-9]{64}@sm-bounces\.shieldme\.cc$/);
    expect(message.raw).toEqual(expect.any(Buffer));
    expect(message.raw.toString('latin1')).toContain('From: "sender sender.com via ShieldMe" <forwarded+hello@shieldme.cc>');
    expect(message.raw.toString('latin1')).toContain('Reply-To: sender@sender.com');
    expect(message.raw.toString('latin1')).toMatch(/Message-ID: <[a-f0-9]{64}@shieldme\.cc>/);
    expect(message.raw.toString('latin1')).toContain('X-ShieldMe-Original-DKIM: removed-after-rewrite');
    expect(message.raw.toString('latin1')).toMatch(/X-ShieldMe-Original-SHA256: [a-f0-9]{64}/);
    expect(message.raw.toString('latin1')).toContain('Content-Disposition: inline; filename="logo.png"');
    expect(message.raw.subarray(message.raw.indexOf('\r\n\r\n') + 4)).toEqual(rawMessage.subarray(rawMessage.indexOf('\r\n\r\n') + 4));
    expect(mockRecordMailBabySuccess).toHaveBeenCalledOnce();
  });

  it('fails closed when a legacy MailBaby job has no DSN correlation token', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    const { setFn } = makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob({ outboundProvider: 'mailbaby', bounceToken: undefined }));

    expect(mockSendOutbound).not.toHaveBeenCalled();
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      failureType: 'permanent',
      failureReason: 'mailbaby_bounce_token_missing',
    }));
  });

  it('fails closed when encrypted raw MIME declares an incomplete multipart body', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    const { setFn } = makeUpdateChain();
    const malformed = Buffer.from('Content-Type: multipart/mixed; boundary="part"\r\n\r\n--part\r\nContent-Type: text/plain\r\n\r\nHi\r\n');

    const processor = getProcessor();
    await processor(makeJob({ outboundProvider: 'mailbaby', rawMessageBase64: malformed.toString('base64') }));

    expect(mockSendOutbound).not.toHaveBeenCalled();
    expect(setFn).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      failureReason: 'mailbaby_raw_message_invalid',
    }));
  });

  it('proceeds with Resend-pinned retry when global config is MailBaby but MailBaby is unconfigured and Resend is configured', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    makeUpdateChain();
    mockGetOutboundProvider.mockReturnValue('mailbaby');
    mockIsOutboundConfigured.mockImplementation((provider) => provider === 'resend');

    const processor = getProcessor();
    await processor(makeJob({ outboundProvider: 'resend' }));

    expect(mockSendOutbound).toHaveBeenCalledOnce();
    const policyCall = mockSendOutbound.mock.calls[0][1];
    expect(policyCall.pinnedProvider).toBe('resend');
  });

  it('suppresses a MailBaby recipient bounce without switching providers', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    makeUpdateChain();
    mockSendOutbound.mockRejectedValue(new MockMailBabyError('mailbaby_recipient_5xx', 'permanent', 'recipient'));

    const processor = getProcessor();
    await processor(makeJob({ outboundProvider: 'mailbaby' }));

    expect(mockRecordMailBabyFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: 'recipient' }));
    expect(mockAddToSuppressionList).toHaveBeenCalledWith('user@personal.com', 'bounce');
    expect(mockSendOutbound).toHaveBeenCalledOnce();
    expect(mockSendOutbound.mock.calls[0][1].pinnedProvider).toBe('mailbaby');
  });

  it('adds spam headers and tags subject for suspicious mail', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob({ spamScan: { enabled: true, score: 1, category: 'spam', reason: 'GTUBE', action: 'tag' } }));

    const sendCall = mockSendOutbound.mock.calls[0][0];
    expect(sendCall.subject).toBe('[SPAM] Test subject');
    expect(sendCall.headers).toEqual(expect.objectContaining({
      'X-ShieldMe-Spam-Status': 'Yes',
      'X-ShieldMe-Spam-Action': 'tag',
    }));
  });

  it('attributes both banners to the matched inbound alias persisted in the mail log', async () => {
    mockMailLogsFindFirst.mockResolvedValue({
      ...makeLog(),
      envelopeFrom: 'original-sender@senderdomain.test',
      envelopeTo: 'netflix-2sdf7@shieldme.cc',
      forwardedTo: 'destination@personal.test',
    });
    mockAliasesFindFirst.mockResolvedValue({
      ...makeAlias('none'),
      recipient: { id: 'recip-1', email: 'destination@personal.test', status: 'verified', isActive: true },
    });
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob({ originalFrom: 'original-sender@senderdomain.test' }));

    const expectedOptions = {
      matchedAlias: 'netflix-2sdf7@shieldme.cc',
      dashboardUrl: 'https://app.shieldme.cc/aliases',
      trackingProtection: { enabled: true, pixelsRemoved: 0, linksRewritten: 0 },
    };
    expect(mockBuildForwardBanner).toHaveBeenCalledWith(expectedOptions);
    expect(mockBuildForwardBannerText).toHaveBeenCalledWith(expectedOptions);
    expect(mockBuildForwardBanner).not.toHaveBeenCalledWith(expect.objectContaining({
      matchedAlias: 'original-sender@senderdomain.test',
    }));
    expect(mockBuildForwardBanner).not.toHaveBeenCalledWith(expect.objectContaining({
      matchedAlias: 'destination@personal.test',
    }));
  });

  it('passes nonzero tracking cleanup results to the unified banner', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob({
      htmlBody: '<img src="https://tracker.test/open.gif" width="1" height="1"><a href="https://sender.test/story?utm_source=email">Read</a>',
    }));

    expect(mockBuildForwardBanner).toHaveBeenCalledWith(expect.objectContaining({
      trackingProtection: { enabled: true, pixelsRemoved: 1, linksRewritten: 1 },
    }));
  });
});

describe('forwarding worker — pgpMode enforcement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockBuildForwardBanner.mockReturnValue('<banner/>');
    mockBuildForwardBannerText.mockReturnValue('[banner] ');
    mockIsOutboundConfigured.mockReturnValue(true);
    mockSendOutbound.mockResolvedValue('outbound-msg-id');
    mockGetPlatformDomain.mockReturnValue('shieldme.cc');
    mockIsForwardingEnabled.mockReturnValue(true);
    mockGetOutboundProvider.mockReturnValue('mailbaby');
    mockAssertMonthlyForwardAllowed.mockClear();
    mockAssertOutboundProviderAllowed.mockClear();
    mockDecryptQueuePayload.mockImplementation((data) => data);
    makeUpdateChain();
  });

  it('pgpMode=none: skips PGP lookup and delivers plaintext', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('none'));
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob());

    expect(mockGetArmoredKey).not.toHaveBeenCalled();
    expect(mockEncryptWithPgpKey).not.toHaveBeenCalled();
    expect(mockSendOutbound).toHaveBeenCalledOnce();
  });

  it('pgpMode=optional with key: encrypts and delivers', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('optional'));
    mockGetArmoredKey.mockResolvedValue('-----BEGIN PGP PUBLIC KEY BLOCK-----\nfake\n-----END PGP PUBLIC KEY BLOCK-----');
    mockEncryptWithPgpKey.mockResolvedValue('-----BEGIN PGP MESSAGE-----\nencrypted\n-----END PGP MESSAGE-----');
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob());

    expect(mockGetArmoredKey).toHaveBeenCalledWith('recip-1');
    expect(mockEncryptWithPgpKey).toHaveBeenCalledOnce();
    expect(mockSendOutbound).toHaveBeenCalledOnce();
    const sendCall = mockSendOutbound.mock.calls[0][0];
    expect(sendCall.textBody).toContain('-----BEGIN PGP MESSAGE-----');
  });

  it('pgpMode=optional without key: delivers plaintext', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('optional'));
    mockGetArmoredKey.mockResolvedValue(null);
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob());

    expect(mockGetArmoredKey).toHaveBeenCalledWith('recip-1');
    expect(mockEncryptWithPgpKey).not.toHaveBeenCalled();
    expect(mockSendOutbound).toHaveBeenCalledOnce();
  });

  it('pgpMode=required with key: encrypts and delivers', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('required'));
    mockGetArmoredKey.mockResolvedValue('-----BEGIN PGP PUBLIC KEY BLOCK-----\nfake\n-----END PGP PUBLIC KEY BLOCK-----');
    mockEncryptWithPgpKey.mockResolvedValue('-----BEGIN PGP MESSAGE-----\nencrypted\n-----END PGP MESSAGE-----');
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob());

    expect(mockEncryptWithPgpKey).toHaveBeenCalledOnce();
    expect(mockSendOutbound).toHaveBeenCalledOnce();
  });

  it('pgpMode=required without key: rejects with pgp_key_required', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('required'));
    mockGetArmoredKey.mockResolvedValue(null);
    const { setFn } = makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob());

    expect(mockSendOutbound).not.toHaveBeenCalled();
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', rejectionReason: 'pgp_key_required' }),
    );
  });

  it('pgpMode=required with encryption failure: rejects with pgp_encryption_failed', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('required'));
    mockGetArmoredKey.mockResolvedValue('-----BEGIN PGP PUBLIC KEY BLOCK-----\nfake\n-----END PGP PUBLIC KEY BLOCK-----');
    mockEncryptWithPgpKey.mockRejectedValue(new Error('encryption error'));
    const { setFn } = makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob());

    expect(mockSendOutbound).not.toHaveBeenCalled();
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', rejectionReason: 'pgp_encryption_failed' }),
    );
  });

  it('pgpMode=optional with encryption failure: falls through to plaintext', async () => {
    mockMailLogsFindFirst.mockResolvedValue(makeLog());
    mockAliasesFindFirst.mockResolvedValue(makeAlias('optional'));
    mockGetArmoredKey.mockResolvedValue('-----BEGIN PGP PUBLIC KEY BLOCK-----\nfake\n-----END PGP PUBLIC KEY BLOCK-----');
    mockEncryptWithPgpKey.mockRejectedValue(new Error('encryption error'));
    makeUpdateChain();

    const processor = getProcessor();
    await processor(makeJob());

    expect(mockSendOutbound).toHaveBeenCalledOnce();
  });
});
