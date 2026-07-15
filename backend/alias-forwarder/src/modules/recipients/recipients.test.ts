import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockFindFirst, mockFindMany, mockInsert, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: { recipients: { findFirst: mockFindFirst, findMany: mockFindMany } },
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
}));


vi.mock('../plans/plans.js', () => ({
  assertCanCreateAlias: vi.fn().mockResolvedValue(undefined),
  assertCanCreateDomain: vi.fn().mockResolvedValue(undefined),
  assertCanCreateRecipient: vi.fn().mockResolvedValue(undefined),
  assertPgpAllowed: vi.fn().mockResolvedValue(undefined),
  assertOutboundProviderAllowed: vi.fn().mockResolvedValue(undefined),
  assertMonthlyForwardAllowed: vi.fn().mockResolvedValue(undefined),
  PlanLimitError: class PlanLimitError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 402) { super(message); this.statusCode = statusCode; }
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    BCRYPT_SALT_ROUNDS: 4,
    RECIPIENT_TOKEN_TTL_MINUTES: 60,
    PLATFORM_DOMAIN: 'shieldmail.example',
    DKIM_SELECTOR: 'mail',
  },
}));

import {
  createRecipient,
  listRecipients,
  getRecipient,
  deleteRecipient,
  verifyRecipientToken,
  resendVerification,
  assertRecipientVerified,
  RecipientError,
} from './recipients.service.js';

const OWNER_ID = 'owner-uuid-001';
const RECIPIENT_ID = 'recipient-uuid-001';

function makeRow(overrides = {}) {
  return {
    id: RECIPIENT_ID, ownerId: OWNER_ID, email: 'alice@personal.com',
    verificationTokenHash: null, verificationTokenExpiresAt: null,
    status: 'pending', verifiedAt: null, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function mockInsertChain(returning: unknown[]) {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }),
  });
}

function mockUpdateChain(returning: unknown[]) {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }),
    }),
  });
}

function mockUpdateNoReturn() {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
}

beforeEach(() => vi.clearAllMocks());

// ── createRecipient ───────────────────────────────────────────────────────────
describe('createRecipient', () => {
  it('creates recipient and returns a verification token', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockInsertChain([{ id: RECIPIENT_ID, email: 'alice@personal.com', status: 'pending', createdAt: new Date() }]);
    const result = await createRecipient(OWNER_ID, { email: 'alice@personal.com' });
    expect(result.recipient.email).toBe('alice@personal.com');
    expect(typeof result.verificationToken).toBe('string');
    expect(result.verificationToken.length).toBeGreaterThan(0);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('throws 409 when recipient already exists', async () => {
    mockFindFirst.mockResolvedValue(makeRow());
    await expect(createRecipient(OWNER_ID, { email: 'alice@personal.com' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects invalid email', async () => {
    await expect(createRecipient(OWNER_ID, { email: 'not-an-email' })).rejects.toThrow();
  });
});

// ── listRecipients ────────────────────────────────────────────────────────────
describe('listRecipients', () => {
  it('returns array', async () => {
    mockFindMany.mockResolvedValue([makeRow()]);
    expect(await listRecipients(OWNER_ID)).toHaveLength(1);
  });
});

// ── getRecipient ──────────────────────────────────────────────────────────────
describe('getRecipient', () => {
  it('returns row when found', async () => {
    mockFindFirst.mockResolvedValue(makeRow());
    expect((await getRecipient(OWNER_ID, RECIPIENT_ID)).id).toBe(RECIPIENT_ID);
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getRecipient(OWNER_ID, RECIPIENT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── deleteRecipient ───────────────────────────────────────────────────────────
describe('deleteRecipient', () => {
  it('deletes when found', async () => {
    mockFindFirst.mockResolvedValue(makeRow());
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    await expect(deleteRecipient(OWNER_ID, RECIPIENT_ID)).resolves.toBeUndefined();
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(deleteRecipient(OWNER_ID, RECIPIENT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── verifyRecipientToken ──────────────────────────────────────────────────────
describe('verifyRecipientToken', () => {
  it('verifies valid token and clears it (single-use)', async () => {
    const rawToken = 'good-token-abc';
    const hash = await bcrypt.hash(rawToken, 4);
    const expiresAt = new Date(Date.now() + 3_600_000);
    mockFindFirst.mockResolvedValue(makeRow({ verificationTokenHash: hash, verificationTokenExpiresAt: expiresAt }));
    const verifiedRow = makeRow({ status: 'verified', verifiedAt: new Date(), verificationTokenHash: null, verificationTokenExpiresAt: null });
    mockUpdateChain([verifiedRow]);

    const result = await verifyRecipientToken(OWNER_ID, RECIPIENT_ID, rawToken);
    expect(result.status).toBe('verified');
    expect(result.verificationTokenHash).toBeNull();
  });

  it('throws 410 when token is expired', async () => {
    const rawToken = 'expired-token';
    const hash = await bcrypt.hash(rawToken, 4);
    mockFindFirst.mockResolvedValue(makeRow({
      verificationTokenHash: hash,
      verificationTokenExpiresAt: new Date(Date.now() - 1000),
    }));
    await expect(verifyRecipientToken(OWNER_ID, RECIPIENT_ID, rawToken)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('throws 400 when token is wrong', async () => {
    const hash = await bcrypt.hash('correct-token', 4);
    mockFindFirst.mockResolvedValue(makeRow({
      verificationTokenHash: hash,
      verificationTokenExpiresAt: new Date(Date.now() + 3_600_000),
    }));
    await expect(verifyRecipientToken(OWNER_ID, RECIPIENT_ID, 'wrong-token')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 409 when already verified', async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: 'verified' }));
    await expect(verifyRecipientToken(OWNER_ID, RECIPIENT_ID, 'any')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(verifyRecipientToken(OWNER_ID, RECIPIENT_ID, 'tok')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when no pending token exists', async () => {
    mockFindFirst.mockResolvedValue(makeRow({ verificationTokenHash: null, verificationTokenExpiresAt: null }));
    await expect(verifyRecipientToken(OWNER_ID, RECIPIENT_ID, 'tok')).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── resendVerification ────────────────────────────────────────────────────────
describe('resendVerification', () => {
  it('returns a fresh token', async () => {
    mockFindFirst.mockResolvedValue(makeRow());
    mockUpdateNoReturn();
    const result = await resendVerification(OWNER_ID, RECIPIENT_ID);
    expect(typeof result.verificationToken).toBe('string');
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('throws 409 when already verified', async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: 'verified' }));
    await expect(resendVerification(OWNER_ID, RECIPIENT_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(resendVerification(OWNER_ID, RECIPIENT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── assertRecipientVerified ───────────────────────────────────────────────────
describe('assertRecipientVerified', () => {
  it('returns recipient when verified and active', async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: 'verified' }));
    expect((await assertRecipientVerified(OWNER_ID, RECIPIENT_ID)).status).toBe('verified');
  });

  it('throws 422 when pending', async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: 'pending' }));
    await expect(assertRecipientVerified(OWNER_ID, RECIPIENT_ID)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when disabled', async () => {
    mockFindFirst.mockResolvedValue(makeRow({ status: 'verified', isActive: false }));
    await expect(assertRecipientVerified(OWNER_ID, RECIPIENT_ID)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(assertRecipientVerified(OWNER_ID, RECIPIENT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
