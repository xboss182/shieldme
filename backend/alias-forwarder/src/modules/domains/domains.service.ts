import { and, eq, or } from 'drizzle-orm';
import dns from 'dns/promises';
import { db } from '../../db/client.js';
import { domains } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { getPlatformDomain } from '../../config/runtime-config.js';
import { generateToken } from '../../lib/tokens.js';
import { logger } from '../../lib/logger.js';
import type { CreateDomainInput } from './domains.schemas.js';
import { assertCanCreateDomain } from '../plans/plans.js';

export class DomainError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

/** DNS records the owner must publish to verify their domain. */
export interface DnsRecords {
  mx: { type: 'MX'; name: string; value: string; priority: number };
  txt: { type: 'TXT'; name: string; value: string };
  dkim: { type: 'TXT'; name: string; value: string };
  spf: { type: 'TXT'; name: string; value: string };
  // TODO: populate with real DMARC policy once platform domain is configured
  dmarc?: { type: 'TXT'; name: string; value: string };
}

/**
 * Build the DNS records a user must publish to verify their domain.
 * Requires a configured platform domain — only call this when a domain
 * is actually being added by the user (not at startup).
 */
export function buildDnsRecords(
  domain: string,
  verificationToken: string,
  dkimSelector: string,
  dkimPublicKey: string,
  // TODO: replace with real RSA-2048 keypair generation per domain
  platformDomainOverride?: string,
): DnsRecords {
  const platformDomain = platformDomainOverride ?? getPlatformDomain();
  if (!platformDomain) {
    throw new DomainError(
      'Platform domain is not configured. Set PLATFORM_DOMAIN or configure it via POST /api/admin/config.',
      503,
    );
  }

  return {
    mx: {
      type: 'MX',
      name: domain,
      value: `mx.${platformDomain}`,
      priority: 10,
    },
    txt: {
      type: 'TXT',
      name: `_alias-verify.${domain}`,
      value: `alias-site-verification=${verificationToken}`,
    },
    dkim: {
      type: 'TXT',
      name: `${dkimSelector}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
    },
    spf: {
      type: 'TXT',
      name: domain,
      value: `v=spf1 include:${platformDomain} -all`,
    },
    // TODO: replace placeholder with real DMARC policy when platform domain is finalised
    // e.g. { type: 'TXT', name: `_dmarc.${domain}`, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${platformDomain}` }
    dmarc: undefined,
  };
}

export async function createDomain(ownerId: string, input: CreateDomainInput) {
  const normalised = input.domain.toLowerCase().trim();

  await assertCanCreateDomain(ownerId);

  const existing = await db.query.domains.findFirst({
    where: eq(domains.domain, normalised),
  });
  if (existing) {
    throw new DomainError('Domain already registered', 409);
  }

  const verificationToken = generateToken(24);
  const dkimSelector = env.DKIM_SELECTOR;
  // TODO: replace with real RSA-2048 keypair generation — this is a placeholder for the MVP.
  const dkimPublicKey = generateToken(64); // placeholder public key material

  const [domain] = await db
    .insert(domains)
    .values({
      ownerId,
      domain: normalised,
      verificationToken,
      dkimSelector,
      dkimPublicKey,
    })
    .returning();

  const dnsRecords = buildDnsRecords(normalised, verificationToken, dkimSelector, dkimPublicKey);

  return { domain, dnsRecords };
}

export async function listDomains(ownerId: string) {
  const platformDomain = getPlatformDomain() ?? 'shieldme.cc';
  const rows = await db.query.domains.findMany({
    where: or(eq(domains.ownerId, ownerId), eq(domains.domain, platformDomain)),
    columns: {
      id: true,
      ownerId: true,
      domain: true,
      status: true,
      verifiedAt: true,
      dkimSelector: true,
      isActive: true,
      createdAt: true,
    },
  });

  return rows.map(row => ({
    ...row,
    isShared: row.domain === platformDomain && row.ownerId !== ownerId,
  }));
}

export async function getDomain(ownerId: string, domainId: string) {
  const platformDomain = getPlatformDomain() ?? 'shieldme.cc';
  const row = await db.query.domains.findFirst({
    where: and(eq(domains.id, domainId), or(eq(domains.ownerId, ownerId), eq(domains.domain, platformDomain))),
  });
  if (!row) throw new DomainError('Domain not found', 404);
  return row;
}

export async function deleteDomain(ownerId: string, domainId: string) {
  const row = await db.query.domains.findFirst({
    where: and(eq(domains.id, domainId), eq(domains.ownerId, ownerId)),
  });
  if (!row) throw new DomainError('Domain not found', 404);

  await db.delete(domains).where(eq(domains.id, domainId));
}

/**
 * Attempt DNS verification for MX and TXT records.
 * Sets status to 'verified' on success, 'failed' on error.
 */
export async function verifyDomain(ownerId: string, domainId: string) {
  const row = await db.query.domains.findFirst({
    where: and(eq(domains.id, domainId), eq(domains.ownerId, ownerId)),
  });
  if (!row) throw new DomainError('Domain not found', 404);

  if (row.status === 'verified') {
    return { domain: row, verified: true, checks: { mx: true, txt: true } };
  }

  const platformDomain = getPlatformDomain();
  if (!platformDomain) {
    throw new DomainError(
      'Platform domain is not configured — cannot verify DNS records.',
      503,
    );
  }

  const expectedTxtValue = `alias-site-verification=${row.verificationToken}`;
  const expectedMxValue = `mx.${platformDomain}`;

  let mxOk = false;
  let txtOk = false;

  try {
    const mxRecords = await dns.resolveMx(row.domain);
    mxOk = mxRecords.some(r => r.exchange.toLowerCase().replace(/\.$/, '') === expectedMxValue.toLowerCase());
  } catch (err) {
    logger.debug({ err, domain: row.domain }, 'MX lookup failed');
  }

  try {
    const txtRecords = await dns.resolveTxt(`_alias-verify.${row.domain}`);
    txtOk = txtRecords.flat().some(v => v === expectedTxtValue);
  } catch (err) {
    logger.debug({ err, domain: row.domain }, 'TXT lookup failed');
  }

  const verified = mxOk && txtOk;
  const newStatus = verified ? 'verified' : 'failed';

  const [updated] = await db
    .update(domains)
    .set({
      status: newStatus,
      verifiedAt: verified ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(domains.id, row.id))
    .returning();

  return { domain: updated, verified, checks: { mx: mxOk, txt: txtOk } };
}

/** Utility used by alias module to enforce domain trust. */
export async function assertDomainVerified(ownerId: string, domainId: string) {
  const platformDomain = getPlatformDomain() ?? 'shieldme.cc';
  const row = await db.query.domains.findFirst({
    where: and(eq(domains.id, domainId), or(eq(domains.ownerId, ownerId), eq(domains.domain, platformDomain))),
  });
  if (!row) throw new DomainError('Domain not found', 404);
  if (row.status !== 'verified') throw new DomainError('Domain is not verified', 422);
  if (!row.isActive) throw new DomainError('Domain is disabled', 422);
  return row;
}
