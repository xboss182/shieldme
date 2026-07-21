import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// hoisted mocks — must be first
const { mockSendViaResend, mockIsResendConfigured, mockSendViaMailBaby, mockIsMailBabyConfigured } =
  vi.hoisted(() => ({
    mockSendViaResend: vi.fn(),
    mockIsResendConfigured: vi.fn(),
    mockSendViaMailBaby: vi.fn(),
    mockIsMailBabyConfigured: vi.fn(),
  }));

// mock logger BEFORE any module that imports it
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./resend.service.js', () => ({
  sendViaResend: mockSendViaResend,
  isResendConfigured: mockIsResendConfigured,
}));

vi.mock('./mailbaby.service.js', () => ({
  sendViaMailBaby: mockSendViaMailBaby,
  isMailBabyConfigured: mockIsMailBabyConfigured,
  MailBabyError: class MailBabyError extends Error {
    constructor(public code: string, public failureType: string) {
      super(code);
    }
  },
}));

import { getOutboundProvider, isOutboundConfigured, sendOutbound } from './outbound.service.js';
import type { ForwardPayload } from './resend.service.js';

const PAYLOAD: ForwardPayload = {
  from: 'alias@example.com',
  to: 'real@user.com',
  subject: 'Test subject',
  textBody: 'Hello',
};

describe('getOutboundProvider', () => {
  afterEach(() => { delete process.env['OUTBOUND_PROVIDER']; });

  it('defaults to mailbaby when unset', () => {
    delete process.env['OUTBOUND_PROVIDER'];
    expect(getOutboundProvider()).toBe('mailbaby');
  });

  it('returns resend when OUTBOUND_PROVIDER=resend', () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    expect(getOutboundProvider()).toBe('resend');
  });

  it('returns mailbaby (default) when OUTBOUND_PROVIDER=ses (SES no longer active)', () => {
    process.env['OUTBOUND_PROVIDER'] = 'ses';
    expect(getOutboundProvider()).toBe('mailbaby');
  });

  it('returns mailbaby (default) when OUTBOUND_PROVIDER is an unknown value', () => {
    process.env['OUTBOUND_PROVIDER'] = 'unknown_provider';
    expect(getOutboundProvider()).toBe('mailbaby');
  });
});

describe('isOutboundConfigured', () => {
  afterEach(() => { delete process.env['OUTBOUND_PROVIDER']; });

  it('delegates to isMailBabyConfigured when provider=mailbaby', () => {
    delete process.env['OUTBOUND_PROVIDER'];
    mockIsMailBabyConfigured.mockReturnValue(true);
    expect(isOutboundConfigured()).toBe(true);
    expect(mockIsMailBabyConfigured).toHaveBeenCalled();
  });

  it('delegates to isResendConfigured when provider=resend', () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    mockIsResendConfigured.mockReturnValue(true);
    expect(isOutboundConfigured()).toBe(true);
    expect(mockIsResendConfigured).toHaveBeenCalled();
  });
});

describe('sendOutbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['OUTBOUND_PROVIDER'];
  });
  afterEach(() => { delete process.env['OUTBOUND_PROVIDER']; });

  it('routes to sendViaMailBaby by default when configured', async () => {
    mockIsMailBabyConfigured.mockReturnValue(true);
    mockSendViaMailBaby.mockResolvedValue('mb-msg-123');
    const id = await sendOutbound(PAYLOAD);
    expect(id).toBe('mb-msg-123');
    expect(mockSendViaMailBaby).toHaveBeenCalledWith(PAYLOAD);
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });

  it('fails closed when mailbaby is default but unconfigured', async () => {
    mockIsMailBabyConfigured.mockReturnValue(false);
    await expect(sendOutbound(PAYLOAD)).rejects.toThrow('MailBaby selected');
  });

  it('routes to sendViaResend when provider=resend and configured', async () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    mockIsResendConfigured.mockReturnValue(true);
    mockSendViaResend.mockResolvedValue('resend-id-123');
    const id = await sendOutbound(PAYLOAD);
    expect(id).toBe('resend-id-123');
    expect(mockSendViaResend).toHaveBeenCalledWith(PAYLOAD);
    expect(mockSendViaMailBaby).not.toHaveBeenCalled();
  });

  it('routes to pinnedProvider regardless of environment variable changes', async () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    mockIsMailBabyConfigured.mockReturnValue(true);
    mockSendViaMailBaby.mockResolvedValue('mb-pinned-id');
    const id = await sendOutbound(PAYLOAD, { pinnedProvider: 'mailbaby' });
    expect(id).toBe('mb-pinned-id');
    expect(mockSendViaMailBaby).toHaveBeenCalledWith(PAYLOAD);
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });
});
