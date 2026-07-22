import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  timingSafeEqual,
} from 'node:crypto';
import { and, asc, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import {
  aliases,
  domains,
  aliasVerifyCapabilities,
  transparencyEvents,
  transparencyHeads,
  transparencyMmrNodes,
  domainSigningKeys,
  providerTransparencyProfiles,
  transparencyEventLinks,
} from '../../db/schema.js';
import { env } from '../../config/env.js';
import {
  canonicalEventBytes,
  canonicalHeadBytes,
  leafHash as computeLeafHash,
  bagPeaks,
  peaks,
  buildInclusionProof,
  newNodesForLeaf,
  b64uEncode,
  b64uDecode,
  type CanonicalEventFields,
} from './mmr.js';

const TRANSPARENCY_LOCK_ID = 68520260722;
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

type TransparencyEventInput = {
  eventType: string;
  occurredAt: Date;
  publicPayload: unknown;
  idempotencyKey?: string;
  aliasId?: string;
  domainId?: string;
  utcDate?: string;
};

export type TransparencyTransaction = Pick<typeof db, 'execute' | 'insert' | 'select'>;

const aliasStatuses = new Set(['active', 'disabled', 'deleted']);
const base64url = /^[A-Za-z0-9_-]+$/;

function assertPublicPayload(eventType: string, payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Transparency payload must be an object');
  }
  const value = payload as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  const matches = (expected: string[]) => keys.length === expected.length && keys.every((key, index) => key === expected[index]);

  if (eventType.startsWith('alias.') && eventType !== 'alias.forward_count_daily') {
    if (matches(['status']) && typeof value.status === 'string' && aliasStatuses.has(value.status)) return;
  }
  if (eventType === 'alias.forward_count_daily') {
    if (matches(['forwardedCount', 'utcDate']) && Number.isSafeInteger(value.forwardedCount) && (value.forwardedCount as number) >= 0 && typeof value.utcDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.utcDate)) return;
  }
  if (eventType === 'migration.snapshot') {
    if (matches(['snapshot', 'status']) && value.snapshot === true && typeof value.status === 'string' && aliasStatuses.has(value.status)) return;
    if (matches(['aliasesProcessed', 'snapshot', 'version']) && Number.isSafeInteger(value.aliasesProcessed) && (value.aliasesProcessed as number) >= 0 && value.snapshot === true && value.version === 1) return;
  }
  if ((eventType === 'dkim.activated' || eventType === 'dkim.retired') && matches(['publicKeySha256', 'selector', 'state']) && typeof value.selector === 'string' && /^[a-z0-9._-]{1,63}$/i.test(value.selector) && typeof value.publicKeySha256 === 'string' && base64url.test(value.publicKeySha256) && value.state === (eventType === 'dkim.activated' ? 'activated' : 'retired')) return;
  if (eventType === 'provider.changed' && matches(['profileSha256', 'provider']) && typeof value.provider === 'string' && /^[a-z0-9_-]{1,63}$/i.test(value.provider) && typeof value.profileSha256 === 'string' && base64url.test(value.profileSha256)) return;

  throw new Error('Transparency payload is not permitted');
}

function getPepper(): Buffer {
  const pepper = env.TRANSPARENCY_VERIFY_CODE_PEPPER;
  if (!pepper) throw new Error('TRANSPARENCY_VERIFY_CODE_PEPPER not configured');
  const value = Buffer.from(pepper, 'hex');
  if (value.length !== 32) throw new Error('TRANSPARENCY_VERIFY_CODE_PEPPER must be 32 bytes');
  return value;
}

export function generateVerifyCode(aliasId: string): string {
  return createHmac('sha256', getPepper()).update(`shieldme-verify-code-v1:${aliasId}`).digest('base64url');
}

export function hashVerifyCode(rawCode: string): string {
  return createHmac('sha256', getPepper()).update(rawCode).digest('base64url');
}

export function getVerifyCodeForAlias(aliasId: string): string {
  return generateVerifyCode(aliasId);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function getSigningKey(): { privateKey: Buffer; keyId: string } {
  const raw = env.TRANSPARENCY_SIGNING_PRIVATE_KEY;
  const keyId = env.TRANSPARENCY_SIGNING_KEY_ID;
  if (!raw || !keyId) throw new Error('Transparency signing key not configured');
  const privateKey = b64uDecode(raw);
  if (privateKey.length !== 32) throw new Error('Transparency signing key must be a 32-byte Ed25519 seed');
  return { privateKey, keyId };
}

function privateKeyObject(privateKey: Buffer) {
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, privateKey]),
    format: 'der',
    type: 'pkcs8',
  });
}

export function signTransparencyHead(headBytes: Buffer): string {
  const { privateKey } = getSigningKey();
  return sign(null, headBytes, privateKeyObject(privateKey)).toString('base64url');
}

export function getSigningPublicKeyInfo(): { keyId: string; publicKey: string; publicKeySha256: string } | null {
  try {
    const { privateKey, keyId } = getSigningKey();
    const spkiDer = createPublicKey(privateKeyObject(privateKey)).export({ format: 'der', type: 'spki' }) as Buffer;
    const rawPublicKey = spkiDer.subarray(ED25519_SPKI_PREFIX.length);
    return {
      keyId,
      publicKey: b64uEncode(rawPublicKey),
      publicKeySha256: createHash('sha256').update(rawPublicKey).digest('base64url'),
    };
  } catch {
    return null;
  }
}

async function lockTransparencyLog(tx: TransparencyTransaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${TRANSPARENCY_LOCK_ID})`);
}

export async function createVerifyCapabilityInTransaction(
  tx: TransparencyTransaction,
  aliasId: string,
): Promise<string | null> {
  const [existing] = await tx
    .select({ aliasId: aliasVerifyCapabilities.aliasId })
    .from(aliasVerifyCapabilities)
    .where(eq(aliasVerifyCapabilities.aliasId, aliasId))
    .limit(1);
  if (existing) return null;

  const verificationCode = generateVerifyCode(aliasId);
  const [inserted] = await tx
    .insert(aliasVerifyCapabilities)
    .values({ aliasId, codeHash: hashVerifyCode(verificationCode) })
    .onConflictDoNothing()
    .returning({ aliasId: aliasVerifyCapabilities.aliasId });

  return inserted ? verificationCode : null;
}

async function appendTransparencyEventInTransaction(
  tx: TransparencyTransaction,
  opts: TransparencyEventInput,
): Promise<{ eventId: string; sequence: number }> {
  assertPublicPayload(opts.eventType, opts.publicPayload);
  await lockTransparencyLog(tx);

  if (opts.idempotencyKey) {
    const [existing] = await tx
      .select({ id: transparencyEvents.id, sequence: transparencyEvents.sequence })
      .from(transparencyEvents)
      .where(eq(transparencyEvents.idempotencyKey, opts.idempotencyKey))
      .limit(1);
    if (existing) return { eventId: existing.id, sequence: existing.sequence };
  }

  const [latestEvent] = await tx
    .select({ sequence: transparencyEvents.sequence })
    .from(transparencyEvents)
    .orderBy(desc(transparencyEvents.sequence))
    .limit(1);
  const sequence = (latestEvent?.sequence ?? 0) + 1;
  const eventId = randomUUID();
  const eventFields: CanonicalEventFields = {
    sequence,
    eventId,
    eventType: opts.eventType,
    occurredAt: opts.occurredAt,
    publicPayload: opts.publicPayload,
  };
  const leafHash = computeLeafHash(canonicalEventBytes(eventFields));

  await tx.insert(transparencyEvents).values({
    id: eventId,
    sequence,
    eventType: opts.eventType as typeof transparencyEvents.$inferInsert.eventType,
    occurredAt: opts.occurredAt,
    publicPayload: opts.publicPayload,
    leafHash,
    idempotencyKey: opts.idempotencyKey,
  });

  await tx.insert(transparencyEventLinks).values({
    eventId,
    aliasId: opts.aliasId ?? null,
    domainId: opts.domainId ?? null,
    utcDate: opts.utcDate ?? null,
  });

  const existingNodes = await tx.select().from(transparencyMmrNodes);
  const newNodes = newNodesForLeaf(existingNodes, sequence, leafHash);
  await tx.insert(transparencyMmrNodes).values(newNodes);

  const allNodes = [...existingNodes, ...newNodes];
  const rootHash = bagPeaks(sequence, peaks(sequence).map((peak) => {
    const node = allNodes.find((candidate) => candidate.startSequence === peak.start && candidate.size === peak.size);
    if (!node) throw new Error('Transparency MMR state is incomplete');
    return node.hash;
  }));

  const [previousHead] = await tx
    .select({ rootHash: transparencyHeads.rootHash })
    .from(transparencyHeads)
    .orderBy(desc(transparencyHeads.treeSize))
    .limit(1);
  const publishedAt = new Date();
  const { keyId } = getSigningKey();
  const signature = signTransparencyHead(canonicalHeadBytes({
    treeSize: sequence,
    rootHash,
    previousHeadHash: previousHead?.rootHash ?? null,
    publishedAt,
    keyId,
  }));

  await tx.insert(transparencyHeads).values({
    treeSize: sequence,
    rootHash,
    previousHeadHash: previousHead?.rootHash ?? null,
    keyId,
    signature,
    publishedAt,
  });

  return { eventId, sequence };
}

export async function appendTransparencyEvent(
  opts: TransparencyEventInput,
  tx?: TransparencyTransaction,
): Promise<{ eventId: string; sequence: number }> {
  return tx
    ? appendTransparencyEventInTransaction(tx, opts)
    : db.transaction((transaction) => appendTransparencyEventInTransaction(transaction, opts));
}

export async function recordAliasCreatedInTransaction(
  tx: TransparencyTransaction,
  alias: { id: string; status: string; createdAt: Date },
): Promise<string | null> {
  if (!env.VERIFY_ENABLED) return null;
  const verificationCode = await createVerifyCapabilityInTransaction(tx, alias.id);
  await appendTransparencyEventInTransaction(tx, {
    eventType: 'alias.created',
    occurredAt: alias.createdAt,
    publicPayload: { status: alias.status },
    idempotencyKey: `alias.created:${alias.id}`,
    aliasId: alias.id,
  });
  return verificationCode;
}

export async function recordAliasCreated(alias: { id: string; status: string; createdAt: Date }): Promise<string | null> {
  return db.transaction((tx) => recordAliasCreatedInTransaction(tx, alias));
}

export async function recordAliasStatusChangeInTransaction(
  tx: TransparencyTransaction,
  alias: { id: string; status: string; updatedAt: Date },
): Promise<void> {
  if (!env.VERIFY_ENABLED) return;
  const eventType = alias.status === 'active' ? 'alias.enabled' : alias.status === 'disabled' ? 'alias.disabled' : 'alias.deleted';
  await appendTransparencyEventInTransaction(tx, {
    eventType,
    occurredAt: alias.updatedAt,
    publicPayload: { status: alias.status },
    idempotencyKey: `${eventType}:${alias.id}:${alias.updatedAt.toISOString()}`,
    aliasId: alias.id,
  });
}

export async function recordAliasStatusChange(alias: { id: string; status: string; updatedAt: Date }): Promise<void> {
  await db.transaction((tx) => recordAliasStatusChangeInTransaction(tx, alias));
}

export async function backfillTransparencyLog(): Promise<{ aliasesProcessed: number; capabilitiesCreated: number }> {
  return db.transaction(async (tx) => {
    await lockTransparencyLog(tx);
    const rows = await tx
      .select({ id: aliases.id, status: aliases.status, createdAt: aliases.createdAt })
      .from(aliases)
      .orderBy(asc(aliases.createdAt), asc(aliases.id));
    let capabilitiesCreated = 0;

    const snapshotAt = new Date();
    for (const alias of rows) {
      if (await createVerifyCapabilityInTransaction(tx, alias.id)) capabilitiesCreated += 1;
      await appendTransparencyEventInTransaction(tx, {
        eventType: 'migration.snapshot',
        occurredAt: snapshotAt,
        publicPayload: { snapshot: true, status: alias.status },
        idempotencyKey: `verify-backfill:v1:alias:${alias.id}`,
        aliasId: alias.id,
      });
    }

    await appendTransparencyEventInTransaction(tx, {
      eventType: 'migration.snapshot',
      occurredAt: snapshotAt,
      publicPayload: { aliasesProcessed: rows.length, snapshot: true, version: 1 },
      idempotencyKey: 'verify-backfill:v1:complete',
    });

    return { aliasesProcessed: rows.length, capabilitiesCreated };
  });
}

export interface AliasLookupResult {
  alias: { status: string; createdAt: string };
  domain: { name: string; status: string };
  dkim: {
    keyState: 'active' | 'unverified';
    current: { selector: string; publicKeySha256: string; activatedAt: string } | null;
    history: Array<{ selector: string; publicKeySha256: string; activatedAt: string; retiredAt: string }>;
  };
  expectedDns: Array<{ type: string; name: string; value: string; priority?: number; required: boolean }>;
  provider: { id: string; profileSha256: string; customerSpfValue: string } | null;
  transparency: {
    latestHead: { treeSize: number; rootHash: string; publishedAt: string } | null;
    eventIds: string[];
  };
}

export async function lookupAlias(aliasAddress: string, verificationCode: string): Promise<AliasLookupResult | null> {
  const atIndex = aliasAddress.lastIndexOf('@');
  if (atIndex < 1) return null;
  const localPart = aliasAddress.slice(0, atIndex).toLowerCase();
  const domainPart = aliasAddress.slice(atIndex + 1).toLowerCase();

  const [domain] = await db.select().from(domains).where(eq(domains.domain, domainPart)).limit(1);
  if (!domain) return null;
  const [alias] = await db
    .select()
    .from(aliases)
    .where(and(eq(aliases.localPart, localPart), eq(aliases.domainId, domain.id)))
    .limit(1);
  if (!alias) return null;
  const [capability] = await db
    .select()
    .from(aliasVerifyCapabilities)
    .where(eq(aliasVerifyCapabilities.aliasId, alias.id))
    .limit(1);
  if (!capability || !constantTimeEqual(hashVerifyCode(verificationCode), capability.codeHash)) return null;

  const signingKeys = await db
    .select()
    .from(domainSigningKeys)
    .where(eq(domainSigningKeys.domainId, domain.id))
    .orderBy(desc(domainSigningKeys.activatedAt));
  const activeKey = signingKeys.find((key) => key.status === 'verified' && !key.retiredAt);
  const retiredKeys = signingKeys.filter((key) => key.retiredAt);
  const [providerProfile] = await db
    .select()
    .from(providerTransparencyProfiles)
    .where(isNull(providerTransparencyProfiles.retiredAt))
    .orderBy(desc(providerTransparencyProfiles.effectiveAt))
    .limit(1);
  const [latestHead] = await db.select().from(transparencyHeads).orderBy(desc(transparencyHeads.treeSize)).limit(1);
  const links = await db
    .select({ eventId: transparencyEventLinks.eventId })
    .from(transparencyEventLinks)
    .where(eq(transparencyEventLinks.aliasId, alias.id));

  const dkimSelector = activeKey
    ? (activeKey.expectedDnsName ?? activeKey.selector).split('.')[0]
    : domain.dkimSelector;
  const expectedDns = [
    { type: 'MX', name: domainPart, value: 'mx.shieldme.cc', priority: 10, required: true },
    { type: 'TXT', name: domainPart, value: providerProfile?.customerSpfValue ?? 'v=spf1 include:shieldme.cc -all', required: true },
    ...(activeKey
      ? [{ type: 'TXT', name: `${dkimSelector}._domainkey.${domainPart}`, value: 'v=DKIM1; k=rsa; p=<see-dashboard>', required: true }]
      : []),
  ];

  return {
    alias: { status: alias.status, createdAt: alias.createdAt.toISOString() },
    domain: { name: domainPart, status: domain.status },
    dkim: {
      keyState: activeKey ? 'active' : 'unverified',
      current: activeKey
        ? {
            selector: dkimSelector,
            publicKeySha256: activeKey.publicKeySha256 ?? activeKey.publicKey,
            activatedAt: (activeKey.activatedAt ?? activeKey.verifiedAt ?? new Date()).toISOString(),
          }
        : null,
      history: retiredKeys.map((key) => ({
        selector: (key.expectedDnsName ?? key.selector).split('.')[0],
        publicKeySha256: key.publicKeySha256 ?? key.publicKey,
        activatedAt: key.activatedAt?.toISOString() ?? key.verifiedAt?.toISOString() ?? '',
        retiredAt: (key.retiredAt ?? key.revokedAt ?? new Date()).toISOString(),
      })),
    },
    expectedDns,
    provider: providerProfile
      ? {
          id: providerProfile.providerId,
          profileSha256: providerProfile.profileSha256,
          customerSpfValue: providerProfile.customerSpfValue,
        }
      : null,
    transparency: {
      latestHead: latestHead
        ? {
            treeSize: latestHead.treeSize,
            rootHash: latestHead.rootHash,
            publishedAt: latestHead.publishedAt.toISOString(),
          }
        : null,
      eventIds: links.map((link) => link.eventId),
    },
  };
}

export async function getLatestHead() {
  const [head] = await db.select().from(transparencyHeads).orderBy(desc(transparencyHeads.treeSize)).limit(1);
  if (!head) return null;
  return {
    treeSize: head.treeSize,
    rootHash: head.rootHash,
    previousHeadHash: head.previousHeadHash ?? null,
    keyId: head.keyId,
    signature: head.signature,
    publishedAt: head.publishedAt.toISOString(),
    signingKey: getSigningPublicKeyInfo(),
  };
}

export async function getEventProof(eventId: string, requestedTreeSize?: number) {
  const [event] = await db.select().from(transparencyEvents).where(eq(transparencyEvents.id, eventId)).limit(1);
  if (!event) return null;

  const heads = await db.select().from(transparencyHeads).orderBy(asc(transparencyHeads.treeSize));
  const targetHead = requestedTreeSize
    ? heads.find((head) => head.treeSize === requestedTreeSize && head.treeSize >= event.sequence)
    : heads.filter((head) => head.treeSize >= event.sequence).at(-1);
  if (!targetHead) return null;

  const allNodes = await db
    .select()
    .from(transparencyMmrNodes)
    .where(lte(transparencyMmrNodes.startSequence, targetHead.treeSize));
  const leafHash = computeLeafHash(canonicalEventBytes({
    sequence: event.sequence,
    eventId: event.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    publicPayload: event.publicPayload,
  }));
  const proof = buildInclusionProof(event.sequence, targetHead.treeSize, allNodes, leafHash);

  return {
    event: {
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      publicPayload: event.publicPayload,
      canonicalVersion: event.canonicalVersion,
      leafHash,
    },
    proof: { siblings: proof.siblings, peaks: proof.peaks },
    head: {
      treeSize: targetHead.treeSize,
      rootHash: targetHead.rootHash,
      keyId: targetHead.keyId,
      signature: targetHead.signature,
      publishedAt: targetHead.publishedAt.toISOString(),
    },
    signingKey: getSigningPublicKeyInfo(),
  };
}

export async function getPublicLog(afterSequence: number, limit: number) {
  const events = await db
    .select({
      id: transparencyEvents.id,
      sequence: transparencyEvents.sequence,
      eventType: transparencyEvents.eventType,
      occurredAt: transparencyEvents.occurredAt,
      publicPayload: transparencyEvents.publicPayload,
      canonicalVersion: transparencyEvents.canonicalVersion,
      leafHash: transparencyEvents.leafHash,
    })
    .from(transparencyEvents)
    .where(gt(transparencyEvents.sequence, afterSequence))
    .orderBy(asc(transparencyEvents.sequence))
    .limit(limit);
  const [head] = await db.select().from(transparencyHeads).orderBy(desc(transparencyHeads.treeSize)).limit(1);

  return {
    events: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
    nextAfter: events.at(-1)?.sequence ?? afterSequence,
    head: head
      ? { treeSize: head.treeSize, rootHash: head.rootHash, publishedAt: head.publishedAt.toISOString() }
      : null,
  };
}

export async function getKeyInfo(keyId: string) {
  const key = getSigningPublicKeyInfo();
  return key?.keyId === keyId ? key : null;
}
