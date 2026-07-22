import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForwardPayload } from './resend.service.js';

const {
  mockSendMail,
  mockClose,
  mockRedisGet,
  mockRedisSet,
  mockRedisIncr,
  mockRedisExpire,
  mockRedisDel,
} = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockClose: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisIncr: vi.fn(),
  mockRedisExpire: vi.fn(),
  mockRedisDel: vi.fn(),
}));

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

vi.mock('../../lib/redis.js', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    del: mockRedisDel,
  },
}));

import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { isMailBabyConfigured, isMailBabyCircuitOpen, recordMailBabyFailure, recordMailBabySuccess, sendViaMailBaby, MailBabyError } from './mailbaby.service.js';
import { buildRawForwardedMessage } from '../../lib/forwarded-message.js';

const PAYLOAD: ForwardPayload = {
  from: 'Forwarded via ShieldMe <forwarded+alias@shieldme.cc>',
  to: 'recipient@domain.com',
  subject: 'Test subject',
  textBody: 'Hello world',
  envelopeFrom: 'b+0123456789abcdef@bounces.shieldme.cc',
  attachments: [{ filename: 'statement.pdf', content: 'cGRmLWJ5dGVz', encoding: 'base64', contentType: 'application/pdf' }],
};

function configureMailBaby() {
  process.env['MAILBABY_SMTP_USERNAME'] = 'mb_user';
  process.env['MAILBABY_SMTP_PASSWORD'] = 'mb_pass';
  process.env['MAILBABY_DKIM_DOMAIN'] = 'shieldme.cc';
  process.env['MAILBABY_DKIM_SELECTOR'] = 'mail';
  process.env['MAILBABY_DKIM_PRIVATE_KEY'] = 'test-private-key';
}

describe('MailBaby adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisIncr.mockResolvedValue(1);
    delete process.env['MAILBABY_SMTP_USERNAME'];
    delete process.env['MAILBABY_SMTP_PASSWORD'];
    delete process.env['MAILBABY_DKIM_DOMAIN'];
    delete process.env['MAILBABY_DKIM_SELECTOR'];
    delete process.env['MAILBABY_DKIM_PRIVATE_KEY'];
  });

  it('requires SMTP credentials and ShieldMe DKIM signing identity', () => {
    process.env['MAILBABY_SMTP_USERNAME'] = 'mb_user';
    process.env['MAILBABY_SMTP_PASSWORD'] = 'mb_pass';
    expect(isMailBabyConfigured()).toBe(false);
    configureMailBaby();
    expect(isMailBabyConfigured()).toBe(true);
  });

  it('preserves the explicit envelope, MIME attachments, and ShieldMe DKIM identity over strict STARTTLS', async () => {
    configureMailBaby();
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
        dkim: { domainName: 'shieldme.cc', keySelector: 'mail', privateKey: 'test-private-key' },
      }),
    );
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: PAYLOAD.from,
      envelope: { from: PAYLOAD.envelopeFrom, to: [PAYLOAD.to] },
      attachments: PAYLOAD.attachments,
    }));
  });

  it('opens the provider circuit for permanent infrastructure errors but not recipient bounces', async () => {
    await recordMailBabyFailure(new MailBabyError('mailbaby_auth_failed', 'permanent', 'provider'));
    expect(mockRedisSet).toHaveBeenCalledWith('outbound:mailbaby:circuit', 'open', 'EX', 900);

    vi.clearAllMocks();
    await recordMailBabyFailure(new MailBabyError('mailbaby_recipient_5xx', 'permanent', 'recipient'));
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockRedisIncr).not.toHaveBeenCalled();
  });

  it('opens after three transient failures and clears state after success', async () => {
    mockRedisIncr.mockResolvedValue(3);
    await recordMailBabyFailure(new MailBabyError('mailbaby_connection_failed', 'transient', 'transport'));
    expect(mockRedisSet).toHaveBeenCalledWith('outbound:mailbaby:circuit', 'open', 'EX', 900);

    mockRedisGet.mockResolvedValue('open');
    await expect(isMailBabyCircuitOpen()).resolves.toBe(true);
    await recordMailBabySuccess();
    expect(mockRedisDel).toHaveBeenCalledWith('outbound:mailbaby:failures', 'outbound:mailbaby:circuit');
  });

  it('sends the final rewritten RFC 822 bytes for MailBaby DKIM signing', async () => {
    configureMailBaby();
    mockSendMail.mockResolvedValue({ messageId: '<mb-raw@relay.mailbaby.net>' });
    const original = Buffer.from('Content-Type: multipart/mixed; boundary="part"\r\n\r\n--part\r\nContent-Type: text/plain\r\n\r\nHi\r\n--part--\r\n');
    const input = {
      rawMessage: original,
      from: PAYLOAD.from,
      to: PAYLOAD.to,
      subject: PAYLOAD.subject,
      messageDomain: 'shieldme.cc',
      date: new Date('2026-07-22T00:00:00Z'),
      bannerText: '[Forwarded from alias@shieldme.cc]\n---\n',
      bannerHtml: '<div>Forwarded from alias@shieldme.cc</div>',
    };
    const raw = buildRawForwardedMessage(input);

    await sendViaMailBaby({ ...PAYLOAD, raw });

    expect(raw.toString('utf8')).toContain('Date: Wed, 22 Jul 2026 00:00:00 GMT');
    expect(raw.toString('utf8')).toContain('Content-Type: message/rfc822');
    expect(raw.toString('utf8')).toContain('<div>Forwarded from alias@shieldme.cc</div>');
    const nestedAt = raw.indexOf(original);
    expect(nestedAt).toBeGreaterThanOrEqual(0);
    expect(raw.toString('latin1')).toContain(`Content-Disposition: attachment; filename="forwarded-message.eml"\r\n\r\n${original.toString('latin1')}`);
    expect(raw.subarray(nestedAt, nestedAt + original.length)).toEqual(original);
    const parsed = await simpleParser(raw);
    const nested = parsed.attachments.find(({ contentType, filename }) => contentType === 'message/rfc822' && filename === 'forwarded-message.eml');
    expect(nested?.content).toEqual(original);
    expect(buildRawForwardedMessage(input)).toEqual(raw);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      raw,
      envelope: { from: PAYLOAD.envelopeFrom, to: [PAYLOAD.to] },
    }));
  });

  it('classifies auth and 5xx failures as permanent and closes transport', async () => {
    configureMailBaby();
    mockSendMail.mockRejectedValue(Object.assign(new Error('Invalid login or password'), { code: 'EAUTH', responseCode: 535 }));

    await expect(sendViaMailBaby(PAYLOAD)).rejects.toMatchObject({
      code: 'mailbaby_auth_failed',
      failureType: 'permanent',
    });
    expect(mockClose).toHaveBeenCalled();
  });

  it('classifies 4xx and network timeouts as transient and closes transport', async () => {
    configureMailBaby();
    mockSendMail.mockRejectedValue(Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT' }));

    await expect(sendViaMailBaby(PAYLOAD)).rejects.toMatchObject({
      code: 'mailbaby_connection_failed',
      failureType: 'transient',
    });
    expect(mockClose).toHaveBeenCalled();
  });
});
