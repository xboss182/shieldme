import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';
import { encryptQueuePayload, type QueuePayloadTtlMetadata } from './secure-email-jobs.js';

export const reverseReplyQueueName = 'reverse-reply';

/**
 * ReverseReplyJob payload (MNC-708 Stage 2).
 *
 * Enqueued by the SMTP reverse-reply branch AFTER sender-authenticity and loop
 * checks pass. The relay itself (re-send to the original sender via MailBaby,
 * reusing the forwarding hardening) runs in the reverse-reply worker. Message
 * body/raw MIME is encrypted at rest in Redis with the shared payload cipher,
 * mirroring the forwarding queue.
 */
export type ReverseReplyPayload = {
  /** Token store binding id (diagnostics / dedup). */
  tokenId: string;
  /** Alias the reply routes back through (its localPart becomes From: alias@platform). */
  aliasId: string;
  /** Verified recipient we relay the reply to — the token-bound original sender. */
  originalSender: string;
  /** Envelope MAIL FROM of the inbound reply (the verified recipient replying). */
  replyFrom: string;
  /** Raw RFC822 of the inbound reply, base64. Rewritten before relay. */
  rawMessage?: string;
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  /** Threading headers preserved from the inbound reply. */
  inReplyTo?: string;
  references?: string;
  /** External message id of the inbound reply. */
  messageId?: string;
  /** Hop count to stamp on the outbound relay (loop marker). */
  hop: number;
  /** Serialized inbound mail-auth verdict, for observability. */
  authResults?: Record<string, unknown>;
};

export type ReverseReplyJob = {
  encrypted: true;
  iv: string;
  tag: string;
  ciphertext: string;
  ttl: QueuePayloadTtlMetadata;
};

export function buildEncryptedReverseReplyJob(payload: ReverseReplyPayload): ReverseReplyJob {
  return encryptQueuePayload(payload, env.EMAIL_QUEUE_PAYLOAD_TTL_SECONDS);
}

export const reverseReplyQueue = new Queue<ReverseReplyJob>(reverseReplyQueueName, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: env.EMAIL_QUEUE_PAYLOAD_TTL_SECONDS, count: 100 },
    removeOnFail: { age: env.EMAIL_QUEUE_PAYLOAD_TTL_SECONDS, count: 500 },
  },
});
