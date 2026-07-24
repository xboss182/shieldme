import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet },
}));

vi.mock('../../config/env.js', () => ({
  env: { GMAIL_SEND_AS_CODE_TTL_SECONDS: 1800 },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  detectGmailSendAs,
  storeGmailSendAsCode,
  fetchGmailSendAsCode,
} from './gmail-send-as.js';

// ── detectGmailSendAs ────────────────────────────────────────────────────────

describe('detectGmailSendAs', () => {
  it('returns false for unrelated sender', () => {
    const result = detectGmailSendAs({
      from: 'noreply@amazon.com',
      subject: 'Gmail Confirmation - Send email as you@example.com',
      textBody: 'Your confirmation code is 123456',
    });
    expect(result.isGmailSendAs).toBe(false);
    expect(result.code).toBeUndefined();
  });

  it('returns false when subject does not match', () => {
    const result = detectGmailSendAs({
      from: 'mail-noreply@google.com',
      subject: 'Your Google account summary',
      textBody: 'Some body with 123456 in it',
    });
    expect(result.isGmailSendAs).toBe(false);
  });

  it('detects standard Gmail Send-As confirmation (mail-noreply)', () => {
    const result = detectGmailSendAs({
      from: 'mail-noreply@google.com',
      subject: 'Gmail Confirmation - Send email as alias@example.com',
      textBody: 'To confirm, enter this code: 654321\n\nThis code expires in 10 minutes.',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBe('654321');
  });

  it('detects noreply@accounts.google.com sender', () => {
    const result = detectGmailSendAs({
      from: 'noreply@accounts.google.com',
      subject: 'Gmail Confirmation - Send email as alias@example.com',
      textBody: 'Confirmation code: 987654',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBe('987654');
  });

  it('detects send-as-noreply@google.com sender', () => {
    const result = detectGmailSendAs({
      from: 'send-as-noreply@google.com',
      subject: 'Confirm Send email as alias@example.com',
      textBody: '112233',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBe('112233');
  });

  it('detects older "verify your new email address" subject format', () => {
    const result = detectGmailSendAs({
      from: 'mail-noreply@google.com',
      subject: 'Gmail: verify your new email address',
      textBody: 'Please enter the code 445566 to confirm.',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBe('445566');
  });

  it('returns isGmailSendAs true but no code when body is absent', () => {
    const result = detectGmailSendAs({
      from: 'mail-noreply@google.com',
      subject: 'Gmail Confirmation - Send email as alias@example.com',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it('returns isGmailSendAs true but no code when body has no digit run', () => {
    const result = detectGmailSendAs({
      from: 'mail-noreply@google.com',
      subject: 'Gmail Confirmation - Send email as alias@example.com',
      textBody: 'Please click the link to confirm.',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it('ignores a 5-digit run (too short)', () => {
    const result = detectGmailSendAs({
      from: 'mail-noreply@google.com',
      subject: 'Gmail Confirmation - Send email as alias@example.com',
      textBody: 'Code: 12345',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBeUndefined();
  });

  it('accepts a 9-digit code', () => {
    const result = detectGmailSendAs({
      from: 'mail-noreply@google.com',
      subject: 'Gmail Confirmation - Send email as alias@example.com',
      textBody: 'Code: 123456789',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBe('123456789');
  });

  it('is case-insensitive on sender', () => {
    const result = detectGmailSendAs({
      from: 'MAIL-NOREPLY@GOOGLE.COM',
      subject: 'Gmail Confirmation - Send email as alias@example.com',
      textBody: 'Code: 246810',
    });
    expect(result.isGmailSendAs).toBe(true);
    expect(result.code).toBe('246810');
  });
});

// ── storeGmailSendAsCode ─────────────────────────────────────────────────────

describe('storeGmailSendAsCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls redis.set with the correct key and TTL', async () => {
    mockRedisSet.mockResolvedValue('OK');
    await storeGmailSendAsCode('alias-123', '654321');
    expect(mockRedisSet).toHaveBeenCalledOnce();
    const [key, value, exFlag, ttl] = mockRedisSet.mock.calls[0];
    expect(key).toBe('sm:send_as_code:alias-123');
    expect(exFlag).toBe('EX');
    expect(ttl).toBe(1800);
    const parsed = JSON.parse(value as string);
    expect(parsed.code).toBe('654321');
    expect(typeof parsed.storedAt).toBe('string');
  });

  it('stores only code and storedAt — no body fields', async () => {
    mockRedisSet.mockResolvedValue('OK');
    await storeGmailSendAsCode('alias-abc', '111222');
    const stored = JSON.parse(mockRedisSet.mock.calls[0][1] as string);
    expect(Object.keys(stored).sort()).toEqual(['code', 'storedAt']);
  });
});

// ── fetchGmailSendAsCode ─────────────────────────────────────────────────────

describe('fetchGmailSendAsCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when Redis has no entry', async () => {
    mockRedisGet.mockResolvedValue(null);
    expect(await fetchGmailSendAsCode('alias-xyz')).toBeNull();
  });

  it('returns the stored code', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ code: '999888', storedAt: new Date().toISOString() }));
    expect(await fetchGmailSendAsCode('alias-xyz')).toBe('999888');
  });

  it('returns null for corrupt JSON', async () => {
    mockRedisGet.mockResolvedValue('{not valid json');
    expect(await fetchGmailSendAsCode('alias-xyz')).toBeNull();
  });

  it('returns null when stored value has no code field', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ storedAt: new Date().toISOString() }));
    expect(await fetchGmailSendAsCode('alias-xyz')).toBeNull();
  });

  it('uses the correct Redis key', async () => {
    mockRedisGet.mockResolvedValue(null);
    await fetchGmailSendAsCode('my-alias-id');
    expect(mockRedisGet).toHaveBeenCalledWith('sm:send_as_code:my-alias-id');
  });
});
