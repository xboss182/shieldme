import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForwardPayload } from './resend.service.js';

const mockSendMail = vi.fn();
const mockClose = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      close: mockClose,
    })),
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import nodemailer from 'nodemailer';
import { isMailBabyConfigured, sendViaMailBaby, MailBabyError } from './mailbaby.service.js';

const PAYLOAD: ForwardPayload = {
  from: 'forwarded+alias@shieldme.cc',
  to: 'recipient@domain.com',
  subject: 'Test subject',
  textBody: 'Hello world',
};

describe('MailBaby adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['MAILBABY_SMTP_USERNAME'];
    delete process.env['MAILBABY_SMTP_PASSWORD'];
  });

  it('detects credentials when configured', () => {
    expect(isMailBabyConfigured()).toBe(false);
    process.env['MAILBABY_SMTP_USERNAME'] = 'mb_user';
    process.env['MAILBABY_SMTP_PASSWORD'] = 'mb_pass';
    expect(isMailBabyConfigured()).toBe(true);
  });

  it('configures strict STARTTLS on relay.mailbaby.net:2525 with bounded timeouts and auth', async () => {
    process.env['MAILBABY_SMTP_USERNAME'] = 'mb_user';
    process.env['MAILBABY_SMTP_PASSWORD'] = 'mb_pass';
    mockSendMail.mockResolvedValue({ messageId: '<mb-123@relay.mailbaby.net>' });

    const messageId = await sendViaMailBaby(PAYLOAD);

    expect(messageId).toBe('<mb-123@relay.mailbaby.net>');
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'relay.mailbaby.net',
        port: 2525,
        secure: false,
        requireTLS: true,
        connectionTimeout: 5000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        tls: expect.objectContaining({
          servername: 'relay.mailbaby.net',
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
        }),
        auth: { user: 'mb_user', pass: 'mb_pass' },
      }),
    );
  });

  it('classifies auth and 5xx failures as permanent and closes transport', async () => {
    process.env['MAILBABY_SMTP_USERNAME'] = 'mb_user';
    process.env['MAILBABY_SMTP_PASSWORD'] = 'mb_pass';
    mockSendMail.mockRejectedValue(Object.assign(new Error('Invalid login or password'), { code: 'EAUTH', responseCode: 535 }));

    await expect(sendViaMailBaby(PAYLOAD)).rejects.toMatchObject({
      code: 'mailbaby_auth_failed',
      failureType: 'permanent',
    });
    expect(mockClose).toHaveBeenCalled();
  });

  it('classifies 4xx and network timeouts as transient and closes transport', async () => {
    process.env['MAILBABY_SMTP_USERNAME'] = 'mb_user';
    process.env['MAILBABY_SMTP_PASSWORD'] = 'mb_pass';
    mockSendMail.mockRejectedValue(Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT' }));

    await expect(sendViaMailBaby(PAYLOAD)).rejects.toMatchObject({
      code: 'mailbaby_connection_failed',
      failureType: 'transient',
    });
    expect(mockClose).toHaveBeenCalled();
  });
});
