import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

export type QueuePayloadTtlMetadata = {
  queuedAt: number;
  expiresAt: number;
};

export const DEFAULT_EMAIL_PAYLOAD_TTL_SECONDS = 15 * 60;

function getQueueEncryptionKey(): Buffer {
  const secret = env.QUEUE_ENCRYPTION_SECRET ?? env.JWT_REFRESH_SECRET ?? env.JWT_ACCESS_SECRET;
  return createHash('sha256').update(secret).digest();
}

function resolvePayloadTtlSeconds(ttlSeconds?: number): number {
  return ttlSeconds ?? env.EMAIL_QUEUE_PAYLOAD_TTL_SECONDS;
}

export function encryptQueuePayload<T extends object>(payload: T, ttlSeconds?: number): { encrypted: true; iv: string; tag: string; ciphertext: string; ttl: QueuePayloadTtlMetadata } {
  const queuedAt = Date.now();
  const ttl = resolvePayloadTtlSeconds(ttlSeconds) * 1000;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getQueueEncryptionKey(), iv);
  const plaintext = JSON.stringify(payload);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: true,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    ttl: { queuedAt, expiresAt: queuedAt + ttl },
  };
}

export function decryptQueuePayload<T extends object>(sealed: { encrypted: true; iv: string; tag: string; ciphertext: string; ttl: QueuePayloadTtlMetadata }): T {
  if (Date.now() > sealed.ttl.expiresAt) {
    throw new Error('email_queue_payload_expired');
  }

  const decipher = createDecipheriv('aes-256-gcm', getQueueEncryptionKey(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return JSON.parse(plaintext) as T;
}
