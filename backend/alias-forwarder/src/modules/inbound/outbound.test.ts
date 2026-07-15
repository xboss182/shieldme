import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// hoisted mocks — must be first
const { mockSendViaResend, mockIsResendConfigured, mockSendViaSes, mockIsSesConfigured } =
  vi.hoisted(() => ({
    mockSendViaResend: vi.fn(),
    mockIsResendConfigured: vi.fn(),
    mockSendViaSes: vi.fn(),
    mockIsSesConfigured: vi.fn(),
  }));

// mock logger BEFORE any module that imports it
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./resend.service.js', () => ({
  sendViaResend: mockSendViaResend,
  isResendConfigured: mockIsResendConfigured,
}));

vi.mock('./ses.service.js', () => ({
  sendViaSes: mockSendViaSes,
  isSesConfigured: mockIsSesConfigured,
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

  it('defaults to resend when unset', () => {
    delete process.env['OUTBOUND_PROVIDER'];
    expect(getOutboundProvider()).toBe('resend');
  });

  it('returns ses when OUTBOUND_PROVIDER=ses', () => {
    process.env['OUTBOUND_PROVIDER'] = 'ses';
    expect(getOutboundProvider()).toBe('ses');
  });

  it('returns resend when OUTBOUND_PROVIDER=resend', () => {
    process.env['OUTBOUND_PROVIDER'] = 'resend';
    expect(getOutboundProvider()).toBe('resend');
  });
});

describe('isOutboundConfigured', () => {
  afterEach(() => { delete process.env['OUTBOUND_PROVIDER']; });

  it('delegates to isResendConfigured when provider=resend', () => {
    delete process.env['OUTBOUND_PROVIDER'];
    mockIsResendConfigured.mockReturnValue(true);
    expect(isOutboundConfigured()).toBe(true);
    expect(mockIsResendConfigured).toHaveBeenCalled();
  });

  it('delegates to isSesConfigured when provider=ses', () => {
    process.env['OUTBOUND_PROVIDER'] = 'ses';
    mockIsSesConfigured.mockReturnValue(false);
    expect(isOutboundConfigured()).toBe(false);
    expect(mockIsSesConfigured).toHaveBeenCalled();
  });
});

describe('sendOutbound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['OUTBOUND_PROVIDER'];
  });
  afterEach(() => { delete process.env['OUTBOUND_PROVIDER']; });

  it('routes to sendViaResend when provider=resend and configured', async () => {
    mockIsResendConfigured.mockReturnValue(true);
    mockSendViaResend.mockResolvedValue('resend-id-123');
    const id = await sendOutbound(PAYLOAD);
    expect(id).toBe('resend-id-123');
    expect(mockSendViaResend).toHaveBeenCalledWith(PAYLOAD);
    expect(mockSendViaSes).not.toHaveBeenCalled();
  });

  it('throws when provider=resend but not configured', async () => {
    mockIsResendConfigured.mockReturnValue(false);
    await expect(sendOutbound(PAYLOAD)).rejects.toThrow('RESEND_API_KEY is not configured');
  });

  it('routes to sendViaSes when provider=ses and configured', async () => {
    process.env['OUTBOUND_PROVIDER'] = 'ses';
    mockIsSesConfigured.mockReturnValue(true);
    mockSendViaSes.mockResolvedValue('ses-msg-456');
    const id = await sendOutbound(PAYLOAD);
    expect(id).toBe('ses-msg-456');
    expect(mockSendViaSes).toHaveBeenCalledWith(PAYLOAD);
    expect(mockSendViaResend).not.toHaveBeenCalled();
  });

  it('throws when provider=ses but not configured', async () => {
    process.env['OUTBOUND_PROVIDER'] = 'ses';
    mockIsSesConfigured.mockReturnValue(false);
    await expect(sendOutbound(PAYLOAD)).rejects.toThrow('AWS credentials are not configured');
  });

  it('passes the full payload to the provider', async () => {
    mockIsResendConfigured.mockReturnValue(true);
    mockSendViaResend.mockResolvedValue('id');
    const rich: ForwardPayload = { ...PAYLOAD, replyTo: 'r@x.com', htmlBody: '<b>Hi</b>', headers: { 'X-Foo': 'bar' } };
    await sendOutbound(rich);
    expect(mockSendViaResend).toHaveBeenCalledWith(rich);
  });
});
