import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-ses', () => {
  class MockSESClient {
    send = mockSend;
  }
  class MockSendRawEmailCommand {
    constructor(public input: unknown) {}
  }
  return { SESClient: MockSESClient, SendRawEmailCommand: MockSendRawEmailCommand };
});

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isSesConfigured, sendViaSes } from './ses.service.js';

const BASE_ENV = {
  AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
  AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  AWS_REGION: 'us-east-1',
};

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnv(BASE_ENV);
});

afterEach(() => {
  setEnv({ AWS_ACCESS_KEY_ID: undefined, AWS_SECRET_ACCESS_KEY: undefined, AWS_REGION: undefined, AWS_PROFILE: undefined });
});

describe('isSesConfigured', () => {
  it('returns true when AWS_ACCESS_KEY_ID and AWS_REGION are set', () => {
    expect(isSesConfigured()).toBe(true);
  });

  it('returns true when AWS_PROFILE and AWS_REGION are set (no key id)', () => {
    setEnv({ AWS_ACCESS_KEY_ID: undefined, AWS_PROFILE: 'default' });
    expect(isSesConfigured()).toBe(true);
  });

  it('returns false when AWS_REGION is missing', () => {
    setEnv({ AWS_REGION: undefined });
    expect(isSesConfigured()).toBe(false);
  });

  it('returns false when both AWS_ACCESS_KEY_ID and AWS_PROFILE are missing', () => {
    setEnv({ AWS_ACCESS_KEY_ID: undefined, AWS_PROFILE: undefined });
    expect(isSesConfigured()).toBe(false);
  });
});

describe('sendViaSes', () => {
  const payload = {
    from: 'sender@example.com',
    to: 'recip@personal.com',
    subject: 'Test',
    textBody: 'Hello world',
  };

  it('throws when SES is not configured', async () => {
    setEnv({ AWS_REGION: undefined });
    await expect(sendViaSes(payload)).rejects.toThrow('SES not configured');
  });

  it('sends raw email and returns MessageId', async () => {
    mockSend.mockResolvedValue({ MessageId: 'ses-msg-123' });
    const id = await sendViaSes(payload);
    expect(id).toBe('ses-msg-123');
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('returns fallback id string when MessageId is absent', async () => {
    mockSend.mockResolvedValue({});
    const id = await sendViaSes(payload);
    expect(id).toBe('(no-message-id)');
  });

  it('includes custom headers in raw message', async () => {
    mockSend.mockResolvedValue({ MessageId: 'ses-hdr-1' });
    await sendViaSes({ ...payload, headers: { 'X-Custom': 'value' } });
    const cmd = mockSend.mock.calls[0][0];
    const raw = Buffer.from(cmd.input.RawMessage.Data).toString('utf8');
    expect(raw).toContain('X-Custom: value');
  });

  it('builds multipart body when htmlBody present', async () => {
    mockSend.mockResolvedValue({ MessageId: 'ses-mp-1' });
    await sendViaSes({ ...payload, htmlBody: '<p>Hello</p>' });
    const cmd = mockSend.mock.calls[0][0];
    const raw = Buffer.from(cmd.input.RawMessage.Data).toString('utf8');
    expect(raw).toContain('multipart/alternative');
    expect(raw).toContain('<p>Hello</p>');
    expect(raw).toContain('Hello world');
  });

  it('propagates SES SDK errors', async () => {
    mockSend.mockRejectedValue(new Error('SES throttle'));
    await expect(sendViaSes(payload)).rejects.toThrow('SES throttle');
  });
});
