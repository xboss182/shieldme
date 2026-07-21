import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';
import { encryptQueuePayload, type QueuePayloadTtlMetadata } from './secure-email-jobs.js';
import type { OutboundProvider } from '../modules/inbound/outbound.service.js';

export const emailForwardingQueueName = 'email-forwarding';

export type EmailForwardingPayload = {
  aliasId: string;
  messageId: string;
  routeMode?: 'platform' | 'custom_smtp';
  outboundProvider?: OutboundProvider;
  relayId?: string;
  credentialVersion?: number;
  halfOpenProbe?: boolean;
  /** Original email subject */
  subject?: string;
  /** Original email plain-text body */
  textBody?: string;
  /** Original email HTML body */
  htmlBody?: string;
  /** Original sender address (envelope from) */
  originalFrom?: string;
  /** Spam scan metadata only; never includes message body. */
  spamScan?: Record<string, unknown>;
};

export type EmailForwardingJob = {
  encrypted: true;
  iv: string;
  tag: string;
  ciphertext: string;
  ttl: QueuePayloadTtlMetadata;
};

export function buildEncryptedEmailForwardingJob(payload: EmailForwardingPayload): EmailForwardingJob {
  return encryptQueuePayload(payload, env.EMAIL_QUEUE_PAYLOAD_TTL_SECONDS);
}

export const emailForwardingQueue = new Queue<EmailForwardingJob>(emailForwardingQueueName, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: env.EMAIL_QUEUE_PAYLOAD_TTL_SECONDS, count: 100 },
    removeOnFail: { age: env.EMAIL_QUEUE_PAYLOAD_TTL_SECONDS, count: 500 },
  },
});
