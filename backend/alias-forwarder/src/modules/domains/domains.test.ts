import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (safe to reference in vi.mock factories) ───────────────────
const { mockFindFirst, mockFindMany, mockInsert, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: { domains: { findFirst: mockFindFirst, findMany: mockFindMany } },
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
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


vi.mock('../plans/plans.js', () => ({
  assertCanCreateDomain: vi.fn().mockResolvedValue(undefined),
  PlanLimitError: class PlanLimitError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 402) { super(message); this.statusCode = statusCode; }
  },
}));

vi.mock('../../config/runtime-config.js', () => ({
  getPlatformDomain: () => 'shieldmail.example',
  getResendApiKey: () => undefined,
  setRuntimeConfig: vi.fn(),
  getRuntimeConfig: () => ({}),
}));

const { mockResolveMx, mockResolveTxt } = vi.hoisted(() => ({
  mockResolveMx: vi.fn(),
  mockResolveTxt: vi.fn(),
}));

vi.mock('dns/promises', () => ({
  default: { resolveMx: mockResolveMx, resolveTxt: mockResolveTxt },
}));

import {
  createDomain,
  listDomains,
  getDomain,
  deleteDomain,
  verifyDomain,
  buildDnsRecords,
  assertDomainVerified,
  DomainError,
} from './domains.service.js';

const OWNER_ID = 'owner-uuid-001';
const DOMAIN_ID = 'domain-uuid-001';

function makeDomainRow(overrides = {}) {
  return {
    id: DOMAIN_ID, ownerId: OWNER_ID, domain: 'example.com',
    verificationToken: 'tok123', status: 'pending', verifiedAt: null,
    dkimSelector: 'mail', dkimPublicKey: 'pubkey', isActive: true,
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

beforeEach(() => vi.clearAllMocks());

describe('buildDnsRecords', () => {
  it('returns all four record types', () => {
    const r = buildDnsRecords('example.com', 'tok123', 'mail', 'pubkey');
    expect(r.mx.type).toBe('MX');
    expect(r.mx.value).toBe('mx.shieldmail.example');
    expect(r.txt.value).toContain('alias-site-verification=tok123');
    expect(r.dkim.name).toBe('mail._domainkey.example.com');
    expect(r.spf.value).toContain('v=spf1');
  });
});

describe('createDomain', () => {
  it('creates domain and returns DNS records', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockInsertChain([makeDomainRow()]);
    const result = await createDomain(OWNER_ID, { domain: 'example.com' });
    expect(result.domain.domain).toBe('example.com');
    expect(result.dnsRecords.mx).toBeDefined();
  });

  it('throws 409 when domain already registered', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow());
    await expect(createDomain(OWNER_ID, { domain: 'example.com' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects invalid domain name', async () => {
    await expect(createDomain(OWNER_ID, { domain: 'not_a_domain' })).rejects.toThrow();
  });
});

describe('listDomains', () => {
  it('returns array', async () => {
    mockFindMany.mockResolvedValue([makeDomainRow()]);
    const result = await listDomains(OWNER_ID);
    expect(result).toHaveLength(1);
  });
});

describe('getDomain', () => {
  it('returns domain when found', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow());
    expect((await getDomain(OWNER_ID, DOMAIN_ID)).id).toBe(DOMAIN_ID);
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(getDomain(OWNER_ID, DOMAIN_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('deleteDomain', () => {
  it('deletes when found', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow());
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    await expect(deleteDomain(OWNER_ID, DOMAIN_ID)).resolves.toBeUndefined();
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(deleteDomain(OWNER_ID, DOMAIN_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('verifyDomain', () => {
  it('verified=true when MX and TXT match', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow());
    mockUpdateChain([makeDomainRow({ status: 'verified', verifiedAt: new Date() })]);
    mockResolveMx.mockResolvedValue([{ exchange: 'mx.shieldmail.example', priority: 10 }]);
    mockResolveTxt.mockResolvedValue([['alias-site-verification=tok123']]);
    const r = await verifyDomain(OWNER_ID, DOMAIN_ID);
    expect(r.verified).toBe(true);
    expect(r.checks.mx).toBe(true);
    expect(r.checks.txt).toBe(true);
  });

  it('verified=false when MX missing', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow());
    mockUpdateChain([makeDomainRow({ status: 'failed' })]);
    mockResolveMx.mockRejectedValue(new Error('NXDOMAIN'));
    mockResolveTxt.mockResolvedValue([['alias-site-verification=tok123']]);
    const r = await verifyDomain(OWNER_ID, DOMAIN_ID);
    expect(r.verified).toBe(false);
    expect(r.checks.mx).toBe(false);
  });

  it('verified=false when TXT wrong', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow());
    mockUpdateChain([makeDomainRow({ status: 'failed' })]);
    mockResolveMx.mockResolvedValue([{ exchange: 'mx.shieldmail.example', priority: 10 }]);
    mockResolveTxt.mockRejectedValue(new Error('NXDOMAIN'));
    const r = await verifyDomain(OWNER_ID, DOMAIN_ID);
    expect(r.verified).toBe(false);
    expect(r.checks.txt).toBe(false);
  });

  it('short-circuits if already verified', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow({ status: 'verified', verifiedAt: new Date() }));
    const r = await verifyDomain(OWNER_ID, DOMAIN_ID);
    expect(r.verified).toBe(true);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(verifyDomain(OWNER_ID, DOMAIN_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('assertDomainVerified', () => {
  it('returns domain when verified and active', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow({ status: 'verified' }));
    expect((await assertDomainVerified(OWNER_ID, DOMAIN_ID)).status).toBe('verified');
  });

  it('throws 422 when pending', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow({ status: 'pending' }));
    await expect(assertDomainVerified(OWNER_ID, DOMAIN_ID)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 422 when disabled', async () => {
    mockFindFirst.mockResolvedValue(makeDomainRow({ status: 'verified', isActive: false }));
    await expect(assertDomainVerified(OWNER_ID, DOMAIN_ID)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('throws 404 when not found', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(assertDomainVerified(OWNER_ID, DOMAIN_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
