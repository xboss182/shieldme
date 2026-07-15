import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    QUEUE_ENCRYPTION_SECRET: 'c'.repeat(32),
    EMAIL_QUEUE_PAYLOAD_TTL_SECONDS: 900,
  },
}));

import { decryptQueuePayload, encryptQueuePayload } from './secure-email-jobs.js';

describe('secure queue payload encryption', () => {
  it('encrypts message bodies before BullMQ stores the job payload', () => {
    const sealed = encryptQueuePayload({ textBody: 'sensitive body', htmlBody: '<p>sensitive body</p>' }, 900);

    expect(sealed.encrypted).toBe(true);
    expect(sealed.ciphertext).not.toContain('sensitive body');
    expect(JSON.stringify(sealed)).not.toContain('<p>sensitive body</p>');
    expect(decryptQueuePayload<{ textBody: string; htmlBody: string }>(sealed)).toEqual({ textBody: 'sensitive body', htmlBody: '<p>sensitive body</p>' });
  });

  it('rejects expired queued payloads instead of forwarding stale bodies', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const sealed = encryptQueuePayload({ textBody: 'short lived' }, 60);
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));

    expect(() => decryptQueuePayload(sealed)).toThrow('email_queue_payload_expired');
    vi.useRealTimers();
  });
});

import { buildEncryptedEmailForwardingJob, emailForwardingQueueName } from './email-jobs.js';

describe('retry/dead-letter no-body guarantees', () => {
  it('buildEncryptedEmailForwardingJob stores only encrypted ciphertext and no plaintext bodies', () => {
    const job = buildEncryptedEmailForwardingJob({
      aliasId: 'alias-1',
      messageId: 'log-1',
      subject: 'Secret subject',
      textBody: 'super secret plaintext body',
      htmlBody: '<p>super secret plaintext body</p>',
      originalFrom: 'sender@example.com',
    });

    const serialized = JSON.stringify(job);
    expect(job.encrypted).toBe(true);
    expect(serialized).not.toContain('super secret plaintext body');
    expect(serialized).not.toContain('<p>super secret plaintext body</p>');
    expect(serialized).not.toContain('Secret subject');
    expect(serialized).toContain('ciphertext');
  });

  it('uses the documented email-forwarding queue name', () => {
    expect(emailForwardingQueueName).toBe('email-forwarding');
  });
});
