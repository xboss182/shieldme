import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { domainSigningKeys, domains, smtpRelayCredentials, smtpRelayProfiles } from '../db/schema.js';
import { configureRelayKmsFromEnv } from '../modules/smtp-relays/local-kms.js';
import { rewrapRelaySecret } from '../modules/smtp-relays/crypto.js';

if (process.argv[2] !== '--apply') throw new Error('usage: rotate-relay-kek --apply');
configureRelayKmsFromEnv();

const credentials = await db.select({
  relayId: smtpRelayCredentials.relayId,
  version: smtpRelayCredentials.version,
  ciphertext: smtpRelayCredentials.ciphertext,
  iv: smtpRelayCredentials.iv,
  tag: smtpRelayCredentials.tag,
  wrappedDek: smtpRelayCredentials.wrappedDek,
  kekKeyId: smtpRelayCredentials.kekKeyId,
  envelopeVersion: smtpRelayCredentials.envelopeVersion,
  ownerId: smtpRelayProfiles.ownerId,
}).from(smtpRelayCredentials).innerJoin(smtpRelayProfiles, eq(smtpRelayCredentials.relayId, smtpRelayProfiles.id));

const signingKeys = await db.select({
  id: domainSigningKeys.id,
  ciphertext: domainSigningKeys.ciphertext,
  iv: domainSigningKeys.iv,
  tag: domainSigningKeys.tag,
  wrappedDek: domainSigningKeys.wrappedDek,
  kekKeyId: domainSigningKeys.kekKeyId,
  envelopeVersion: domainSigningKeys.envelopeVersion,
  ownerId: domains.ownerId,
}).from(domainSigningKeys).innerJoin(domains, eq(domainSigningKeys.domainId, domains.id));

for (const credential of credentials) {
  const envelope = await rewrapRelaySecret('smtp_credentials', credential.ownerId, credential.relayId, credential.version, credential);
  await db.update(smtpRelayCredentials).set({ wrappedDek: envelope.wrappedDek, kekKeyId: envelope.kekKeyId }).where(and(eq(smtpRelayCredentials.relayId, credential.relayId), eq(smtpRelayCredentials.version, credential.version)));
}

for (const signingKey of signingKeys) {
  const envelope = await rewrapRelaySecret('domain_signing_key', signingKey.ownerId, signingKey.id, 1, signingKey);
  await db.update(domainSigningKeys).set({ wrappedDek: envelope.wrappedDek, kekKeyId: envelope.kekKeyId }).where(eq(domainSigningKeys.id, signingKey.id));
}

process.stdout.write(`rewrapped ${credentials.length} relay credential envelope(s) and ${signingKeys.length} signing-key envelope(s)\n`);
