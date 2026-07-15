import * as openpgp from 'openpgp';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { pgpKeys, recipients } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { assertPgpAllowed } from '../plans/plans.js';

export class PgpError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

export interface PgpKeyInfo {
  id: string;
  recipientId: string;
  fingerprint: string;
  algorithm: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  expiresSoon?: boolean;
  rotationGuidance?: string;
}

/** Parse and validate an armored PGP public key. Returns metadata. */
export async function validatePgpPublicKey(armored: string): Promise<{
  fingerprint: string;
  algorithm: string;
  expiresAt: Date | null;
}> {
  let key: openpgp.PublicKey;
  try {
    key = await openpgp.readKey({ armoredKey: armored });
  } catch {
    throw new PgpError('Invalid PGP public key: could not parse armored key');
  }

  if (key.isPrivate()) {
    throw new PgpError('Uploaded key is a private key — only public keys are accepted');
  }

  const fingerprint = key.getFingerprint().toUpperCase();
  const algoInfo = key.getAlgorithmInfo();
  const algorithm = algoInfo.algorithm ?? 'unknown';

  const expirationTime = await key.getExpirationTime();
  let expiresAt: Date | null = null;
  if (expirationTime instanceof Date) {
    expiresAt = expirationTime;
    if (expiresAt < new Date()) {
      throw new PgpError('PGP key has already expired');
    }
  }

  return { fingerprint, algorithm, expiresAt };
}

/** Upload or replace the PGP key for a recipient. Caller must own the recipient. */
export async function upsertPgpKey(
  userId: string,
  recipientId: string,
  publicKeyArmored: string,
): Promise<PgpKeyInfo> {
  await assertPgpAllowed(userId);

  const recipient = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, userId)),
  });
  if (!recipient) throw new PgpError('Recipient not found', 404);

  const { fingerprint, algorithm, expiresAt } = await validatePgpPublicKey(publicKeyArmored);

  await db.delete(pgpKeys).where(eq(pgpKeys.recipientId, recipientId));

  const [row] = await db
    .insert(pgpKeys)
    .values({ userId, recipientId, publicKeyArmored, fingerprint, algorithm, expiresAt })
    .returning();

  logger.info({ recipientId, fingerprint }, 'PGP key uploaded');
  return row;
}

function withPgpKeyPolicy(key: PgpKeyInfo & { publicKeyArmored?: string }): PgpKeyInfo & { publicKeyArmored?: string } {
  const expiresSoon = Boolean(key.expiresAt && key.expiresAt.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000);
  return {
    ...key,
    expiresSoon,
    rotationGuidance: expiresSoon
      ? 'This PGP key expires within 30 days. Upload a replacement public key before expiry to avoid required-mode delivery rejections.'
      : 'Rotate PGP keys by uploading the replacement public key, sending a test encrypted delivery, then retiring the old private key.',
  };
}

/** Get PGP key info for a recipient (no key blob unless full=true). */
export async function getPgpKey(
  userId: string,
  recipientId: string,
  full = false,
): Promise<(PgpKeyInfo & { publicKeyArmored?: string }) | null> {
  const recipient = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, userId)),
  });
  if (!recipient) throw new PgpError('Recipient not found', 404);

  const row = await db.query.pgpKeys.findFirst({
    where: eq(pgpKeys.recipientId, recipientId),
  });
  if (!row) return null;

  const rowWithPolicy = withPgpKeyPolicy(row);
  if (full) return rowWithPolicy;
  const { publicKeyArmored: _omit, ...rest } = rowWithPolicy;
  return rest as PgpKeyInfo;
}

/** Delete the PGP key for a recipient. */
export async function deletePgpKey(userId: string, recipientId: string): Promise<void> {
  const recipient = await db.query.recipients.findFirst({
    where: and(eq(recipients.id, recipientId), eq(recipients.ownerId, userId)),
  });
  if (!recipient) throw new PgpError('Recipient not found', 404);

  const existing = await db.query.pgpKeys.findFirst({
    where: eq(pgpKeys.recipientId, recipientId),
  });
  if (!existing) throw new PgpError('No PGP key found for this recipient', 404);

  await db.delete(pgpKeys).where(eq(pgpKeys.recipientId, recipientId));
  logger.info({ recipientId }, 'PGP key deleted');
}

/** Encrypt plaintext with a PGP public key (armored). Returns armored ciphertext. */
export async function encryptWithPgpKey(
  publicKeyArmored: string,
  plaintext: string,
): Promise<string> {
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  const message = await openpgp.createMessage({ text: plaintext });
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: publicKey,
    format: 'armored',
  });
  return encrypted as string;
}

/** Look up the PGP key for a recipient (internal use by worker). */
export async function getArmoredKeyForRecipient(recipientId: string): Promise<string | null> {
  const row = await db.query.pgpKeys.findFirst({
    where: eq(pgpKeys.recipientId, recipientId),
  });
  return row?.publicKeyArmored ?? null;
}


/** Validate that a stored recipient key can encrypt a test delivery without exposing plaintext fallback. */
export async function testEncryptedDelivery(userId: string, recipientId: string): Promise<{ ok: true; fingerprint: string; expiresSoon: boolean; ciphertextPreview: string }> {
  const key = await getPgpKey(userId, recipientId, true);
  if (!key?.publicKeyArmored) throw new PgpError('No PGP key found for this recipient', 404);
  const ciphertext = await encryptWithPgpKey(key.publicKeyArmored, 'ShieldMe encrypted delivery test');
  return {
    ok: true,
    fingerprint: key.fingerprint,
    expiresSoon: Boolean(key.expiresSoon),
    ciphertextPreview: ciphertext.slice(0, 80),
  };
}
