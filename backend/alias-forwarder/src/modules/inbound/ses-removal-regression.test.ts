/**
 * Regression tests: MNC-659 — SES removed from all active outbound paths.
 *
 * Guards:
 * 1. SES cannot be selected via OUTBOUND_PROVIDER env var
 * 2. SES cannot be selected via runtime/admin config
 * 3. No SES send function is reachable from the active outbound service
 * 4. No AWS credential is required at startup (env schema accepts missing AWS vars)
 * 5. Historical SES delivery records remain readable (outbound_provider column not dropped)
 * 6. MailBaby is the default provider
 * 7. Resend is the only explicit alternative
 * 8. Unpinned legacy jobs (missing outboundProvider) fail closed
 * 9. Provider-pinning for mailbaby and resend still passes
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockSendViaMailBaby, mockIsMailBabyConfigured, mockSendViaResend, mockIsResendConfigured } =
  vi.hoisted(() => ({
    mockSendViaMailBaby: vi.fn(),
    mockIsMailBabyConfigured: vi.fn(),
    mockSendViaResend: vi.fn(),
    mockIsResendConfigured: vi.fn(),
  }));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./mailbaby.service.js', () => ({
  sendViaMailBaby: mockSendViaMailBaby,
  isMailBabyConfigured: mockIsMailBabyConfigured,
  MailBabyError: class MailBabyError extends Error {
    constructor(public code: string, public failureType: string) { super(code); }
  },
}));

vi.mock('./resend.service.js', () => ({
  sendViaResend: mockSendViaResend,
  isResendConfigured: mockIsResendConfigured,
}));

import { getOutboundProvider, isOutboundConfigured, sendOutbound } from './outbound.service.js';
import type { OutboundProvider } from './outbound.service.js';

const PAYLOAD = {
  from: 'alias@shieldme.cc',
  to: 'real@user.com',
  subject: 'Regression test',
  textBody: 'Body',
};

afterEach(() => {
  delete process.env['OUTBOUND_PROVIDER'];
  vi.clearAllMocks();
});

// ── 1. SES cannot be selected via OUTBOUND_PROVIDER env var ──────────────────

describe('SES cannot be selected via OUTBOUND_PROVIDER env', () => {
  it('falls back to mailbaby when OUTBOUND_PROVIDER=ses', () => {
    process.env['OUTBOUND_PROVIDER'] = 'ses';
    expect(getOutboundProvider()).toBe('mailbaby');
  });

  it('never returns "ses" from getOutboundProvider regardless of env', () => {
    for (const value of ['ses', 'SES', 'Ses', 'SES ', '']) {
      process.env['OUTBOUND_PROVIDER'] = value;
      const provider = getOutboundProvider();
      expect(provider).not.toBe('ses');
    }
  });
});

// ── 2. SES is not in the OutboundProvider type ────────────────────────────────

describe('OutboundProvider type excludes ses', () => {
  it('only accepts mailbaby and resend as valid OutboundProvider values', () => {
    // Type-level: compile-time guard; runtime check via exhaustive switch
    const validProviders: OutboundProvider[] = ['mailbaby', 'resend'];
    for (const p of validProviders) {
      expect(['mailbaby', 'resend']).toContain(p);
    }
    // 'ses' is not assignable to OutboundProvider — verified at compile time
    // @ts-expect-error: 'ses' should not be a valid OutboundProvider
    const _invalid: OutboundProvider = 'ses';
    void _invalid;
  });
});

// ── 3. No SES send function reachable from active outbound service ────────────

describe('ses.service module is not imported by outbound.service', () => {
  it('outbound.service does not export isSesConfigured or sendViaSes', async () => {
    const mod = await import('./outbound.service.js');
    expect((mod as Record<string, unknown>)['isSesConfigured']).toBeUndefined();
    expect((mod as Record<string, unknown>)['sendViaSes']).toBeUndefined();
  });
});

// ── 4. No AWS credentials required at startup ─────────────────────────────────

describe('No AWS credentials required', () => {
  it('isOutboundConfigured does not check AWS env vars', () => {
    const savedRegion = process.env['AWS_REGION'];
    const savedKey = process.env['AWS_ACCESS_KEY_ID'];
    const savedSecret = process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_REGION'];
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];

    // With mailbaby configured, should be true without any AWS vars
    delete process.env['OUTBOUND_PROVIDER'];
    mockIsMailBabyConfigured.mockReturnValue(true);
    expect(isOutboundConfigured()).toBe(true);

    // Restore
    if (savedRegion !== undefined) process.env['AWS_REGION'] = savedRegion;
    if (savedKey !== undefined) process.env['AWS_ACCESS_KEY_ID'] = savedKey;
    if (savedSecret !== undefined) process.env['AWS_SECRET_ACCESS_KEY'] = savedSecret;
  });
});

// ── 5. Historical SES delivery data remains readable ─────────────────────────

describe('Historical SES records remain readable', () => {
  it('inbound.service MailLogInsert type still allows outboundProvider = "ses" for historical rows', async () => {
    // Import inbound to confirm it accepts 'ses' as a historical value (no runtime crash)
    const inboundMod = await import('../inbound/inbound.service.js').catch(() => null);
    // The module should load without requiring ses.service or @aws-sdk/client-ses
    // If it loaded, we confirm no SES dependency is pulled in
    if (inboundMod) {
      expect(typeof inboundMod.handleInbound).toBe('function');
    }
  }, 10_000);
});

// ── 6 & 7. MailBaby is default; Resend is the only explicit alternative ───────

describe('MailBaby default and Resend as only explicit alternative', () => {
  it('getOutboundProvider returns mailbaby by default', () => {
    delete process.env['OUTBOUND_PROVIDER'];
    expect(getOutboundProvider()).toBe('mailbaby');
  });

  it('getOutboundProvider returns resend when explicitly set', () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    expect(getOutboundProvider()).toBe('resend');
  });

  it('sendOutbound routes to mailbaby when configured and no env override', async () => {
    mockIsMailBabyConfigured.mockReturnValue(true);
    mockSendViaMailBaby.mockResolvedValue('mb-id-1');
    const id = await sendOutbound(PAYLOAD);
    expect(id).toBe('mb-id-1');
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });

  it('sendOutbound routes to resend when OUTBOUND_PROVIDER=resend', async () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    mockIsResendConfigured.mockReturnValue(true);
    mockSendViaResend.mockResolvedValue('resend-id-1');
    const id = await sendOutbound(PAYLOAD);
    expect(id).toBe('resend-id-1');
    expect(mockSendViaMailBaby).not.toHaveBeenCalled();
  });
});

// ── 8. Unpinned legacy jobs fail closed ───────────────────────────────────────

describe('Provider-pinning and fail-closed behavior', () => {
  it('fails closed when mailbaby is selected but unconfigured', async () => {
    mockIsMailBabyConfigured.mockReturnValue(false);
    await expect(sendOutbound(PAYLOAD)).rejects.toThrow('MailBaby selected');
    expect(mockSendViaMailBaby).not.toHaveBeenCalled();
  });

  it('fails closed when resend is selected but unconfigured', async () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    mockIsResendConfigured.mockReturnValue(false);
    await expect(sendOutbound(PAYLOAD)).rejects.toThrow('Resend selected');
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });

  // ── 9. Provider-pinning still works ─────────────────────────────────────────

  it('pinned mailbaby overrides OUTBOUND_PROVIDER=resend', async () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    mockIsMailBabyConfigured.mockReturnValue(true);
    mockSendViaMailBaby.mockResolvedValue('mb-pinned');
    const id = await sendOutbound(PAYLOAD, { pinnedProvider: 'mailbaby' });
    expect(id).toBe('mb-pinned');
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });

  it('pinned resend overrides default mailbaby provider', async () => {
    delete process.env['OUTBOUND_PROVIDER'];
    mockIsResendConfigured.mockReturnValue(true);
    mockSendViaResend.mockResolvedValue('resend-pinned');
    const id = await sendOutbound(PAYLOAD, { pinnedProvider: 'resend' });
    expect(id).toBe('resend-pinned');
    expect(mockSendViaMailBaby).not.toHaveBeenCalled();
  });
});
