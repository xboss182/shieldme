import { parseMailAuthResults, type MailAuthResults } from './mail-auth-results.js';

/**
 * Sender-authenticity validation for inbound reverse replies (MNC-708 Stage 2).
 *
 * A reverse reply lands on `forwarded+<token>@<platform>`. The token binds the
 * reply to the original sender (`originalSender`) that the forward went out to.
 * That original sender is the party we invited to reply, so it is the ONLY
 * party allowed to relay back through the alias.
 *
 * The `From` header is spoofable, so we do NOT trust it alone. We require BOTH:
 *   1. Our own inbound SMTP path produced a passing authentication result
 *      (DMARC pass, or DKIM pass with domain alignment) for this message, AND
 *   2. The authenticated sending domain matches the domain of the verified
 *      recipient bound to the token (`originalSender`).
 *
 * Fail-closed: anything short of a clear pass is rejected. Callers silently
 * drop rejected messages (no bounce, no enumeration).
 */

export interface ReverseReplyAuthInput {
  /** Envelope MAIL FROM (spoofable on its own; used only for alignment cross-check). */
  envelopeFrom: string;
  /** Parsed From: header address, if available. */
  headerFrom?: string;
  /** Raw inbound headers, used to derive Authentication-Results when not pre-parsed. */
  headers?: Record<string, string>;
  /** Pre-parsed auth results (e.g. from the SMTP session). Falls back to header parsing. */
  authResults?: MailAuthResults | null;
  /** The token-bound original sender the forward was delivered to. */
  boundOriginalSender: string;
}

export type ReverseReplyAuthDecision =
  | { ok: true; authenticatedDomain: string; authResults: MailAuthResults }
  | { ok: false; reason: ReverseReplyAuthFailure; authResults: MailAuthResults };

export type ReverseReplyAuthFailure =
  | 'auth_unavailable'
  | 'spf_dkim_dmarc_fail'
  | 'sender_domain_mismatch'
  | 'malformed_sender';

/** Extract the lowercased domain from an email address or `Name <addr>` form. */
export function extractSenderDomain(address: string | undefined | null): string | null {
  if (!address) return null;
  const match = address.match(/@([^\s<>@"]+?)>?\s*$/);
  if (!match) return null;
  const domain = match[1].toLowerCase().trim().replace(/\.$/, '');
  return domain.length > 0 && domain.includes('.') ? domain : null;
}

/** Registrable-domain-agnostic alignment: exact match or subdomain relationship. */
function domainsAligned(a: string, b: string): boolean {
  if (a === b) return true;
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Decide whether an inbound reverse reply is authentic enough to relay.
 *
 * Passing requires a genuine mail-auth signal from our own inbound path AND
 * that the authenticated domain aligns with the token-bound original sender.
 */
export function validateReverseReplyAuthenticity(input: ReverseReplyAuthInput): ReverseReplyAuthDecision {
  const authResults: MailAuthResults =
    input.authResults ?? parseMailAuthResults(input.headers).results ??
    ({ source: 'smtp-session-unavailable', spf: 'unknown', dkim: 'unknown', dmarc: 'unknown' } as MailAuthResults);

  const boundDomain = extractSenderDomain(input.boundOriginalSender);
  if (!boundDomain) {
    return { ok: false, reason: 'malformed_sender', authResults };
  }

  // We must have a real authentication verdict from our inbound handler. If the
  // SMTP session produced nothing, fail closed rather than trusting the header.
  if (authResults.source !== 'authentication-results-header') {
    return { ok: false, reason: 'auth_unavailable', authResults };
  }

  // The message must pass DMARC, or pass DKIM outright (DKIM pass implies a
  // valid signature from the signing domain; combined with the alignment check
  // below this defeats header spoofing). SPF alone is insufficient.
  const dmarcPass = authResults.dmarc === 'pass' || authResults.dmarc === 'bestguesspass';
  const dkimPass = authResults.dkim === 'pass';
  if (!dmarcPass && !dkimPass) {
    return { ok: false, reason: 'spf_dkim_dmarc_fail', authResults };
  }

  // The authenticated sender must be the party we invited to reply. Use the
  // From header domain (the identity DMARC/DKIM authenticate) and cross-check
  // the envelope; either must align with the bound original sender's domain.
  const headerDomain = extractSenderDomain(input.headerFrom);
  const envelopeDomain = extractSenderDomain(input.envelopeFrom);
  const candidateDomains = [headerDomain, envelopeDomain].filter((d): d is string => Boolean(d));
  if (candidateDomains.length === 0) {
    return { ok: false, reason: 'malformed_sender', authResults };
  }

  const authenticatedDomain = candidateDomains.find((d) => domainsAligned(d, boundDomain));
  if (!authenticatedDomain) {
    return { ok: false, reason: 'sender_domain_mismatch', authResults };
  }

  return { ok: true, authenticatedDomain, authResults };
}
