import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Users (Stage 1) ─────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);
export const accountPlanEnum = pgEnum('account_plan', ['free', 'basic', 'pro', 'business']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  refreshTokenHash: text('refresh_token_hash'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  role: userRoleEnum('role').notNull().default('user'),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  plan: accountPlanEnum('plan').notNull().default('free'),
});

// ── Domains (Stage 2) ────────────────────────────────────────────────────────
export const domainStatusEnum = pgEnum('domain_status', [
  'pending',
  'verified',
  'failed',
]);

export const domains = pgTable('domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  domain: text('domain').notNull().unique(),
  verificationToken: text('verification_token').notNull(),
  status: domainStatusEnum('status').notNull().default('pending'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  dkimSelector: text('dkim_selector').notNull(),
  dkimPublicKey: text('dkim_public_key').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('domains_id_owner_id_unique').on(t.id, t.ownerId),
]);

// ── Recipients (Stage 2) ─────────────────────────────────────────────────────
export const recipientStatusEnum = pgEnum('recipient_status', [
  'pending',
  'verified',
]);

export const recipients = pgTable('recipients', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  verificationTokenHash: text('verification_token_hash'),
  verificationTokenExpiresAt: timestamp('verification_token_expires_at', { withTimezone: true }),
  status: recipientStatusEnum('status').notNull().default('pending'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── BYO SMTP (Stage 2) ───────────────────────────────────────────────────────
export const outboundRouteModeEnum = pgEnum('outbound_route_mode', ['platform', 'custom_smtp']);
export const smtpRelayStatusEnum = pgEnum('smtp_relay_status', [
  'draft', 'credentials_unverified', 'testing_dns', 'testing_tls', 'testing_auth',
  'test_submitted', 'awaiting_recipient_confirmation', 'ready', 'active',
  'degraded', 'circuit_open', 'disabled', 'revoked',
]);
export const smtpCircuitStatusEnum = pgEnum('smtp_circuit_status', ['closed', 'open', 'half_open']);
export const smtpTestPhaseEnum = pgEnum('smtp_test_phase', ['dns', 'tls', 'auth', 'submitted', 'confirmed', 'failed']);
export const domainSigningKeyStatusEnum = pgEnum('domain_signing_key_status', ['pending', 'verified', 'revoked']);

export const smtpRelayProfiles = pgTable('smtp_relay_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  domainId: uuid('domain_id').notNull(),
  label: text('label').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  tlsMode: text('tls_mode').notNull(),
  authMethod: text('auth_method').notNull(),
  identityLocalPart: text('identity_local_part').notNull(),
  bounceSpfInclude: text('bounce_spf_include').notNull(),
  status: smtpRelayStatusEnum('status').notNull().default('credentials_unverified'),
  circuitStatus: smtpCircuitStatusEnum('circuit_status').notNull().default('closed'),
  circuitFailureCount: integer('circuit_failure_count').notNull().default(0),
  circuitOpenedAt: timestamp('circuit_opened_at', { withTimezone: true }),
  circuitUntil: timestamp('circuit_until', { withTimezone: true }),
  lastOutcomeCode: text('last_outcome_code'),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
  activeCredentialVersion: integer('active_credential_version'),
  pendingCredentialVersion: integer('pending_credential_version').notNull().default(1),
  isSuspended: boolean('is_suspended').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'smtp_relay_profiles_domain_owner_fkey', columns: [t.domainId, t.ownerId], foreignColumns: [domains.id, domains.ownerId] }).onDelete('cascade'),
  unique('smtp_relay_profiles_owner_domain_unique').on(t.ownerId, t.domainId),
  unique('smtp_relay_profiles_id_owner_domain_unique').on(t.id, t.ownerId, t.domainId),
  check('smtp_relay_profiles_port_tls_check', sql`(${t.port} = 465 and ${t.tlsMode} = 'implicit_tls') or (${t.port} = 587 and ${t.tlsMode} = 'starttls')`),
  check('smtp_relay_profiles_auth_check', sql`${t.authMethod} in ('plain', 'login')`),
]);

export const smtpRelayCredentials = pgTable('smtp_relay_credentials', {
  relayId: uuid('relay_id').notNull().references(() => smtpRelayProfiles.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  wrappedDek: text('wrapped_dek').notNull(),
  kekKeyId: text('kek_key_id').notNull(),
  envelopeVersion: integer('envelope_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  unique('smtp_relay_credentials_relay_version_unique').on(t.relayId, t.version),
]);

export const smtpRelayTests = pgTable('smtp_relay_tests', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  relayId: uuid('relay_id').notNull().references(() => smtpRelayProfiles.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id').notNull().references(() => recipients.id, { onDelete: 'cascade' }),
  credentialVersion: integer('credential_version').notNull(),
  tokenHash: text('token_hash').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }).notNull(),
  phase: smtpTestPhaseEnum('phase').notNull(),
  outcomeCode: text('outcome_code').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('smtp_relay_tests_owner_created_idx').on(t.ownerId, t.createdAt),
]);

export const domainSigningKeys = pgTable('domain_signing_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  selector: text('selector').notNull(),
  publicKey: text('public_key').notNull(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  wrappedDek: text('wrapped_dek').notNull(),
  kekKeyId: text('kek_key_id').notNull(),
  envelopeVersion: integer('envelope_version').notNull().default(1),
  status: domainSigningKeyStatusEnum('status').notNull().default('pending'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('domain_signing_keys_domain_selector_unique').on(t.domainId, t.selector),
]);

// ── Aliases (Stage 3) ────────────────────────────────────────────────────────
export const aliasStatusEnum = pgEnum('alias_status', [
  'active',
  'disabled',
  'deleted',
]);

export const pgpModeEnum = pgEnum('pgp_mode', ['none', 'optional', 'required']);

export const aliases = pgTable('aliases', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  domainId: uuid('domain_id')
    .notNull()
    .references(() => domains.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id')
    .notNull()
    .references(() => recipients.id, { onDelete: 'cascade' }),
  localPart: text('local_part').notNull(),
  status: aliasStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  pgpMode: pgpModeEnum('pgp_mode').notNull().default('none'),
  outboundMode: outboundRouteModeEnum('outbound_mode').notNull().default('platform'),
  smtpRelayId: uuid('smtp_relay_id'),
}, (t) => [
  unique('aliases_local_part_domain_id_unique').on(t.localPart, t.domainId),
  foreignKey({ name: 'aliases_smtp_relay_scope_fkey', columns: [t.smtpRelayId, t.ownerId, t.domainId], foreignColumns: [smtpRelayProfiles.id, smtpRelayProfiles.ownerId, smtpRelayProfiles.domainId] }).onDelete('restrict'),
  check('aliases_outbound_route_check', sql`(${t.outboundMode} = 'platform' and ${t.smtpRelayId} is null) or (${t.outboundMode} = 'custom_smtp' and ${t.smtpRelayId} is not null)`),
]);

// ── PGP Keys (Stage 10) ───────────────────────────────────────────────────────
export const pgpKeys = pgTable('pgp_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  recipientId: uuid('recipient_id').notNull(),
  publicKeyArmored: text('public_key_armored').notNull(),
  fingerprint: text('fingerprint').notNull(),
  algorithm: text('algorithm').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'pgp_keys_user_id_fkey', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  foreignKey({ name: 'pgp_keys_recipient_id_fkey', columns: [t.recipientId], foreignColumns: [recipients.id] }).onDelete('cascade'),
  unique('pgp_keys_recipient_id_key').on(t.recipientId),
  unique('pgp_keys_fingerprint_key').on(t.fingerprint),
]);

// ── Mail logs (Stage 4) — metadata only, no body ─────────────────────────────
export const mailLogStatusEnum = pgEnum('mail_log_status', [
  'queued',
  'delivered',
  'failed',
  'rejected',
  'bounced',
  'complained',
]);

export const mailLogs = pgTable('mail_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  aliasId: uuid('alias_id').references(() => aliases.id, { onDelete: 'set null' }),
  envelopeFrom: text('envelope_from').notNull(),
  envelopeTo: text('envelope_to').notNull(),
  forwardedTo: text('forwarded_to'),
  externalMessageId: text('external_message_id'),
  resendMessageId: text('resend_message_id'),
  status: mailLogStatusEnum('status').notNull().default('queued'),
  rejectionReason: text('rejection_reason'),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  pgpModeUsed: pgpModeEnum('pgp_mode_used').notNull().default('none'),
  pgpEncrypted: boolean('pgp_encrypted').notNull().default(false),
  authResults: jsonb('auth_results').$type<Record<string, unknown> | null>(),
  authFailureCount: integer('auth_failure_count').notNull().default(0),
  spamScan: jsonb('spam_scan').$type<Record<string, unknown> | null>(),
  spamScore: integer('spam_score').notNull().default(0),
  spamCategory: text('spam_category'),
  spamAction: text('spam_action'),
  outboundProvider: text('outbound_provider'),
  outboundRouteMode: outboundRouteModeEnum('outbound_route_mode').notNull().default('platform'),
  smtpRelayId: uuid('smtp_relay_id').references(() => smtpRelayProfiles.id, { onDelete: 'set null' }),
  providerMessageId: text('provider_message_id'),
  smtpResponseClass: text('smtp_response_class'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  bounceTokenHash: text('bounce_token_hash'),
  bounceExpiresAt: timestamp('bounce_expires_at', { withTimezone: true }),
  failureType: text('failure_type'),
  failureReason: text('failure_reason'),
  trackingProtection: jsonb('tracking_protection').$type<Record<string, unknown> | null>(),
});

// ── Sender blocklist (Stage 5) ───────────────────────────────────────────────
export const senderBlocklists = pgTable('sender_blocklists', {
  id: uuid('id').defaultRandom().primaryKey(),
  aliasId: uuid('alias_id').notNull(),
  senderEmail: text('sender_email').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'sender_blocklists_alias_id_fkey', columns: [t.aliasId], foreignColumns: [aliases.id] }).onDelete('cascade'),
  unique('sender_blocklists_alias_sender_unique').on(t.aliasId, t.senderEmail),
]);

// ── Suppression list (Stage 5) ───────────────────────────────────────────────
export const suppressionReasonEnum = pgEnum('suppression_reason', [
  'bounce',
  'complaint',
  'manual',
]);

export const suppressionList = pgTable('suppression_list', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  reason: suppressionReasonEnum('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('suppression_list_email_key').on(t.email),
]);

// ── Audit logs (Stage 12) ────────────────────────────────────────────────────
export const actorTypeEnum = pgEnum('actor_type', ['admin', 'system', 'user']);

export const reservedLocalPartActionEnum = pgEnum('reserved_local_part_action', ['reserve', 'allow']);

export const reservedLocalParts = pgTable('reserved_local_parts', {
  id: uuid('id').defaultRandom().primaryKey(),
  localPart: text('local_part').notNull(),
  domainId: uuid('domain_id'),
  action: reservedLocalPartActionEnum('action').notNull().default('reserve'),
  note: text('note'),
  sourceBatch: text('source_batch'),
  sourceSha256: text('source_sha256'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'reserved_local_parts_domain_id_fkey', columns: [t.domainId], foreignColumns: [domains.id] }).onDelete('cascade'),
  uniqueIndex('reserved_local_parts_global_unique').on(t.localPart).where(sql`${t.domainId} is null`),
  uniqueIndex('reserved_local_parts_domain_unique').on(t.localPart, t.domainId).where(sql`${t.domainId} is not null`),
  index('reserved_local_parts_source_batch_idx').on(t.sourceBatch).where(sql`${t.sourceBatch} is not null`),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  actorType: actorTypeEnum('actor_type').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

// ── Delivery failure log (Phase 4) — metadata only, no body ─────────────────
export const deliveryFailureReasonEnum = pgEnum('delivery_failure_reason', [
  'bounce',
  'complaint',
  'failed',
]);

export const deliveryFailureLog = pgTable('delivery_failure_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  aliasId: uuid('alias_id'),
  /** Full alias address e.g. hello@example.com — kept even if alias is deleted */
  aliasAddress: text('alias_address').notNull(),
  /** Recipient that bounced/complained — metadata only, no body */
  recipient: text('recipient').notNull(),
  provider: text('provider').notNull(),
  providerMessageId: text('provider_message_id'),
  reason: deliveryFailureReasonEnum('reason').notNull(),
  /** Short diagnostic string (<=500 chars), no body material */
  failureDetail: text('failure_detail'),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'delivery_failure_log_alias_id_fkey', columns: [t.aliasId], foreignColumns: [aliases.id] }).onDelete('set null'),
  index('delivery_failure_log_alias_id_idx').on(t.aliasId),
  index('delivery_failure_log_reason_idx').on(t.reason),
  index('delivery_failure_log_timestamp_idx').on(t.timestamp),
]);

// ── Ops-only TTI checks (Stage 42) — metadata only, no body ──────────────────
export const ttiCheckStatusEnum = pgEnum('tti_check_status', [
  'pending',
  'forwarded',
  'failed',
  'expired',
]);

export const ttiChecks = pgTable('tti_checks', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Random synthetic probe token; never message content */
  probeToken: text('probe_token').notNull().unique(),
  /** Controlled synthetic alias under ShieldMe monitoring */
  aliasAddress: text('alias_address').notNull(),
  /** Optional provider/inbox labels for ops dashboards */
  provider: text('provider'),
  syntheticInbox: text('synthetic_inbox'),
  externalMessageId: text('external_message_id'),
  providerMessageId: text('provider_message_id'),
  status: ttiCheckStatusEnum('status').notNull().default('pending'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  latencyMs: bigint('latency_ms', { mode: 'number' }),
  /** Short diagnostic string (<=500 chars), no body material */
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
