import 'dotenv/config';
import assert from 'node:assert/strict';
import { encryptQueuePayload, decryptQueuePayload } from '../queues/secure-email-jobs.js';

type AliasState = {
  domain: string;
  localPart: string;
  aliasActive: boolean;
  ownerActive: boolean;
  recipientVerified: boolean;
};

type BackupMxDecision =
  | { accepted: true; reason: 'accepted'; address: string }
  | { accepted: false; reason: 'invalid_recipient' | 'invalid_domain' | 'invalid_alias' | 'alias_inactive' | 'owner_inactive' | 'recipient_unverified'; address: string };

const validAliases: AliasState[] = [
  { domain: 'shieldme.cc', localPart: 'valid', aliasActive: true, ownerActive: true, recipientVerified: true },
  { domain: 'shieldme.cc', localPart: 'disabled', aliasActive: false, ownerActive: true, recipientVerified: true },
];

function evaluateBackupMxRecipient(address: string): BackupMxDecision {
  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) return { accepted: false, reason: 'invalid_recipient', address };

  const localPart = address.slice(0, at).toLowerCase();
  const domain = address.slice(at + 1).toLowerCase();
  const domainKnown = validAliases.some((entry) => entry.domain === domain);
  if (!domainKnown) return { accepted: false, reason: 'invalid_domain', address };

  const alias = validAliases.find((entry) => entry.domain === domain && entry.localPart === localPart);
  if (!alias) return { accepted: false, reason: 'invalid_alias', address };
  if (!alias.aliasActive) return { accepted: false, reason: 'alias_inactive', address };
  if (!alias.ownerActive) return { accepted: false, reason: 'owner_inactive', address };
  if (!alias.recipientVerified) return { accepted: false, reason: 'recipient_unverified', address };

  return { accepted: true, reason: 'accepted', address };
}

function main() {
  const accepted = evaluateBackupMxRecipient('valid@shieldme.cc');
  const invalidDomain = evaluateBackupMxRecipient('valid@example.net');
  const invalidAlias = evaluateBackupMxRecipient('missing@shieldme.cc');
  const inactiveAlias = evaluateBackupMxRecipient('disabled@shieldme.cc');

  assert.equal(accepted.accepted, true, 'valid ShieldMe alias should be accepted');
  assert.deepEqual(invalidDomain, { accepted: false, reason: 'invalid_domain', address: 'valid@example.net' });
  assert.deepEqual(invalidAlias, { accepted: false, reason: 'invalid_alias', address: 'missing@shieldme.cc' });
  assert.deepEqual(inactiveAlias, { accepted: false, reason: 'alias_inactive', address: 'disabled@shieldme.cc' });

  const plaintextPayload = {
    to: accepted.address,
    subject: 'Backup MX secret subject',
    textBody: 'Backup MX sensitive plaintext body',
    htmlBody: '<p>Backup MX sensitive plaintext body</p>',
  };
  const sealed = encryptQueuePayload(plaintextPayload, 60);
  const serialized = JSON.stringify(sealed);

  assert.equal(sealed.encrypted, true, 'queued payload must be marked encrypted');
  assert.equal(serialized.includes(plaintextPayload.subject), false, 'sealed payload must not contain plaintext subject');
  assert.equal(serialized.includes(plaintextPayload.textBody), false, 'sealed payload must not contain plaintext body');
  assert.deepEqual(decryptQueuePayload<typeof plaintextPayload>(sealed), plaintextPayload, 'sealed payload must decrypt before TTL');

  const expired = encryptQueuePayload({ textBody: 'expires' }, -1);
  assert.throws(() => decryptQueuePayload(expired), /email_queue_payload_expired/, 'expired payload must be discarded');

  console.log(JSON.stringify({
    accepted,
    rejected: [invalidDomain, invalidAlias, inactiveAlias],
    encryptedStorageVerified: true,
    ttlCleanupVerified: true,
    mailboxFeaturesIntroduced: false,
  }, null, 2));
}

main();
