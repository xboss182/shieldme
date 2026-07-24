import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockAliasesFindFirst,
  mockSendOutbound,
  mockGetPlatformDomain,
  mockIsForwardingEnabled,
  mockGetOutboundProvider,
  mockIsOutboundConfigured,
  mockDecryptQueuePayload,
} = vi.hoisted(() => ({
  mockAliasesFindFirst: vi.fn(),
  mockSendOutbound: vi.fn().mockResolvedValue('outbound-msg-123'),
  mockGetPlatformDomain: vi.fn().mockReturnValue('shieldme.cc'),
  mockIsForwardingEnabled: vi.fn().mockReturnValue(true),
  mockGetOutboundProvider: vi.fn().mockReturnValue('mailbaby'),
  mockIsOutboundConfigured: vi.fn().mockReturnValue(true),
  mockDecryptQueuePayload: vi.fn((data) => data),
}));

vi.mock('../db/client.js', () => ({
  db: {
    query: {
      aliases: { findFirst: mockAliasesFindFirst },
    },
  },
}));

vi.mock('../lib/redis.js', () => ({ redis: {} }));

vi.mock('../config/env.js', () => ({
  env: {
    APP_URL: 'http://localhost:4000',
    DATABASE_URL: 'postgres://localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379/0',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    PLATFORM_DOMAIN: 'shieldme.cc',
    INBOUND_REPLY_ENABLED: true,
    TRACKING_PROTECTION_ENABLED: 'true',
    TRACKING_PROTECTION_MODE: 'conservative',
    REVERSE_REPLY_MAX_HOPS: 1,
    REVERSE_REPLY_MAX_PER_ALIAS_PER_DAY: 50,
    REVERSE_REPLY_MAX_PER_RECIPIENT_PER_DAY: 50,
  },
}));

vi.mock('../config/runtime-config.js', () => ({
  getPlatformDomain: mockGetPlatformDomain,
  isForwardingEnabled: mockIsForwardingEnabled,
  getOutboundProvider: mockGetOutboundProvider,
  isOutboundConfigured: mockIsOutboundConfigured,
}));

vi.mock('../modules/inbound/outbound.service.js', () => ({
  sendOutbound: mockSendOutbound,
}));

vi.mock('../queues/secure-email-jobs.js', () => ({
  decryptQueuePayload: mockDecryptQueuePayload,
}));

vi.mock('bullmq', () => {
  class MockWorker {
    on() {}
  }
  class MockQueue {
    add() {}
  }
  return { Worker: MockWorker, Queue: MockQueue };
});

import { processReverseReplyJob } from './reverse-reply.worker.js';

function makeAlias() {
  return {
    id: 'alias-uuid-1',
    localPart: 'myalias',
    status: 'active',
    domain: { domain: 'shieldme.cc', isActive: true },
  };
}

function makeJob(payloadOverrides = {}, attemptsMade = 0) {
  return {
    id: 'job-rr-1',
    attemptsMade,
    data: {
      tokenId: 'token123',
      aliasId: 'alias-uuid-1',
      originalSender: 'original-sender@external.com',
      replyFrom: 'recipient@verified.com',
      subject: 'Re: Hello',
      textBody: 'Reply content text',
      htmlBody: '<p>Reply content html</p>',
      inReplyTo: '<msg-1@external.com>',
      references: '<msg-1@external.com>',
      messageId: '<reply-1@verified.com>',
      hop: 1,
      rawMessage: Buffer.from(
        'From: recipient@verified.com\r\nTo: forwarded+token123@shieldme.cc\r\nSubject: Re: Hello\r\n\r\nReply content text',
      ).toString('base64'),
      ...payloadOverrides,
    },
  } as any;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetPlatformDomain.mockReturnValue('shieldme.cc');
  mockIsForwardingEnabled.mockReturnValue(true);
  mockGetOutboundProvider.mockReturnValue('mailbaby');
  mockIsOutboundConfigured.mockReturnValue(true);
  mockSendOutbound.mockResolvedValue('outbound-msg-123');
  mockAliasesFindFirst.mockResolvedValue(makeAlias());
});

describe('processReverseReplyJob (ReverseReplyJob worker)', () => {
  it('relays a valid reverse reply via MailBaby with From: alias@platform and sm-bounces envelope', async () => {
    await processReverseReplyJob(makeJob());

    expect(mockSendOutbound).toHaveBeenCalledOnce();
    const [payload, policy] = mockSendOutbound.mock.calls[0];

    expect(payload.from).toBe('myalias via ShieldMe <myalias@shieldme.cc>');
    expect(payload.to).toBe('original-sender@external.com');
    expect(payload.replyTo).toBe('forwarded+token123@shieldme.cc');
    expect(payload.envelopeFrom).toMatch(/^b\+[a-f0-9]+@sm-bounces\.shieldme\.cc$/);

    // Threading + hop marker check
    expect(payload.headers['In-Reply-To']).toBe('<msg-1@external.com>');
    expect(payload.headers['References']).toBe('<msg-1@external.com>');
    expect(payload.headers['X-ShieldMe-Relay']).toBe('hop=1; by=shieldme.cc');
    expect(payload.headers['Auto-Submitted']).toBe('auto-forwarded');
    expect(policy.pinnedProvider).toBe('mailbaby');
  });

  it('drops silently when alias is inactive', async () => {
    mockAliasesFindFirst.mockResolvedValue({ ...makeAlias(), status: 'disabled' });
    await processReverseReplyJob(makeJob());
    expect(mockSendOutbound).not.toHaveBeenCalled();
  });

  it('drops silently when forwarding is globally disabled', async () => {
    mockIsForwardingEnabled.mockReturnValue(false);
    await processReverseReplyJob(makeJob());
    expect(mockSendOutbound).not.toHaveBeenCalled();
  });

  it('swallows permanent outbound send failures without retrying or bouncing', async () => {
    mockSendOutbound.mockRejectedValue(new Error('550 Permanent failure: blocked'));
    await expect(processReverseReplyJob(makeJob())).resolves.toBeUndefined();
  });
});
