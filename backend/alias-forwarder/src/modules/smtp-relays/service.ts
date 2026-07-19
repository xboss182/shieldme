import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import dns from 'node:dns/promises';
import { and, count, desc, eq, exists, gt, gte, isNull, lte, min, ne, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { aliases, auditLogs, domainSigningKeys, domains, mailLogs, recipients, smtpRelayCredentials, smtpRelayProfiles, smtpRelayTests } from '../../db/schema.js';
import { getPlatformDomain, isApprovedRelayHost, isByoSmtpEnabledForOwner } from '../../config/runtime-config.js';
import { env } from '../../config/env.js';
import { generateToken, hashToken, verifyToken } from '../../lib/tokens.js';
import { writeAuditLog } from '../admin/admin.service.js';
import { assertByoSmtpAllowed } from '../plans/plans.js';
import { decryptRelaySecret, encryptRelaySecret } from './crypto.js';
import { resolvePublicRelayHost, RelayEndpointError } from './ssrf.js';
import { sendSmtpRelayMessage, verifySmtpRelay, type RelayTransportConfig } from './transport.js';
import { relayCircuitOpeningsTotal, relayFailuresTotal, relayTestsTotal } from './metrics.js';
import type { CreateSmtpRelayInput, RotateSmtpRelayCredentialsInput } from './schemas.js';

const TEST_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_TESTS_PER_RELAY_HOUR = 5;
const MAX_TESTS_PER_OWNER_DAY = 20;

export class SmtpRelayError extends Error {
  constructor(message: string, public statusCode = 400, public code = 'smtp_relay_error') {
    super(message);
  }
}

type RelayCredentials = { username: string; password: string };
type RelayRow = typeof smtpRelayProfiles.$inferSelect;
type RelayTestRow = typeof smtpRelayTests.$inferSelect;

function requireByoSmtp(ownerId: string) {
  if (!isByoSmtpEnabledForOwner(ownerId) || !(process.env['BYO_SMTP_APPROVED_HOSTS'] ?? '').trim()) throw new SmtpRelayError('BYO SMTP is unavailable', 403, 'byo_smtp_disabled');
}

function requireApprovedRelayHost(host: string) {
  if (!isApprovedRelayHost(host)) throw new SmtpRelayError('SMTP relay host is not approved for the pilot', 422, 'relay_host_not_approved');
}

export async function assertByoSmtpPilotQuota(ownerId: string) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({ value: count() }).from(mailLogs).innerJoin(aliases, eq(mailLogs.aliasId, aliases.id)).where(and(eq(aliases.ownerId, ownerId), eq(mailLogs.outboundRouteMode, 'custom_smtp'), eq(mailLogs.status, 'delivered'), gte(mailLogs.createdAt, monthStart)));
  if (Number(row?.value ?? 0) >= env.BYO_SMTP_PILOT_MAX_MONTHLY_FORWARDS) throw new SmtpRelayError('BYO SMTP pilot quota reached', 429, 'byo_smtp_pilot_quota_reached');
}

async function redactedRelay(row: RelayRow) {
  const [queue] = await db
    .select({ queued: count(), retryDeadline: min(mailLogs.nextAttemptAt) })
    .from(mailLogs)
    .where(and(eq(mailLogs.smtpRelayId, row.id), eq(mailLogs.status, 'queued'), eq(mailLogs.outboundRouteMode, 'custom_smtp')));
  return {
    id: row.id,
    domainId: row.domainId,
    label: row.label,
    host: row.host,
    port: row.port,
    tlsMode: row.tlsMode,
    authMethod: row.authMethod,
    identityLocalPart: row.identityLocalPart,
    bounceSpfInclude: row.bounceSpfInclude,
    credentialConfigured: Boolean(row.activeCredentialVersion || row.pendingCredentialVersion),
    status: row.status,
    circuitStatus: row.circuitStatus,
    circuitUntil: row.circuitUntil,
    lastOutcomeCode: row.lastOutcomeCode,
    lastTestedAt: row.lastTestedAt,
    activeCredentialVersion: row.activeCredentialVersion,
    queue: { queued: Number(queue?.queued ?? 0), retryDeadline: queue?.retryDeadline ?? null },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getOwnedRelay(ownerId: string, relayId: string) {
  const relay = await db.query.smtpRelayProfiles.findFirst({ where: and(eq(smtpRelayProfiles.id, relayId), eq(smtpRelayProfiles.ownerId, ownerId)) });
  if (!relay) throw new SmtpRelayError('SMTP relay not found', 404, 'relay_not_found');
  return relay;
}

async function getOwnedVerifiedDomain(ownerId: string, domainId: string) {
  const domain = await db.query.domains.findFirst({ where: and(eq(domains.id, domainId), eq(domains.ownerId, ownerId), eq(domains.status, 'verified'), eq(domains.isActive, true)) });
  if (!domain) throw new SmtpRelayError('Verified owned custom domain required', 422, 'domain_not_verified');
  if (domain.domain === (getPlatformDomain() ?? 'shieldme.cc')) throw new SmtpRelayError('Platform domains cannot use BYO SMTP', 422, 'platform_domain_ineligible');
  return domain;
}

function pemPublicKey(value: string) {
  return value.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
}

async function createSigningKey(ownerId: string, domainId: string) {
  const existing = await db.query.domainSigningKeys.findFirst({ where: and(eq(domainSigningKeys.domainId, domainId), ne(domainSigningKeys.status, 'revoked')) });
  if (existing) return existing;
  const id = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const envelope = await encryptRelaySecret('domain_signing_key', ownerId, id, 1, { privateKey });
  const [key] = await db.insert(domainSigningKeys).values({
    id,
    domainId,
    selector: 'sm1',
    publicKey: pemPublicKey(publicKey),
    ...envelope,
  }).returning();
  return key;
}

function validTxt(records: string[][], value: string) {
  return records.map((record) => record.join('')).some((record) => record === value);
}

async function verifyDomainReadiness(ownerId: string, domain: typeof domains.$inferSelect, relay: RelayRow) {
  const signingKey = await createSigningKey(ownerId, domain.id);
  const platformDomain = getPlatformDomain();
  if (!platformDomain) throw new SmtpRelayError('Platform domain is not configured', 503, 'platform_domain_unavailable');
  try {
    const [dkim, bounceMx, bounceSpf] = await Promise.all([
      dns.resolveTxt(`${signingKey.selector}._domainkey.${domain.domain}`),
      dns.resolveMx(`sm-bounces.${domain.domain}`),
      dns.resolveTxt(`sm-bounces.${domain.domain}`),
    ]);
    const dkimExpected = `v=DKIM1; k=rsa; p=${signingKey.publicKey}`;
    const spfExpected = `v=spf1 ${relay.bounceSpfInclude} -all`;
    const mxExpected = `mx.${platformDomain}`.toLowerCase();
    if (!validTxt(dkim, dkimExpected) || !validTxt(bounceSpf, spfExpected) || !bounceMx.some((record) => record.exchange.replace(/\.$/, '').toLowerCase() === mxExpected)) {
      throw new SmtpRelayError('Required DKIM or bounce DNS records are not verified', 422, 'relay_dns_not_ready');
    }
    await db.update(domainSigningKeys).set({ status: 'verified', verifiedAt: new Date() }).where(eq(domainSigningKeys.id, signingKey.id));
    return { ...signingKey, status: 'verified' as const };
  } catch (error) {
    if (error instanceof SmtpRelayError) throw error;
    throw new SmtpRelayError('Required DKIM or bounce DNS records are not verified', 422, 'relay_dns_not_ready');
  }
}

async function decryptCredentials(ownerId: string, relayId: string, version: number) {
  const credential = await db.query.smtpRelayCredentials.findFirst({ where: and(eq(smtpRelayCredentials.relayId, relayId), eq(smtpRelayCredentials.version, version)) });
  if (!credential || (credential.revokedAt && credential.revokedAt <= new Date())) throw new SmtpRelayError('Relay credentials are unavailable', 422, 'credential_unavailable');
  return decryptRelaySecret<RelayCredentials>('smtp_credentials', ownerId, relayId, version, credential);
}

async function getSigningPrivateKey(ownerId: string, domainId: string) {
  const key = await db.query.domainSigningKeys.findFirst({ where: and(eq(domainSigningKeys.domainId, domainId), eq(domainSigningKeys.status, 'verified')) });
  if (!key) throw new SmtpRelayError('DKIM key is not verified', 422, 'dkim_not_verified');
  try {
    const result = await decryptRelaySecret<{ privateKey: string }>('domain_signing_key', ownerId, key.id, 1, key);
    return { selector: key.selector, privateKey: result.privateKey };
  } catch (error) {
    relayFailuresTotal.inc({ phase: 'signing' });
    throw error;
  }
}

async function transportConfig(ownerId: string, relay: RelayRow, version: number) {
  const domain = await getOwnedVerifiedDomain(ownerId, relay.domainId);
  const [credentials, signing] = await Promise.all([
    decryptCredentials(ownerId, relay.id, version),
    getSigningPrivateKey(ownerId, domain.id),
  ]);
  return {
    host: relay.host,
    port: relay.port as 465 | 587,
    tlsMode: relay.tlsMode as 'implicit_tls' | 'starttls',
    authMethod: relay.authMethod as 'plain' | 'login',
    username: credentials.username,
    password: credentials.password,
    dkim: { domainName: domain.domain, keySelector: signing.selector, privateKey: signing.privateKey },
  } satisfies RelayTransportConfig;
}

async function recordRelayOutcome(relayId: string, status: RelayRow['status'], code: string, credentialVersion?: number) {
  const conditions = [
    eq(smtpRelayProfiles.id, relayId),
    eq(smtpRelayProfiles.isSuspended, false),
    notInArray(smtpRelayProfiles.status, ['disabled', 'revoked']),
  ];
  if (credentialVersion !== undefined) conditions.push(eq(smtpRelayProfiles.pendingCredentialVersion, credentialVersion));
  const [relay] = await db.update(smtpRelayProfiles)
    .set({ status, lastOutcomeCode: code, lastTestedAt: new Date(), updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: smtpRelayProfiles.id });
  return Boolean(relay);
}

export function isRelayTestConfirmable(relay: Pick<RelayRow, 'status' | 'isSuspended' | 'pendingCredentialVersion'> | undefined, test: Pick<RelayTestRow, 'credentialVersion' | 'phase'>, credential: Pick<typeof smtpRelayCredentials.$inferSelect, 'revokedAt'> | undefined, now = new Date()) {
  return relay !== undefined
    && test.phase === 'submitted'
    && relay.status === 'awaiting_recipient_confirmation'
    && !relay.isSuspended
    && relay.pendingCredentialVersion === test.credentialVersion
    && Boolean(credential && (!credential.revokedAt || credential.revokedAt > now));
}

async function invalidatePendingRelayTests(relayId: string, code: string) {
  await db.update(smtpRelayTests)
    .set({ phase: 'failed', outcomeCode: code })
    .where(and(eq(smtpRelayTests.relayId, relayId), isNull(smtpRelayTests.confirmedAt), notInArray(smtpRelayTests.phase, ['confirmed', 'failed'])));
}

export async function createSmtpRelay(ownerId: string, input: CreateSmtpRelayInput) {
  requireByoSmtp(ownerId);
  await assertByoSmtpAllowed(ownerId);
  const domain = await getOwnedVerifiedDomain(ownerId, input.domainId);
  requireApprovedRelayHost(input.host);
  try {
    await resolvePublicRelayHost(input.host);
  } catch (error) {
    relayFailuresTotal.inc({ phase: 'ssrf' });
    throw error;
  }
  const id = randomUUID();
  const credentials = await encryptRelaySecret('smtp_credentials', ownerId, id, 1, { username: input.username, password: input.password });
  try {
    const [relay] = await db.insert(smtpRelayProfiles).values({
      id,
      ownerId,
      domainId: domain.id,
      label: input.label,
      host: input.host,
      port: input.port,
      tlsMode: input.tlsMode,
      authMethod: input.authMethod,
      identityLocalPart: input.identityLocalPart,
      bounceSpfInclude: input.bounceSpfInclude,
    }).returning();
    await db.insert(smtpRelayCredentials).values({ relayId: id, version: 1, ...credentials });
    await createSigningKey(ownerId, domain.id);
    await writeAuditLog('smtp_relay.created', 'smtp_relay', id, { domainId: domain.id, host: relay.host, port: relay.port }, { type: 'user', id: ownerId });
    return await redactedRelay(relay);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new SmtpRelayError('A relay already exists for this domain', 409, 'relay_exists');
    throw error;
  }
}

export async function listSmtpRelays(ownerId: string) {
  requireByoSmtp(ownerId);
  const relays = await db.query.smtpRelayProfiles.findMany({ where: eq(smtpRelayProfiles.ownerId, ownerId) });
  return Promise.all(relays.map(redactedRelay));
}

export async function getSmtpRelay(ownerId: string, relayId: string) {
  requireByoSmtp(ownerId);
  return redactedRelay(await getOwnedRelay(ownerId, relayId));
}

export async function listSmtpRelayAuditEvents(ownerId: string, relayId: string) {
  requireByoSmtp(ownerId);
  await getOwnedRelay(ownerId, relayId);
  return db
    .select({ id: auditLogs.id, timestamp: auditLogs.timestamp, action: auditLogs.action, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(and(eq(auditLogs.targetType, 'smtp_relay'), eq(auditLogs.targetId, relayId)))
    .orderBy(desc(auditLogs.timestamp))
    .limit(20);
}

export async function updateSmtpRelay(ownerId: string, relayId: string, label: string) {
  requireByoSmtp(ownerId);
  await getOwnedRelay(ownerId, relayId);
  const [relay] = await db.update(smtpRelayProfiles).set({ label, updatedAt: new Date() }).where(and(eq(smtpRelayProfiles.id, relayId), eq(smtpRelayProfiles.ownerId, ownerId))).returning();
  await writeAuditLog('smtp_relay.updated', 'smtp_relay', relayId, { field: 'label' }, { type: 'user', id: ownerId });
  return redactedRelay(relay);
}

async function assertTestLimit(ownerId: string, relayId: string) {
  const now = Date.now();
  const [relayTests, ownerTests] = await Promise.all([
    db.query.smtpRelayTests.findMany({ where: and(eq(smtpRelayTests.ownerId, ownerId), eq(smtpRelayTests.relayId, relayId), gte(smtpRelayTests.createdAt, new Date(now - 60 * 60 * 1000))), columns: { id: true } }),
    db.query.smtpRelayTests.findMany({ where: and(eq(smtpRelayTests.ownerId, ownerId), gte(smtpRelayTests.createdAt, new Date(now - 24 * 60 * 60 * 1000))), columns: { id: true } }),
  ]);
  if (relayTests.length >= MAX_TESTS_PER_RELAY_HOUR || ownerTests.length >= MAX_TESTS_PER_OWNER_DAY) throw new SmtpRelayError('Relay test limit reached', 429, 'relay_test_rate_limited');
}

export async function testSmtpRelay(ownerId: string, relayId: string, recipientId: string) {
  requireByoSmtp(ownerId);
  const relay = await getOwnedRelay(ownerId, relayId);
  requireApprovedRelayHost(relay.host);
  if (relay.isSuspended || ['revoked', 'disabled'].includes(relay.status)) throw new SmtpRelayError('Relay is disabled', 422, 'relay_disabled');
  await assertTestLimit(ownerId, relayId);
  const recipient = await db.query.recipients.findFirst({ where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, ownerId), eq(recipients.status, 'verified'), eq(recipients.isActive, true)) });
  if (!recipient) throw new SmtpRelayError('Verified owned recipient required', 422, 'recipient_not_verified');
  const domain = await getOwnedVerifiedDomain(ownerId, relay.domainId);
  const testId = randomUUID();
  const token = generateToken(32);
  const credentialVersion = relay.pendingCredentialVersion;
  const rotatingActiveRelay = relay.status === 'active' && relay.activeCredentialVersion !== null;
  const markTesting = async (status: RelayRow['status'], code: string) => {
    const [updated] = await db.update(smtpRelayProfiles)
      .set(rotatingActiveRelay ? { lastOutcomeCode: code, lastTestedAt: new Date(), updatedAt: new Date() } : { status, updatedAt: new Date() })
      .where(and(
        eq(smtpRelayProfiles.id, relay.id),
        eq(smtpRelayProfiles.pendingCredentialVersion, credentialVersion),
        eq(smtpRelayProfiles.isSuspended, false),
        notInArray(smtpRelayProfiles.status, ['disabled', 'revoked']),
      ))
      .returning({ id: smtpRelayProfiles.id });
    if (!updated) throw new SmtpRelayError('Relay state changed during testing', 409, 'relay_state_changed');
  };
  await markTesting('testing_dns', 'testing_dns');
  try {
    await verifyDomainReadiness(ownerId, domain, relay);
    relayTestsTotal.inc({ phase: 'dns', outcome: 'success' });
    await markTesting('testing_tls', 'testing_tls');
    const config = await transportConfig(ownerId, relay, credentialVersion);
    await resolvePublicRelayHost(relay.host);
    await verifySmtpRelay(config);
    relayTestsTotal.inc({ phase: 'tls_auth', outcome: 'success' });
    await markTesting('testing_auth', 'testing_auth');
    const sender = `${relay.identityLocalPart}@${domain.domain}`;
    await sendSmtpRelayMessage(config, {
      from: `ShieldMe relay test <${sender}>`,
      to: recipient.email,
      subject: 'Confirm your ShieldMe SMTP relay',
      textBody: `Confirm this relay while signed in: ${token}`,
      htmlBody: undefined,
      headers: { 'X-ShieldMe-Relay-Test': testId },
      envelopeFrom: `b+${testId}@sm-bounces.${domain.domain}`,
    });
    await db.insert(smtpRelayTests).values({
      id: testId,
      ownerId,
      relayId,
      recipientId,
      credentialVersion,
      tokenHash: await hashToken(token),
      tokenExpiresAt: new Date(Date.now() + TEST_TOKEN_TTL_MS),
      phase: 'submitted',
      outcomeCode: 'smtp_submitted',
      submittedAt: new Date(),
    });
    if (!(await recordRelayOutcome(relayId, 'awaiting_recipient_confirmation', 'smtp_submitted', credentialVersion))) {
      await invalidatePendingRelayTests(relayId, 'relay_state_changed');
      throw new SmtpRelayError('Relay state changed during testing', 409, 'relay_state_changed');
    }
    await writeAuditLog('smtp_relay.test_submitted', 'smtp_relay', relayId, { testId, recipientId }, { type: 'user', id: ownerId });
    return { id: testId, status: 'awaiting_recipient_confirmation', expiresAt: new Date(Date.now() + TEST_TOKEN_TTL_MS) };
  } catch (error) {
    relayTestsTotal.inc({ phase: 'relay', outcome: 'failure' });
    const code = error instanceof SmtpRelayError || error instanceof RelayEndpointError ? error.code : 'smtp_test_failed';
    if (rotatingActiveRelay) {
      await db.update(smtpRelayProfiles)
        .set({ status: 'active', lastOutcomeCode: code, lastTestedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(smtpRelayProfiles.id, relayId),
          eq(smtpRelayProfiles.pendingCredentialVersion, credentialVersion),
          eq(smtpRelayProfiles.isSuspended, false),
          notInArray(smtpRelayProfiles.status, ['disabled', 'revoked']),
        ));
    } else {
      await recordRelayOutcome(relayId, 'degraded', code, credentialVersion);
      await recordCustomSmtpFailure(relayId, code);
    }
    throw new SmtpRelayError('SMTP relay test failed', 422, code);
  }
}

export async function confirmSmtpRelayTest(ownerId: string, relayId: string, testId: string, token: string) {
  requireByoSmtp(ownerId);
  const test = await db.query.smtpRelayTests.findFirst({ where: and(eq(smtpRelayTests.id, testId), eq(smtpRelayTests.relayId, relayId), eq(smtpRelayTests.ownerId, ownerId)) });
  const now = new Date();
  if (!test || test.confirmedAt || test.tokenExpiresAt < now || !(await verifyToken(token, test.tokenHash))) throw new SmtpRelayError('Relay test confirmation is invalid or expired', 422, 'relay_test_invalid');
  const [currentRelay, credential] = await Promise.all([
    db.query.smtpRelayProfiles.findFirst({ where: and(eq(smtpRelayProfiles.id, relayId), eq(smtpRelayProfiles.ownerId, ownerId)) }),
    db.query.smtpRelayCredentials.findFirst({ where: and(eq(smtpRelayCredentials.relayId, relayId), eq(smtpRelayCredentials.version, test.credentialVersion)) }),
  ]);
  if (!currentRelay || !isRelayTestConfirmable(currentRelay, test, credential, now)) {
    await db.update(smtpRelayTests).set({ phase: 'failed', outcomeCode: 'relay_state_changed' }).where(and(eq(smtpRelayTests.id, test.id), isNull(smtpRelayTests.confirmedAt)));
    throw new SmtpRelayError('Relay state or credentials changed; submit a new test', 409, 'relay_state_changed');
  }
  const previousVersion = currentRelay.activeCredentialVersion;
  const [relay] = await db.update(smtpRelayProfiles)
    .set({
      status: sql`case when ${smtpRelayProfiles.activeCredentialVersion} is null then 'ready'::smtp_relay_status else 'active'::smtp_relay_status end`,
      activeCredentialVersion: test.credentialVersion,
      circuitStatus: 'closed',
      circuitFailureCount: 0,
      circuitUntil: null,
      lastOutcomeCode: 'recipient_confirmed',
      updatedAt: now,
    })
    .where(and(
      eq(smtpRelayProfiles.id, relayId),
      eq(smtpRelayProfiles.ownerId, ownerId),
      eq(smtpRelayProfiles.status, 'awaiting_recipient_confirmation'),
      eq(smtpRelayProfiles.isSuspended, false),
      eq(smtpRelayProfiles.pendingCredentialVersion, test.credentialVersion),
      exists(db.select({ id: smtpRelayTests.id }).from(smtpRelayTests).where(and(
        eq(smtpRelayTests.id, test.id),
        eq(smtpRelayTests.phase, 'submitted'),
        isNull(smtpRelayTests.confirmedAt),
      ))),
      exists(db.select({ version: smtpRelayCredentials.version }).from(smtpRelayCredentials).where(and(
        eq(smtpRelayCredentials.relayId, relayId),
        eq(smtpRelayCredentials.version, test.credentialVersion),
        or(isNull(smtpRelayCredentials.revokedAt), gt(smtpRelayCredentials.revokedAt, now)),
      ))),
    ))
    .returning({ id: smtpRelayProfiles.id });
  if (!relay) {
    await db.update(smtpRelayTests).set({ phase: 'failed', outcomeCode: 'relay_state_changed' }).where(and(eq(smtpRelayTests.id, test.id), isNull(smtpRelayTests.confirmedAt)));
    throw new SmtpRelayError('Relay state or credentials changed; submit a new test', 409, 'relay_state_changed');
  }
  relayTestsTotal.inc({ phase: 'recipient_confirmation', outcome: 'success' });
  await db.update(smtpRelayTests).set({ phase: 'confirmed', outcomeCode: 'recipient_confirmed', confirmedAt: now }).where(and(eq(smtpRelayTests.id, test.id), eq(smtpRelayTests.phase, 'submitted'), isNull(smtpRelayTests.confirmedAt)));
  if (previousVersion && previousVersion !== test.credentialVersion) {
    await db.update(smtpRelayCredentials).set({ revokedAt: new Date(now.getTime() + 30 * 60 * 1000) }).where(and(eq(smtpRelayCredentials.relayId, relayId), eq(smtpRelayCredentials.version, previousVersion)));
  }
  await writeAuditLog('smtp_relay.test_confirmed', 'smtp_relay', relayId, { testId }, { type: 'user', id: ownerId });
  return getSmtpRelay(ownerId, relayId);
}

export async function rotateSmtpRelayCredentials(ownerId: string, relayId: string, input: RotateSmtpRelayCredentialsInput) {
  requireByoSmtp(ownerId);
  const relay = await getOwnedRelay(ownerId, relayId);
  if (relay.isSuspended || ['revoked', 'disabled'].includes(relay.status)) throw new SmtpRelayError('Relay is disabled', 422, 'relay_disabled');
  const version = Math.max(relay.pendingCredentialVersion, relay.activeCredentialVersion ?? 0) + 1;
  const envelope = await encryptRelaySecret('smtp_credentials', ownerId, relayId, version, { username: input.username, password: input.password });
  await db.insert(smtpRelayCredentials).values({ relayId, version, ...envelope });
  await db.update(smtpRelayProfiles).set({ pendingCredentialVersion: version, status: relay.activeCredentialVersion ? 'active' : 'credentials_unverified', updatedAt: new Date() }).where(eq(smtpRelayProfiles.id, relayId));
  await invalidatePendingRelayTests(relayId, 'credentials_rotated');
  await writeAuditLog('smtp_relay.credentials_rotated_pending_test', 'smtp_relay', relayId, { version }, { type: 'user', id: ownerId });
  return testSmtpRelay(ownerId, relayId, input.recipientId);
}

export async function disableSmtpRelay(ownerId: string, relayId: string) {
  requireByoSmtp(ownerId);
  await getOwnedRelay(ownerId, relayId);
  await db.update(smtpRelayProfiles).set({ status: 'disabled', updatedAt: new Date() }).where(eq(smtpRelayProfiles.id, relayId));
  await invalidatePendingRelayTests(relayId, 'relay_disabled');
  await writeAuditLog('smtp_relay.disabled', 'smtp_relay', relayId, {}, { type: 'user', id: ownerId });
  return getSmtpRelay(ownerId, relayId);
}

export async function enableSmtpRelay(ownerId: string, relayId: string) {
  requireByoSmtp(ownerId);
  const relay = await getOwnedRelay(ownerId, relayId);
  if (!relay.activeCredentialVersion) throw new SmtpRelayError('Relay must be retested before enabling', 422, 'relay_not_ready');
  await db.update(smtpRelayProfiles).set({ status: 'active', updatedAt: new Date() }).where(eq(smtpRelayProfiles.id, relayId));
  await writeAuditLog('smtp_relay.enabled', 'smtp_relay', relayId, {}, { type: 'user', id: ownerId });
  return getSmtpRelay(ownerId, relayId);
}

export async function revokeSmtpRelay(ownerId: string, relayId: string) {
  requireByoSmtp(ownerId);
  await getOwnedRelay(ownerId, relayId);
  await db.update(smtpRelayCredentials).set({ revokedAt: new Date() }).where(eq(smtpRelayCredentials.relayId, relayId));
  await db.update(smtpRelayProfiles).set({ status: 'revoked', activeCredentialVersion: null, updatedAt: new Date() }).where(eq(smtpRelayProfiles.id, relayId));
  await invalidatePendingRelayTests(relayId, 'relay_revoked');
  await writeAuditLog('smtp_relay.revoked', 'smtp_relay', relayId, {}, { type: 'user', id: ownerId });
  return getSmtpRelay(ownerId, relayId);
}

export async function deleteSmtpRelay(ownerId: string, relayId: string) {
  requireByoSmtp(ownerId);
  await getOwnedRelay(ownerId, relayId);
  const mapped = await db.query.aliases.findFirst({ where: and(eq(aliases.ownerId, ownerId), eq(aliases.smtpRelayId, relayId), eq(aliases.outboundMode, 'custom_smtp')) });
  if (mapped) throw new SmtpRelayError('Unassign aliases before deleting this relay', 409, 'relay_assigned');
  await db.delete(smtpRelayProfiles).where(and(eq(smtpRelayProfiles.id, relayId), eq(smtpRelayProfiles.ownerId, ownerId)));
  await writeAuditLog('smtp_relay.deleted', 'smtp_relay', relayId, {}, { type: 'user', id: ownerId });
}

export async function suspendSmtpRelay(relayId: string) {
  await db.update(smtpRelayProfiles).set({ isSuspended: true, status: 'disabled', updatedAt: new Date() }).where(eq(smtpRelayProfiles.id, relayId));
  await invalidatePendingRelayTests(relayId, 'relay_suspended');
  await writeAuditLog('smtp_relay.suspended', 'smtp_relay', relayId, {});
}

export async function assertCustomRelayCanAccept(ownerId: string, relayId: string, allowDegraded = false) {
  requireByoSmtp(ownerId);
  const relay = await getOwnedRelay(ownerId, relayId);
  const allowedStates = allowDegraded ? ['ready', 'active', 'degraded'] : ['ready', 'active'];
  const circuitCanProbe = relay.circuitStatus === 'open' && Boolean(relay.circuitUntil && relay.circuitUntil <= new Date());
  if (relay.isSuspended || (!allowedStates.includes(relay.status) && !circuitCanProbe)) throw new SmtpRelayError('Custom SMTP relay is unavailable', 451, 'relay_unavailable');
  const now = new Date();
  const probeDeadline = new Date(now.getTime() + 15 * 60 * 1000);
  if (relay.circuitStatus === 'open') {
    if (!circuitCanProbe) throw new SmtpRelayError('Custom SMTP relay is unavailable', 451, 'relay_unavailable');
    const claimed = await db.update(smtpRelayProfiles).set({ circuitStatus: 'half_open', circuitUntil: probeDeadline, updatedAt: now }).where(and(eq(smtpRelayProfiles.id, relayId), eq(smtpRelayProfiles.circuitStatus, 'open'), lte(smtpRelayProfiles.circuitUntil, now))).returning({ id: smtpRelayProfiles.id });
    if (!claimed.length) throw new SmtpRelayError('Custom SMTP relay is unavailable', 451, 'relay_unavailable');
    return { ...relay, circuitStatus: 'half_open' as const, circuitUntil: probeDeadline };
  }
  if (relay.circuitStatus === 'half_open') {
    if (relay.circuitUntil && relay.circuitUntil > now) throw new SmtpRelayError('Custom SMTP relay is unavailable', 451, 'relay_unavailable');
    const claimed = await db.update(smtpRelayProfiles).set({ circuitUntil: probeDeadline, updatedAt: now }).where(and(eq(smtpRelayProfiles.id, relayId), eq(smtpRelayProfiles.circuitStatus, 'half_open'), lte(smtpRelayProfiles.circuitUntil, now))).returning({ id: smtpRelayProfiles.id });
    if (!claimed.length) throw new SmtpRelayError('Custom SMTP relay is unavailable', 451, 'relay_unavailable');
    return { ...relay, circuitUntil: probeDeadline };
  }
  if (relay.circuitUntil && relay.circuitUntil > now) throw new SmtpRelayError('Custom SMTP relay is unavailable', 451, 'relay_unavailable');
  return relay;
}

export async function resolveCustomSmtpDelivery(ownerId: string, relayId: string, credentialVersion: number, halfOpenProbe = false) {
  await db.delete(smtpRelayCredentials).where(lte(smtpRelayCredentials.revokedAt, new Date()));
  requireByoSmtp(ownerId);
  const relay = halfOpenProbe ? await getOwnedRelay(ownerId, relayId) : await assertCustomRelayCanAccept(ownerId, relayId, true);
  requireApprovedRelayHost(relay.host);
  if (halfOpenProbe && relay.circuitStatus !== 'half_open') throw new SmtpRelayError('Custom SMTP relay is unavailable', 451, 'relay_unavailable');
  if (relay.activeCredentialVersion !== credentialVersion) {
    const retained = await db.query.smtpRelayCredentials.findFirst({
      where: and(eq(smtpRelayCredentials.relayId, relayId), eq(smtpRelayCredentials.version, credentialVersion), gte(smtpRelayCredentials.revokedAt, new Date())),
      columns: { relayId: true },
    });
    if (!retained) throw new SmtpRelayError('Relay credential version is no longer permitted', 451, 'credential_version_unavailable');
  }
  return { relay, transport: await transportConfig(ownerId, relay, credentialVersion) };
}

export async function recordCustomSmtpFailure(relayId: string, code: string) {
  const relay = await db.query.smtpRelayProfiles.findFirst({ where: eq(smtpRelayProfiles.id, relayId) });
  if (!relay) return;
  const immediate = /auth|tls|certificate|unsafe|dns/.test(code);
  const failures = relay.circuitFailureCount + 1;
  const open = immediate || failures >= 3;
  if (open && relay.circuitStatus !== 'open') relayCircuitOpeningsTotal.inc();
  const cooldownMinutes = Math.min(360, 15 * 2 ** Math.max(0, failures - 3));
  await db.update(smtpRelayProfiles).set({
    status: open ? 'circuit_open' : 'degraded',
    circuitStatus: open ? 'open' : 'closed',
    circuitFailureCount: failures,
    circuitOpenedAt: open ? new Date() : relay.circuitOpenedAt,
    circuitUntil: open ? new Date(Date.now() + cooldownMinutes * 60 * 1000) : null,
    lastOutcomeCode: code.slice(0, 80),
    updatedAt: new Date(),
  }).where(and(
    eq(smtpRelayProfiles.id, relayId),
    eq(smtpRelayProfiles.isSuspended, false),
    notInArray(smtpRelayProfiles.status, ['disabled', 'revoked']),
  ));
}

export async function recordCustomSmtpSuccess(relayId: string) {
  await db.update(smtpRelayProfiles)
    .set({ status: 'active', circuitStatus: 'closed', circuitFailureCount: 0, circuitUntil: null, lastOutcomeCode: 'smtp_submitted', updatedAt: new Date() })
    .where(and(
      eq(smtpRelayProfiles.id, relayId),
      eq(smtpRelayProfiles.isSuspended, false),
      notInArray(smtpRelayProfiles.status, ['disabled', 'revoked']),
    ));
}

export async function revokeExpiredRelayCredentials() {
  const [result] = await db.update(smtpRelayCredentials).set({ revokedAt: new Date() }).where(lte(smtpRelayCredentials.revokedAt, new Date())).returning({ relayId: smtpRelayCredentials.relayId });
  return result?.relayId ?? null;
}

export function buildBounceToken() {
  return randomBytes(32).toString('hex');
}

export function hashBounceToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
