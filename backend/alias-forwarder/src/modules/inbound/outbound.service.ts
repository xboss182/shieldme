import { sendViaResend, isResendConfigured } from './resend.service.js';
import { sendViaMailBaby, isMailBabyConfigured, MailBabyError } from './mailbaby.service.js';
import { logger } from '../../lib/logger.js';
import type { ForwardPayload } from './resend.service.js';

/** Active selectable outbound providers. SES has been removed from all active paths. */
export type OutboundProvider = 'mailbaby' | 'resend';
export type { ForwardPayload };

export type OutboundPolicy = {
  /** Alias PGP mode requires encrypted forwarding; never fallback with plaintext. */
  pgpRequired?: boolean;
  /** Payload body has already been OpenPGP encrypted in-memory. */
  pgpEncrypted?: boolean;
  /** Pinned provider recorded on queue job at enqueue time. */
  pinnedProvider?: OutboundProvider;
};

export function getOutboundProvider(): OutboundProvider {
  const raw = process.env['OUTBOUND_PROVIDER']?.toLowerCase().trim();
  if (raw === 'resend') return raw;
  return 'mailbaby';
}

function isProviderConfigured(provider: OutboundProvider): boolean {
  if (provider === 'mailbaby') return isMailBabyConfigured();
  return isResendConfigured();
}

async function sendViaProvider(provider: OutboundProvider, payload: ForwardPayload): Promise<string> {
  if (provider === 'mailbaby') {
    if (!isMailBabyConfigured()) {
      throw new Error('MailBaby selected but MAILBABY_SMTP_USERNAME or MAILBABY_SMTP_PASSWORD is not configured');
    }
    return sendViaMailBaby(payload);
  }
  if (!isResendConfigured()) {
    throw new Error('Resend selected but RESEND_API_KEY is not configured');
  }
  return sendViaResend(payload);
}

export function isOutboundConfigured(explicitProvider?: OutboundProvider): boolean {
  const provider = explicitProvider ?? getOutboundProvider();
  return isProviderConfigured(provider);
}

export function isPermanentOutboundError(error: unknown): boolean {
  return error instanceof MailBabyError && error.failureType === 'permanent';
}

export async function sendOutbound(payload: ForwardPayload, policy: OutboundPolicy = {}): Promise<string> {
  const provider = policy.pinnedProvider ?? getOutboundProvider();
  logger.debug({ provider }, 'Outbound send initiated');
  return sendViaProvider(provider, payload);
}
