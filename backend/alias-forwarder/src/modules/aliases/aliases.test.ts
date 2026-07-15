import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockFindFirst, mockFindMany, mockReservedFindMany, mockInsert, mockUpdate, mockSelect } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
  mockReservedFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      aliases: { findFirst: mockFindFirst, findMany: mockFindMany },
      reservedLocalParts: { findMany: mockReservedFindMany },
    },
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    PLATFORM_DOMAIN: 'shieldmail.example',
    DKIM_SELECTOR: 'mail',
    BCRYPT_SALT_ROUNDS: 4,
    RECIPIENT_TOKEN_TTL_MINUTES: 60,
  },
}));

// Mock domain/recipient trust guards
const mockAssertDomainVerified = vi.fn();
const mockAssertRecipientVerified = vi.fn();

vi.mock('../domains/domains.service.js', () => ({
  assertDomainVerified: (...args: unknown[]) => mockAssertDomainVerified(...args),
  DomainError: class DomainError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
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

vi.mock('../recipients/recipients.service.js', () => ({
  assertRecipientVerified: (...args: unknown[]) => mockAssertRecipientVerified(...args),
  RecipientError: class RecipientError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import {
  createAlias,
  listAliases,
  getAlias,
  enableAlias,
  disableAlias,
  deleteAlias,
  AliasError,
  getAliasProtection,
  getAliasStats,
} from './aliases.service.js';

const OWNER_ID = 'owner-uuid-001';
const ALIAS_ID = 'c0000000-0000-0000-0000-000000000003';
const DOMAIN_ID = 'a0000000-0000-0000-0000-000000000001';
const RECIPIENT_ID = 'b0000000-0000-0000-0000-000000000002';

function makeAliasRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ALIAS_ID,
    ownerId: OWNER_ID,
    domainId: DOMAIN_ID,
    recipientId: RECIPIENT_ID,
    localPart: 'hello',
    status: 'active',
    pgpMode: 'none' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDomainRow(overrides = {}) {
  return { id: DOMAIN_ID, domain: 'example.com', status: 'verified', isActive: true, ...overrides };
}

function makeRecipientRow(overrides = {}) {
  return { id: RECIPIENT_ID, email: 'user@personal.com', status: 'verified', isActive: true, ...overrides };
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

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertDomainVerified.mockResolvedValue(makeDomainRow());
  mockAssertRecipientVerified.mockResolvedValue(makeRecipientRow());
  mockReservedFindMany.mockResolvedValue([]);
});


// ── getAliasProtection ────────────────────────────────────────────────────────
describe('getAliasProtection', () => {
  it('marks optional mode with a usable key as protected', () => {
    const result = getAliasProtection(makeAliasRow({
      pgpMode: 'optional',
      recipient: {
        pgpKey: {
          id: 'key-1',
          recipientId: RECIPIENT_ID,
          fingerprint: 'ABC123',
          algorithm: 'rsa_encrypt_sign',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    }));

    expect(result.status).toBe('protected');
    expect(result.encryptedForwarding).toBe(true);
    expect(result.plaintextForwardingPossible).toBe(false);
    expect(result.key.available).toBe(true);
    expect(result.key.expiresSoon).toBe(true);
    expect(result.key.rotationGuidance).toContain('expires within 30 days');
  });

  it('marks optional/none mode without a key as unprotected', () => {
    const optional = getAliasProtection(makeAliasRow({ pgpMode: 'optional', recipient: { pgpKey: null } }));
    const none = getAliasProtection(makeAliasRow({ pgpMode: 'none', recipient: { pgpKey: null } }));

    expect(optional.status).toBe('unprotected');
    expect(optional.plaintextForwardingPossible).toBe(true);
    expect(none.status).toBe('unprotected');
  });

  it('marks required mode without a key as required_missing_key', () => {
    const result = getAliasProtection(makeAliasRow({ pgpMode: 'required', recipient: { pgpKey: null } }));

    expect(result.status).toBe('required_missing_key');
    expect(result.encryptedForwarding).toBe(false);
    expect(result.plaintextForwardingPossible).toBe(false);
  });
});

// ── createAlias ───────────────────────────────────────────────────────────────
describe('createAlias', () => {
  it('creates an alias and returns address', async () => {
    mockFindFirst.mockResolvedValue(null); // no conflict
    mockInsertChain([makeAliasRow()]);

    const result = await createAlias(OWNER_ID, {
      localPart: 'hello',
      domainId: DOMAIN_ID,
      recipientId: RECIPIENT_ID,
    });
    expect(result.address).toBe('hello@example.com');
    expect(result.alias.localPart).toBe('hello');
    expect(result.recipientEmail).toBe('user@personal.com');
  });



  it('rejects reserved operational/security local-parts', async () => {
    await expect(
      createAlias(OWNER_ID, { localPart: 'admin', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID }),
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('reserved') });
    expect(mockInsert).not.toHaveBeenCalled();
  });



  it('allows a reserved static local-part when admin created a domain allow rule', async () => {
    mockReservedFindMany.mockResolvedValue([{ localPart: 'security', domainId: DOMAIN_ID, action: 'allow' }]);
    mockFindFirst.mockResolvedValue(null);
    mockInsertChain([makeAliasRow({ localPart: 'security' })]);
    const result = await createAlias(OWNER_ID, { localPart: 'security', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID });
    expect(result.address).toBe('security@example.com');
  });

  it('rejects custom reserved local-parts from admin rules', async () => {
    mockReservedFindMany.mockResolvedValue([{ localPart: 'founder', domainId: null, action: 'reserve' }]);
    await expect(createAlias(OWNER_ID, { localPart: 'founder', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects reserved local-parts after schema lowercases input', async () => {
    const { createAliasSchema } = await import('./aliases.schemas.js');
    const input = createAliasSchema.parse({ localPart: 'Security', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID });
    await expect(createAlias(OWNER_ID, input)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 409 when local-part already exists on domain', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow());
    await expect(
      createAlias(OWNER_ID, { localPart: 'hello', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('propagates 422 when domain is not verified', async () => {
    const { DomainError } = await import('../domains/domains.service.js');
    mockAssertDomainVerified.mockRejectedValue(new DomainError('Domain is not verified', 422));
    await expect(
      createAlias(OWNER_ID, { localPart: 'hello', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('propagates 422 when recipient is not verified', async () => {
    const { RecipientError } = await import('../recipients/recipients.service.js');
    mockAssertRecipientVerified.mockRejectedValue(new RecipientError('Recipient is not verified', 422));
    await expect(
      createAlias(OWNER_ID, { localPart: 'hello', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('rejects invalid local-part', async () => {
    const { createAliasSchema } = await import('./aliases.schemas.js');
    expect(() => createAliasSchema.parse({ localPart: 'has space', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID }))
      .toThrow();
  });

  it('accepts single-char local-part', async () => {
    const { createAliasSchema } = await import('./aliases.schemas.js');
    const result = createAliasSchema.parse({ localPart: 'a', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID });
    expect(result.localPart).toBe('a');
  });

  it('lowercases local-part', async () => {
    const { createAliasSchema } = await import('./aliases.schemas.js');
    const result = createAliasSchema.parse({ localPart: 'HELLO', domainId: DOMAIN_ID, recipientId: RECIPIENT_ID });
    expect(result.localPart).toBe('hello');
  });
});

// ── listAliases ───────────────────────────────────────────────────────────────
describe('listAliases', () => {
  it('returns array of non-deleted aliases', async () => {
    mockFindMany.mockResolvedValue([makeAliasRow({ recipient: { email: 'user@personal.com', pgpKey: null } })]);
    const result = await listAliases(OWNER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].protectionStatus).toBe('unprotected');
  });
});

// ── getAlias ──────────────────────────────────────────────────────────────────
describe('getAlias', () => {
  it('returns alias when found', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ pgpMode: 'required', recipient: { email: 'user@personal.com', pgpKey: null } }));
    const result = await getAlias(OWNER_ID, ALIAS_ID);
    expect(result.id).toBe(ALIAS_ID);
    expect(result.protectionStatus).toBe('required_missing_key');
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── enableAlias ───────────────────────────────────────────────────────────────
describe('enableAlias', () => {
  it('enables a disabled alias', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'disabled' }));
    mockUpdateChain([makeAliasRow({ status: 'active' })]);
    const result = await enableAlias(OWNER_ID, ALIAS_ID);
    expect(result.status).toBe('active');
  });

  it('throws 409 when alias already active', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'active' }));
    await expect(enableAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 410 when alias is deleted', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'deleted' }));
    await expect(enableAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(enableAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── disableAlias ──────────────────────────────────────────────────────────────
describe('disableAlias', () => {
  it('disables an active alias', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'active' }));
    mockUpdateChain([makeAliasRow({ status: 'disabled' })]);
    const result = await disableAlias(OWNER_ID, ALIAS_ID);
    expect(result.status).toBe('disabled');
  });

  it('throws 409 when alias already disabled', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'disabled' }));
    await expect(disableAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 410 when alias is deleted', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'deleted' }));
    await expect(disableAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(disableAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── deleteAlias ───────────────────────────────────────────────────────────────
describe('deleteAlias', () => {
  it('soft-deletes an active alias', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'active' }));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    await expect(deleteAlias(OWNER_ID, ALIAS_ID)).resolves.toBeUndefined();
  });

  it('soft-deletes a disabled alias', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'disabled' }));
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    await expect(deleteAlias(OWNER_ID, ALIAS_ID)).resolves.toBeUndefined();
  });

  it('throws 410 when already deleted', async () => {
    mockFindFirst.mockResolvedValue(makeAliasRow({ status: 'deleted' }));
    await expect(deleteAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 410 });
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(deleteAlias(OWNER_ID, ALIAS_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});


describe('getAliasStats', () => {
  it('counts delivered, rejected, and failed mail logs for user aliases', async () => {
    mockFindMany.mockResolvedValue([{ id: ALIAS_ID }, { id: 'c0000000-0000-0000-0000-000000000004' }]);
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([
            { aliasId: ALIAS_ID, status: 'delivered', spamAction: 'allow', cnt: 3 },
            { aliasId: ALIAS_ID, status: 'delivered', spamAction: 'tag', cnt: 2 },
            { aliasId: ALIAS_ID, status: 'rejected', spamAction: 'reject', cnt: 1 },
            { aliasId: 'c0000000-0000-0000-0000-000000000004', status: 'failed', spamAction: null, cnt: 2 },
          ]),
        }),
      }),
    });

    await expect(getAliasStats(OWNER_ID)).resolves.toEqual({
      totalForwarded: 5,
      totalBlocked: 1,
      totalFailed: 2,
      totalSpamTagged: 2,
      totalSpamRejected: 1,
      totalSpamQuarantined: 0,
      totalSpamDetected: 3,
      perAlias: {
        [ALIAS_ID]: { forwarded: 5, blocked: 1, failed: 0, spamTagged: 2, spamRejected: 1, spamQuarantined: 0 },
        'c0000000-0000-0000-0000-000000000004': { forwarded: 0, blocked: 0, failed: 2, spamTagged: 0, spamRejected: 0, spamQuarantined: 0 },
      },
    });
  });
});
