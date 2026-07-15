import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEmailsSend } = vi.hoisted(() => ({
  mockEmailsSend: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: mockEmailsSend };
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../config/runtime-config.js', () => {
  let _key: string | undefined;
  return {
    getResendApiKey: () => _key,
    setRuntimeConfig: (patch: { resendApiKey?: string }) => {
      if (patch.resendApiKey !== undefined) _key = patch.resendApiKey || undefined;
    },
    getPlatformDomain: () => undefined,
    getRuntimeConfig: () => ({}),
  };
});

import * as rc from '../../config/runtime-config.js';
import { isResendConfigured, sendViaResend } from './resend.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Clear key
  rc.setRuntimeConfig({ resendApiKey: '' });
});

describe('isResendConfigured', () => {
  it('returns false when no key set', () => {
    expect(isResendConfigured()).toBe(false);
  });

  it('returns true after key set via runtime config', () => {
    rc.setRuntimeConfig({ resendApiKey: 're_test_key' });
    expect(isResendConfigured()).toBe(true);
  });
});

describe('sendViaResend', () => {
  it('throws when Resend is not configured', async () => {
    await expect(sendViaResend({
      from: 'a@b.com', to: 'c@d.com', subject: 'test', textBody: 'hi',
    })).rejects.toThrow('Resend not configured');
  });

  it('sends when key is configured', async () => {
    rc.setRuntimeConfig({ resendApiKey: 're_test_key' });
    mockEmailsSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    const id = await sendViaResend({
      from: 'a@b.com', to: 'c@d.com', subject: 'test', textBody: 'hi',
    });
    expect(id).toBe('msg_123');
    expect(mockEmailsSend).toHaveBeenCalledOnce();
  });
});
