import { sendViaResend, isResendConfigured } from './resend.service.js';
import { sendViaSes, isSesConfigured } from './ses.service.js';
import { logger } from '../../lib/logger.js';
import type { ForwardPayload } from './resend.service.js';

export type OutboundProvider = 'resend' | 'ses';
export type { ForwardPayload };

export type OutboundFallbackProvider = OutboundProvider | 'none';

export type OutboundPolicy = {
  /** Alias PGP mode requires encrypted forwarding; never fallback with plaintext. */
  pgpRequired?: boolean;
  /** Payload body has already been OpenPGP encrypted in-memory. */
  pgpEncrypted?: boolean;
};

export function getOutboundProvider(): OutboundProvider {
  const raw = process.env['OUTBOUND_PROVIDER']?.toLowerCase().trim();
  if (raw === 'ses') return 'ses';
  return 'resend';
}

export function getOutboundFallbackProvider(): OutboundFallbackProvider {
  const raw = process.env['OUTBOUND_FALLBACK_PROVIDER']?.toLowerCase().trim();
  if (raw === 'resend' || raw === 'ses') return raw;
  return 'none';
}

function isProviderConfigured(provider: OutboundProvider): boolean {
  return provider === 'ses' ? isSesConfigured() : isResendConfigured();
}

async function sendViaProvider(provider: OutboundProvider, payload: ForwardPayload): Promise<string> {
  if (provider === 'ses') {
    if (!isSesConfigured()) {
      throw new Error('SES selected via OUTBOUND_PROVIDER=ses but AWS credentials are not configured');
    }
    return sendViaSes(payload);
  }
  if (!isResendConfigured()) {
    throw new Error('Resend selected but RESEND_API_KEY is not configured');
  }
  return sendViaResend(payload);
}

export function isOutboundConfigured(): boolean {
  const provider = getOutboundProvider();
  return isProviderConfigured(provider);
}

export async function sendOutbound(payload: ForwardPayload, policy: OutboundPolicy = {}): Promise<string> {
  const provider = getOutboundProvider();
  logger.debug({ provider, to: payload.to }, 'Outbound send initiated');
  try {
    return await sendViaProvider(provider, payload);
  } catch (err) {
    const fallback = getOutboundFallbackProvider();
    if (fallback === 'none' || fallback === provider) throw err;
    if (!isProviderConfigured(fallback)) throw err;

    if (policy.pgpRequired && !policy.pgpEncrypted) {
      logger.error({ provider, fallback, to: payload.to }, 'Outbound fallback blocked: PGP-required payload is not encrypted');
      throw err;
    }

    logger.warn({ provider, fallback, to: payload.to, err }, 'Primary outbound provider failed; trying configured fallback');
    return sendViaProvider(fallback, payload);
  }
}
