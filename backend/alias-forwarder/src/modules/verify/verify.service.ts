/**
 * Verify service — read-only queries for public /verify endpoints.
 * No PII: aliases looked up only via alias address + capability code (HMAC).
 */
import { createHmac, timingSafeEqual, randomBytes, createSign, createVerify } from 'node:crypto';
import { eq, and, desc, asc, gt, lte } from 'drizzle-orm';
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
  CanonicalEventFields,
} from './mmr.js';

// ── capability helpers ────────────────────────────────────────────────────────

function getPepper(): Buffer {
  const pepper = env.TRANSPARENCY_VERIFY_CODE_PEPPER;
  if (!pepper) throw new Error('TRANSPARENCY_VERIFY_CODE_PEPPER not configured');
  return Buffer.from(pepper, 'hex');
}

export function generateVerifyCode(): string {
  return randomBytes(32).toString('base64url');
}

export function hashVerifyCode(rawCode: string): string {
  const pepper = getPepper();
  return createHmac('sha256', pepper).update(rawCode).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ── signing helpers ───────────────────────────────────────────────────────────

function getSigningKey(): { privateKey: Buffer; keyId: string } {
  const raw = env.TRANSPARENCY_SIGNING_PRIVATE_KEY;
  const keyId = env.TRANSPARENCY_SIGNING_KEY_ID;
  if (!raw || !keyId) throw new Error('Transparency signing key not configured');
  return { privateKey: b64uDecode(raw), keyId };
}

function signHead(headBytes: Buffer): string {
  const { privateKey } = getSigningKey();
  // Node built-in Ed25519 from raw 32-byte seed
  const keyObj = {
    key: privateKey,
    format: 'der' as const,
    type: 'pkcs8' as const,
  };
  // Build PKCS8 DER for Ed25519 seed
  // PKCS8 Ed25519 wrapper: 30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 <32 bytes seed>
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Prefix, privateKey]);
  const sign = createSign('Ed25519');
  sign.update(headBytes);
  return sign.sign({ key: pkcs8Der, format: 'der', type: 'pkcs8' }).toString('base64url');
}

export function getPublicKeyInfo(): { keyId: string; publicKey: string; publicKeySha256: string } {
  const { privateKey, keyId } = getSigningKey();
  // Derive Ed25519 public key from seed via PKCS8/SubjectPublicKeyInfo
  // SubjectPublicKeyInfo for Ed25519: 30 2a 30 05 06 03 2b 65 70 03 21 00 <32-byte pubkey>
  // We use createSign round-trip to extract; but simpler: use crypto.generateKeyPairSync
  // with private key to get public key bytes.
  // Node doesn't easily expose raw pubkey from seed directly, so we encode as PKCS8 and export SPKI.
  const { createPrivateKey, createPublicKey } = await_import_sync();
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Prefix, privateKey]);
  const privKeyObj = createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const pubKeyObj = createPublicKey(privKeyObj);
  const spkiDer = pubKeyObj.export({ format: 'der', type: 'spki' }) as Buffer;
  // Last 32 bytes of the 44-byte SPKI are the raw public key
  const rawPub = spkiDer.slice(-32);
  const pubB64u = b64uEncode(rawPub);
  const { createHash } = require_crypto();
  const sha256 = createHash('sha256').update(rawPub).digest('base64url');
  return { keyId, publicKey: pubB64u, publicKeySha256: sha256 };
}

// We can't use top-level await in ESM without async, so use a sync helper
function await_import_sync() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:crypto') as typeof import('node:crypto');
}
function require_crypto() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:crypto') as typeof import('node:crypto');
}

// ── public key info (exported cleanly) ───────────────────────────────────────

export function getSigningPublicKeyInfo(): { keyId: string; publicKey: string; publicKeySha256: string } | null {
  try {
    const raw = env.TRANSPARENCY_SIGNING_PRIVATE_KEY;
    const keyId = env.TRANSPARENCY_SIGNING_KEY_ID;
    if (!raw || !keyId) return null;
    const { createPrivateKey, createPublicKey, createHash } = await_import_sync();
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
    const privateKey = b64uDecode(raw);
    const pkcs8Der = Buffer.concat([pkcs8Prefix, privateKey]);
    const privKeyObj = createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    const pubKeyObj = createPublicKey(privKeyObj);
    const spkiDer = pubKeyObj.export({ format: 'der', type: 'spki' }) as Buffer;
    const rawPub = spkiDer.slice(-32);
    const publicKey = b64uEncode(rawPub);
    const publicKeySha256 = createHash('sha256').update(rawPub).digest('base64url');
    return { keyId, publicKey, publicKeySha256 };
  } catch {
    return null;
  }
}

// ── alias lookup ──────────────────────────────────────────────────────────────

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

export async function lookupAlias(
  aliasAddress: string,
  verificationCode: string,
): Promise<AliasLookupResult | null> {
  // Parse alias address
  const atIdx = aliasAddress.lastIndexOf('@');
  if (atIdx < 1) return null;
  const localPart = aliasAddress.slice(0, atIdx).toLowerCase();
  const domainPart = aliasAddress.slice(atIdx + 1).toLowerCase();

  // Find domain
  const [domainRow] = await db
    .select()
    .from(domains)
    .where(eq(domains.domain, domainPart))
    .limit(1);
  if (!domainRow) return null;

  // Find alias
  const [aliasRow] = await db
    .select()
    .from(aliases)
    .where(and(eq(aliases.localPart, localPart), eq(aliases.domainId, domainRow.id)))
    .limit(1);
  if (!aliasRow) return null;

  // Check capability
  const [cap] = await db
    .select()
    .from(aliasVerifyCapabilities)
    .where(eq(aliasVerifyCapabilities.aliasId, aliasRow.id))
    .limit(1);
  if (!cap) return null;

  const providedHash = hashVerifyCode(verificationCode);
  if (!constantTimeEqual(providedHash, cap.codeHash)) return null;

  // Fetch DKIM signing keys for domain
  const signingKeys = await db
    .select()
    .from(domainSigningKeys)
    .where(eq(domainSigningKeys.domainId, domainRow.id))
    .orderBy(desc(domainSigningKeys.activatedAt));

  const activeKey = signingKeys.find((k) => k.status === 'verified' && !k.retiredAt);
  const retiredKeys = signingKeys.filter((k) => k.retiredAt);

  // Fetch active provider profile
  const [providerProfile] = await db
    .select()
    .from(providerTransparencyProfiles)
    .where(eq(providerTransparencyProfiles.retiredAt, null as unknown as Date))
    .orderBy(desc(providerTransparencyProfiles.effectiveAt))
    .limit(1);

  // Fetch latest head
  const [latestHead] = await db
    .select()
    .from(transparencyHeads)
    .orderBy(desc(transparencyHeads.treeSize))
    .limit(1);

  // Fetch event IDs for this alias (via links)
  const links = await db
    .select({ eventId: transparencyEventLinks.eventId })
    .from(transparencyEventLinks)
    .where(eq(transparencyEventLinks.aliasId, aliasRow.id));

  // Build expected DNS records
  const customerSpf = providerProfile?.customerSpfValue ?? 'v=spf1 include:shieldme.cc -all';
  const dkimSelector = activeKey
    ? (activeKey.expectedDnsName ?? activeKey.selector).split('.')[0]
    : domainRow.dkimSelector;
  const expectedDns = [
    { type: 'MX', name: domainPart, value: 'mx.shieldme.cc', priority: 10, required: true },
    { type: 'TXT', name: domainPart, value: customerSpf, required: true },
    ...(activeKey
      ? [{ type: 'TXT', name: `${dkimSelector}._domainkey.${domainPart}`, value: `v=DKIM1; k=rsa; p=<see-dashboard>`, required: true }]
      : []),
  ];

  return {
    alias: {
      status: aliasRow.status,
      createdAt: aliasRow.createdAt.toISOString(),
    },
    domain: {
      name: domainPart,
      status: domainRow.status,
    },
    dkim: {
      keyState: activeKey ? 'active' : 'unverified',
      current: activeKey
        ? {
            selector: dkimSelector,
            publicKeySha256: activeKey.publicKeySha256 ?? activeKey.publicKey,
            activatedAt: (activeKey.activatedAt ?? activeKey.verifiedAt ?? new Date()).toISOString(),
          }
        : null,
      history: retiredKeys.map((k) => ({
        selector: (k.expectedDnsName ?? k.selector).split('.')[0],
        publicKeySha256: k.publicKeySha256 ?? k.publicKey,
        activatedAt: k.activatedAt?.toISOString() ?? k.verifiedAt?.toISOString() ?? '',
        retiredAt: (k.retiredAt ?? k.revokedAt ?? new Date()).toISOString(),
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
      eventIds: links.map((l) => l.eventId),
    },
  };
}

// ── latest head ───────────────────────────────────────────────────────────────

export async function getLatestHead() {
  const [head] = await db
    .select()
    .from(transparencyHeads)
    .orderBy(desc(transparencyHeads.treeSize))
    .limit(1);
  if (!head) return null;
  const pkInfo = getSigningPublicKeyInfo();
  return {
    treeSize: head.treeSize,
    rootHash: head.rootHash,
    previousHeadHash: head.previousHeadHash ?? null,
    keyId: head.keyId,
    signature: head.signature,
    publishedAt: head.publishedAt.toISOString(),
    signingKey: pkInfo,
  };
}

// ── event proof ───────────────────────────────────────────────────────────────

export async function getEventProof(eventId: string, requestedTreeSize?: number) {
  const [event] = await db
    .select()
    .from(transparencyEvents)
    .where(eq(transparencyEvents.id, eventId))
    .limit(1);
  if (!event) return null;

  // Get head at or after event sequence
  const headQuery = db
    .select()
    .from(transparencyHeads)
    .orderBy(asc(transparencyHeads.treeSize));

  const allHeads = await headQuery;
  const targetHead = requestedTreeSize
    ? allHeads.find((h) => h.treeSize === requestedTreeSize && h.treeSize >= event.sequence)
    : allHeads.filter((h) => h.treeSize >= event.sequence).sort((a, b) => b.treeSize - a.treeSize)[0];

  if (!targetHead) return null;

  // Fetch all MMR nodes for this tree size
  const allNodes = await db
    .select()
    .from(transparencyMmrNodes)
    .where(lte(transparencyMmrNodes.startSequence, targetHead.treeSize));

  // Canonical event bytes and leaf hash
  const evFields: CanonicalEventFields = {
    sequence: event.sequence,
    eventId: event.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    publicPayload: event.publicPayload,
  };
  const evBytes = canonicalEventBytes(evFields);
  const lHash = computeLeafHash(evBytes);

  const proof = buildInclusionProof(event.sequence, targetHead.treeSize, allNodes, lHash);

  return {
    event: {
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType,
      occurredAt: event.occurredAt.toISOString(),
      publicPayload: event.publicPayload,
      canonicalVersion: event.canonicalVersion,
      leafHash: lHash,
    },
    proof: {
      siblings: proof.siblings,
      peaks: proof.peaks,
    },
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

// ── public log page ───────────────────────────────────────────────────────────

export async function getPublicLog(afterSequence: number, limit: number) {
  const rows = await db
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

  const [latestHead] = await db
    .select()
    .from(transparencyHeads)
    .orderBy(desc(transparencyHeads.treeSize))
    .limit(1);

  const nextAfter = rows.length > 0 ? rows[rows.length - 1]!.sequence : afterSequence;

  return {
    events: rows.map((r) => ({
      ...r,
      occurredAt: r.occurredAt.toISOString(),
    })),
    nextAfter,
    head: latestHead
      ? {
          treeSize: latestHead.treeSize,
          rootHash: latestHead.rootHash,
          publishedAt: latestHead.publishedAt.toISOString(),
        }
      : null,
  };
}

// ── key info ──────────────────────────────────────────────────────────────────

export async function getKeyInfo(keyId: string) {
  // For now keys are runtime-only (no DB table), return current if matches
  const pkInfo = getSigningPublicKeyInfo();
  if (!pkInfo || pkInfo.keyId !== keyId) return null;
  return pkInfo;
}

// ── append event (writer — used by lifecycle operations) ─────────────────────

export async function appendTransparencyEvent(opts: {
  eventType: string;
  occurredAt: Date;
  publicPayload: unknown;
  idempotencyKey?: string;
  aliasId?: string;
  domainId?: string;
  utcDate?: string;
}): Promise<{ eventId: string; sequence: number }> {
  const { createPrivateKey } = await_import_sync();
  const { keyId } = getSigningKey();

  return await db.transaction(async (tx) => {
    // Allocate sequence under transaction lock
    const existing = await tx
      .select({ sequence: transparencyEvents.sequence })
      .from(transparencyEvents)
      .orderBy(desc(transparencyEvents.sequence))
      .limit(1)
      .for('update');
    const sequence = (existing[0]?.sequence ?? 0) + 1;

    // Canonical bytes + leaf hash
    const tempId = crypto.randomUUID();
    const evFields: CanonicalEventFields = {
      sequence,
      eventId: tempId,
      eventType: opts.eventType,
      occurredAt: opts.occurredAt,
      publicPayload: opts.publicPayload,
    };
    const evBytes = canonicalEventBytes(evFields);
    const lHash = computeLeafHash(evBytes);

    // Insert event
    const [inserted] = await tx
      .insert(transparencyEvents)
      .values({
        id: tempId,
        sequence,
        eventType: opts.eventType as typeof transparencyEvents.$inferInsert.eventType,
        occurredAt: opts.occurredAt,
        publicPayload: opts.publicPayload,
        leafHash: lHash,
        idempotencyKey: opts.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning({ id: transparencyEvents.id, sequence: transparencyEvents.sequence });

    // If idempotency key fired, fetch existing
    const eventId = inserted?.id ?? tempId;
    const eventSeq = inserted?.sequence ?? sequence;

    // Insert event link
    await tx.insert(transparencyEventLinks).values({
      eventId,
      aliasId: opts.aliasId ?? null,
      domainId: opts.domainId ?? null,
      utcDate: opts.utcDate ?? null,
    }).onConflictDoNothing();

    // Update MMR nodes
    const existingNodes = await tx
      .select()
      .from(transparencyMmrNodes);
    const newNodes = newNodesForLeaf(existingNodes, eventSeq, lHash);
    if (newNodes.length > 0) {
      await tx.insert(transparencyMmrNodes).values(newNodes).onConflictDoNothing();
    }

    // Compute new root
    const allNodes = [...existingNodes, ...newNodes];
    const peakList = peaks(eventSeq);
    const peakHashes = peakList.map((p) => {
      const node = allNodes.find((n) => n.startSequence === p.start && n.size === p.size);
      return node?.hash ?? '';
    });
    const rootHash = bagPeaks(eventSeq, peakHashes);

    // Get previous head hash
    const [prevHead] = await tx
      .select({ rootHash: transparencyHeads.rootHash })
      .from(transparencyHeads)
      .orderBy(desc(transparencyHeads.treeSize))
      .limit(1);

    // Sign head
    const publishedAt = new Date();
    const headFields = {
      treeSize: eventSeq,
      rootHash,
      previousHeadHash: prevHead?.rootHash ?? null,
      publishedAt,
      keyId,
    };
    const headBytes = canonicalHeadBytes(headFields);
    const signature = signHead(headBytes);

    await tx.insert(transparencyHeads).values({
      treeSize: eventSeq,
      rootHash,
      previousHeadHash: prevHead?.rootHash ?? null,
      keyId,
      signature,
      publishedAt,
    }).onConflictDoNothing();

    return { eventId, sequence: eventSeq };
  });
}
