import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCredentialFindFirst,
  mockIsByoSmtpEnabled,
  mockRelayFindFirst,
  mockTestFindFirst,
  mockUpdate,
  mockVerifyToken,
} = vi.hoisted(() => ({
  mockCredentialFindFirst: vi.fn(),
  mockIsByoSmtpEnabled: vi.fn(),
  mockRelayFindFirst: vi.fn(),
  mockTestFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockVerifyToken: vi.fn(),
}));

vi.mock('../../db/client.js', () => ({
  db: {
    query: {
      smtpRelayCredentials: { findFirst: mockCredentialFindFirst },
      smtpRelayProfiles: { findFirst: mockRelayFindFirst },
      smtpRelayTests: { findFirst: mockTestFindFirst },
    },
    update: mockUpdate,
  },
}));
vi.mock('../../config/runtime-config.js', () => ({
  getPlatformDomain: vi.fn(),
  isApprovedRelayHost: vi.fn(),
  isByoSmtpEnabledForOwner: mockIsByoSmtpEnabled,
}));
vi.mock('../../config/env.js', () => ({ env: {} }));
vi.mock('../../lib/tokens.js', () => ({ generateToken: vi.fn(), hashToken: vi.fn(), verifyToken: mockVerifyToken }));
vi.mock('../admin/admin.service.js', () => ({ writeAuditLog: vi.fn() }));
vi.mock('../plans/plans.js', () => ({ assertByoSmtpAllowed: vi.fn() }));
vi.mock('./crypto.js', () => ({ decryptRelaySecret: vi.fn(), encryptRelaySecret: vi.fn() }));
vi.mock('./ssrf.js', () => ({ resolvePublicRelayHost: vi.fn(), RelayEndpointError: class RelayEndpointError extends Error {} }));
vi.mock('./transport.js', () => ({ sendSmtpRelayMessage: vi.fn(), verifySmtpRelay: vi.fn() }));
vi.mock('./metrics.js', () => ({
  relayCircuitOpeningsTotal: { inc: vi.fn() },
  relayFailuresTotal: { inc: vi.fn() },
  relayTestsTotal: { inc: vi.fn() },
}));

import { confirmSmtpRelayTest, isRelayTestConfirmable } from './service.js';

const test = {
  id: 'test-1',
  credentialVersion: 1,
  confirmedAt: null,
  phase: 'submitted' as const,
  tokenExpiresAt: new Date(Date.now() + 60_000),
  tokenHash: 'token-hash',
};
const usableCredential = { revokedAt: null };

function relay(overrides: Partial<{ status: 'awaiting_recipient_confirmation' | 'disabled' | 'revoked'; isSuspended: boolean; pendingCredentialVersion: number }> = {}) {
  return {
    status: 'awaiting_recipient_confirmation' as const,
    isSuspended: false,
    pendingCredentialVersion: 1,
    ...overrides,
  };
}

function mockUpdateChain() {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
}

describe('relay test confirmation state guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BYO_SMTP_APPROVED_HOSTS = 'smtp.example.test';
    mockIsByoSmtpEnabled.mockReturnValue(true);
    mockVerifyToken.mockResolvedValue(true);
    mockTestFindFirst.mockResolvedValue(test);
    mockRelayFindFirst.mockResolvedValue(relay());
    mockCredentialFindFirst.mockResolvedValue(usableCredential);
    mockUpdateChain();
  });

  it('permits only the still-current submitted test', () => {
    expect(isRelayTestConfirmable(relay(), test, usableCredential)).toBe(true);
  });

  it.each([
    ['disable', relay({ status: 'disabled' }), usableCredential],
    ['suspension', relay({ isSuspended: true }), usableCredential],
    ['revoke', relay({ status: 'revoked' }), usableCredential],
    ['delete', undefined, usableCredential],
    ['credential rotation', relay({ pendingCredentialVersion: 2 }), usableCredential],
    ['credential revocation', relay(), { revokedAt: new Date(0) }],
  ])('fails closed after %s', async (_change, currentRelay, credential) => {
    mockRelayFindFirst.mockResolvedValue(currentRelay);
    mockCredentialFindFirst.mockResolvedValue(credential);

    await expect(confirmSmtpRelayTest('owner-1', 'relay-1', test.id, 'token')).rejects.toMatchObject({ code: 'relay_state_changed' });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
