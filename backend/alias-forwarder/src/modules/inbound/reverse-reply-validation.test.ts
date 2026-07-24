import { describe, it, expect } from 'vitest';
import {
  validateReverseReplyAuthenticity,
  extractSenderDomain,
} from './reverse-reply-validation.js';
import type { MailAuthResults } from './mail-auth-results.js';

function authHeader(spf: string, dkim: string, dmarc: string): MailAuthResults {
  return {
    source: 'authentication-results-header',
    spf: spf as MailAuthResults['spf'],
    dkim: dkim as MailAuthResults['dkim'],
    dmarc: dmarc as MailAuthResults['dmarc'],
  };
}

describe('extractSenderDomain', () => {
  it('pulls the domain from a bare address', () => {
    expect(extractSenderDomain('alice@example.com')).toBe('example.com');
  });
  it('pulls the domain from a Name <addr> form', () => {
    expect(extractSenderDomain('Alice <alice@Example.COM>')).toBe('example.com');
  });
  it('returns null for a domain without a dot or missing @', () => {
    expect(extractSenderDomain('not-an-email')).toBeNull();
    expect(extractSenderDomain('root@localhost')).toBeNull();
    expect(extractSenderDomain(undefined)).toBeNull();
  });
});

describe('validateReverseReplyAuthenticity', () => {
  const bound = 'verified@personal.com';

  it('passes on DMARC pass with aligned From domain', () => {
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: 'verified@personal.com',
      headerFrom: 'Verified User <verified@personal.com>',
      authResults: authHeader('pass', 'pass', 'pass'),
      boundOriginalSender: bound,
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.authenticatedDomain).toBe('personal.com');
  });

  it('passes on DKIM pass alone when domain aligns (DMARC none)', () => {
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: 'verified@personal.com',
      headerFrom: 'verified@personal.com',
      authResults: authHeader('none', 'pass', 'none'),
      boundOriginalSender: bound,
    });
    expect(decision.ok).toBe(true);
  });

  it('passes when the authenticated domain is a subdomain of the bound domain', () => {
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: 'verified@mail.personal.com',
      headerFrom: 'verified@mail.personal.com',
      authResults: authHeader('pass', 'pass', 'pass'),
      boundOriginalSender: bound,
    });
    expect(decision.ok).toBe(true);
  });

  it('fails closed when there is no real auth verdict (SMTP session unavailable)', () => {
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: 'verified@personal.com',
      headerFrom: 'verified@personal.com',
      authResults: { source: 'smtp-session-unavailable', spf: 'unknown', dkim: 'unknown', dmarc: 'unknown' },
      boundOriginalSender: bound,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('auth_unavailable');
  });

  it('fails when DMARC and DKIM both fail (SPF pass is insufficient)', () => {
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: 'verified@personal.com',
      headerFrom: 'verified@personal.com',
      authResults: authHeader('pass', 'fail', 'fail'),
      boundOriginalSender: bound,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('spf_dkim_dmarc_fail');
  });

  it('rejects a spoofed From: authenticated as a different domain than the bound recipient', () => {
    // Message passes DMARC but for attacker.com, not the token-bound personal.com.
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: 'attacker@attacker.com',
      headerFrom: 'Verified User <attacker@attacker.com>',
      authResults: authHeader('pass', 'pass', 'pass'),
      boundOriginalSender: bound,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('sender_domain_mismatch');
  });

  it('rejects when the bound original sender is malformed', () => {
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: 'verified@personal.com',
      headerFrom: 'verified@personal.com',
      authResults: authHeader('pass', 'pass', 'pass'),
      boundOriginalSender: 'garbage',
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('malformed_sender');
  });

  it('rejects when neither header nor envelope From has a usable domain', () => {
    const decision = validateReverseReplyAuthenticity({
      envelopeFrom: '',
      headerFrom: undefined,
      authResults: authHeader('pass', 'pass', 'pass'),
      boundOriginalSender: bound,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toBe('malformed_sender');
  });
});
