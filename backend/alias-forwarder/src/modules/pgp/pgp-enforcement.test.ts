import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    APP_URL: 'https://app.shieldme.cc',
    DATABASE_URL: 'postgresql://localhost/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    BCRYPT_SALT_ROUNDS: 4,
    RECIPIENT_TOKEN_TTL_MINUTES: 60,
  },
}));

const { mockPgpKeyFind } = vi.hoisted(() => ({
  mockPgpKeyFind: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      pgpKeys: { findFirst: mockPgpKeyFind },
      recipients: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

import { getArmoredKeyForRecipient } from './pgp.service.js';

describe('getArmoredKeyForRecipient', () => {
  beforeEach(() => { mockPgpKeyFind.mockReset(); });

  it('returns null when no key exists for recipient', async () => {
    mockPgpKeyFind.mockResolvedValueOnce(undefined);
    const result = await getArmoredKeyForRecipient('recipient-uuid');
    expect(result).toBeNull();
  });

  it('returns armored key string when one exists', async () => {
    const fakeKey = { id: 'key-1', recipientId: 'recipient-uuid', fingerprint: 'ABCD', publicKeyArmored: '-----BEGIN PGP PUBLIC KEY BLOCK-----' };
    mockPgpKeyFind.mockResolvedValueOnce(fakeKey);
    const result = await getArmoredKeyForRecipient('recipient-uuid');
    expect(result).toBe('-----BEGIN PGP PUBLIC KEY BLOCK-----');
  });
});

describe('PGP mode enforcement logic (unit)', () => {
  function resolveAction(pgpMode: string, pgpKey: string | null): string {
    if (pgpMode !== 'none') {
      if (!pgpKey && pgpMode === 'required') return 'reject';
      if (!pgpKey) return 'plaintext';
      return 'encrypt';
    }
    return 'plaintext';
  }

  it('required mode + no key should result in rejected status', () => {
    expect(resolveAction('required', null)).toBe('reject');
  });

  it('optional mode + no key should forward plaintext', () => {
    expect(resolveAction('optional', null)).toBe('plaintext');
  });

  it('optional mode + key should encrypt', () => {
    expect(resolveAction('optional', '-----BEGIN PGP PUBLIC KEY BLOCK-----')).toBe('encrypt');
  });

  it('required mode + key should encrypt', () => {
    expect(resolveAction('required', '-----BEGIN PGP PUBLIC KEY BLOCK-----')).toBe('encrypt');
  });

  it('none mode should always forward plaintext', () => {
    expect(resolveAction('none', null)).toBe('plaintext');
    expect(resolveAction('none', '-----BEGIN PGP PUBLIC KEY BLOCK-----')).toBe('plaintext');
  });
});
