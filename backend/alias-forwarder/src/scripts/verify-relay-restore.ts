import 'dotenv/config';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { domainSigningKeys, domains, smtpRelayCredentials, smtpRelayProfiles } from '../db/schema.js';
import { configureRelayKmsFromEnv } from '../modules/smtp-relays/local-kms.js';
import { decryptRelaySecret } from '../modules/smtp-relays/crypto.js';

if (process.argv[2] !== '--verify') throw new Error('usage: verify-relay-restore --verify');
configureRelayKmsFromEnv();

const [credential] = await db.select({
  relayId: smtpRelayCredentials.relayId,
  version: smtpRelayCredentials.version,
  ciphertext: smtpRelayCredentials.ciphertext,
  iv: smtpRelayCredentials.iv,
  tag: smtpRelayCredentials.tag,
  wrappedDek: smtpRelayCredentials.wrappedDek,
  kekKeyId: smtpRelayCredentials.kekKeyId,
  envelopeVersion: smtpRelayCredentials.envelopeVersion,
  ownerId: smtpRelayProfiles.ownerId,
}).from(smtpRelayCredentials).innerJoin(smtpRelayProfiles, eq(smtpRelayCredentials.relayId, smtpRelayProfiles.id)).where(isNull(smtpRelayCredentials.revokedAt)).limit(1);

const [signingKey] = await db.select({
  id: domainSigningKeys.id,
  ciphertext: domainSigningKeys.ciphertext,
  iv: domainSigningKeys.iv,
  tag: domainSigningKeys.tag,
  wrappedDek: domainSigningKeys.wrappedDek,
  kekKeyId: domainSigningKeys.kekKeyId,
  envelopeVersion: domainSigningKeys.envelopeVersion,
  ownerId: domains.ownerId,
}).from(domainSigningKeys).innerJoin(domains, eq(domainSigningKeys.domainId, domains.id)).where(and(ne(domainSigningKeys.status, 'revoked'), isNull(domainSigningKeys.revokedAt))).limit(1);

if (!credential || !signingKey) throw new Error('restore_verification_requires_encrypted_relay_and_signing_key_rows');
await decryptRelaySecret('smtp_credentials', credential.ownerId, credential.relayId, credential.version, credential);
await decryptRelaySecret('domain_signing_key', signingKey.ownerId, signingKey.id, 1, signingKey);
process.stdout.write(`restore-verification-ok relay_kek=${credential.kekKeyId} signing_kek=${signingKey.kekKeyId}\n`);
