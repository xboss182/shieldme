import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const { mockInsertValues, mockFindFirst, mockDeleteWhere, mockSelectWhere, mockGenerateToken } = vi.hoisted(() => ({
  mockInsertValues: vi.fn(),
  mockFindFirst: vi.fn(),
  mockDeleteWhere: vi.fn(),
  mockSelectWhere: vi.fn(),
  mockGenerateToken: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      reverseReplyTokens: { findFirst: mockFindFirst },
    },
    insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockDeleteWhere }) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockSelectWhere }) }),
  },
}));

vi.mock('../../lib/tokens.js', () => ({
  generateToken: mockGenerateToken,
}));

vi.mock('../../config/env.js', () => ({
  env: {
    INBOUND_REPLY_TOKEN_TTL_MINUTES: 60,
    INBOUND_REPLY_MAX_MESSAGE_BYTES: 1024,
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  hashReverseReplyToken,
  mintReverseReplyToken,
  resolveReverseReplyToken,
  purgeExpiredReverseReplyTokens,
} from './reverse-reply.service.js';

const ALIAS_ID = 'a0000000-0000-0000-0000-000000000001';
const RAW_TOKEN = 'a'.repeat(64); // valid 64-hex-char shape
const EXPECTED_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  mockInsertValues.mockResolvedValue(undefined);
  mockGenerateToken.mockReturnValue(RAW_TOKEN);
});

describe('hashReverseReplyToken', () => {
  it('produces a stable SHA-256 hex digest and never returns the raw token', () => {
    const hash = hashReverseReplyToken(RAW_TOKEN);
    expect(hash).toBe(EXPECTED_HASH);
    expect(hash).not.toBe(RAW_TOKEN);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('mintReverseReplyToken', () => {
  it('returns the raw token and persists only its hash + binding + expiry', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const token = await mintReverseReplyToken({ aliasId: ALIAS_ID, originalSender: 'sender@external.com', now });

    expect(token).toBe(RAW_TOKEN);
    expect(mockInsertValues).toHaveBeenCalledOnce();
    const values = mockInsertValues.mock.calls[0][0];
    expect(values.tokenHash).toBe(EXPECTED_HASH);
    expect(values.aliasId).toBe(ALIAS_ID);
    expect(values.originalSender).toBe('sender@external.com');
    // TTL of 60 minutes from `now`.
    expect(values.expiresAt.getTime()).toBe(now.getTime() + 60 * 60_000);
    // The raw token must never be stored.
    expect(JSON.stringify(values)).not.toContain(RAW_TOKEN);
  });
});

describe('resolveReverseReplyToken (fail-closed)', () => {
  it('returns null for a malformed token without hitting the DB', async () => {
    expect(await resolveReverseReplyToken('not-hex!!')).toBeNull();
    expect(await resolveReverseReplyToken('abc')).toBeNull(); // too short
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('returns null when the token hash is unknown', async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await resolveReverseReplyToken(RAW_TOKEN)).toBeNull();
  });

  it('looks up by the hash of the token, never the raw token', async () => {
    mockFindFirst.mockResolvedValue(null);
    await resolveReverseReplyToken(RAW_TOKEN);
    expect(mockFindFirst).toHaveBeenCalledOnce();
  });

  it('returns null for an expired binding', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    mockFindFirst.mockResolvedValue({
      id: 't1', aliasId: ALIAS_ID, originalSender: 'sender@external.com',
      createdAt: new Date('2025-12-01T00:00:00Z'),
      expiresAt: new Date('2025-12-31T00:00:00Z'), // already expired at `now`
    });
    expect(await resolveReverseReplyToken(RAW_TOKEN, now)).toBeNull();
  });

  it('resolves a live binding to {aliasId, originalSender}', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    mockFindFirst.mockResolvedValue({
      id: 't1', aliasId: ALIAS_ID, originalSender: 'sender@external.com',
      createdAt: new Date('2025-12-31T00:00:00Z'),
      expiresAt: new Date('2026-01-02T00:00:00Z'),
    });
    const binding = await resolveReverseReplyToken(RAW_TOKEN, now);
    expect(binding).not.toBeNull();
    expect(binding!.aliasId).toBe(ALIAS_ID);
    expect(binding!.originalSender).toBe('sender@external.com');
  });
});

describe('purgeExpiredReverseReplyTokens', () => {
  it('returns the number of deleted rows', async () => {
    mockDeleteWhere.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    expect(await purgeExpiredReverseReplyTokens()).toBe(2);
  });

  it('swallows DB errors and returns 0 (never blocks mail handling)', async () => {
    mockDeleteWhere.mockRejectedValue(new Error('db down'));
    expect(await purgeExpiredReverseReplyTokens()).toBe(0);
  });
});
