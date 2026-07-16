import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const baselinePath = join(process.cwd(), 'drizzle/canonical-baseline/20260715175548_canonical_baseline.sql');
const baseline = readFileSync(baselinePath, 'utf8');

describe('canonical production baseline', () => {
  it('uses the production audit actor type and text target IDs', () => {
    expect(baseline).toContain('CREATE TYPE "public"."actor_type" AS ENUM');
    expect(baseline).not.toContain('audit_actor_type');
    expect(baseline).toMatch(/CREATE TABLE "audit_logs" \([\s\S]*?"target_id" text NOT NULL/);
  });

  it('preserves global and domain-scoped reserved local-part uniqueness', () => {
    expect(baseline).toContain('CREATE UNIQUE INDEX "reserved_local_parts_global_unique"');
    expect(baseline).toContain('WHERE "reserved_local_parts"."domain_id" is null');
    expect(baseline).toContain('CREATE UNIQUE INDEX "reserved_local_parts_domain_unique"');
    expect(baseline).toContain('WHERE "reserved_local_parts"."domain_id" is not null');
  });

  it('preserves production physical column order', () => {
    const table = (name: string) => baseline.match(new RegExp(`CREATE TABLE "${name}" \\(([\\s\\S]*?)\\n\\);`))?.[1] ?? '';

    expect(table('aliases')).toMatch(/"status"[\s\S]*"created_at"[\s\S]*"updated_at"[\s\S]*"pgp_mode"/);
    expect(table('mail_logs')).toMatch(/"resend_message_id"[\s\S]*"status"[\s\S]*"rejection_reason"[\s\S]*"size_bytes"[\s\S]*"created_at"[\s\S]*"updated_at"[\s\S]*"pgp_mode_used"[\s\S]*"pgp_encrypted"[\s\S]*"auth_results"[\s\S]*"auth_failure_count"[\s\S]*"spam_scan"[\s\S]*"spam_score"[\s\S]*"spam_category"[\s\S]*"spam_action"[\s\S]*"outbound_provider"[\s\S]*"failure_type"[\s\S]*"failure_reason"[\s\S]*"tracking_protection"/);
    expect(table('users')).toMatch(/"password_hash"[\s\S]*"refresh_token_hash"[\s\S]*"is_active"[\s\S]*"created_at"[\s\S]*"updated_at"[\s\S]*"role"[\s\S]*"failed_login_attempts"[\s\S]*"locked_until"[\s\S]*"last_login_at"[\s\S]*"plan"/);
  });

  it('materializes the empty Drizzle migration ledger', () => {
    expect(baseline).toContain('CREATE SCHEMA "drizzle"');
    expect(baseline).toMatch(/CREATE TABLE "drizzle"\."__drizzle_migrations" \([\s\S]*?"id" serial PRIMARY KEY NOT NULL,[\s\S]*?"hash" text NOT NULL,[\s\S]*?"created_at" bigint/);
    expect(baseline).not.toMatch(/INSERT INTO "drizzle"\."__drizzle_migrations"/);
  });

  it('pins approved production constraint names', () => {
    for (const name of [
      'delivery_failure_log_alias_id_fkey',
      'pgp_keys_fingerprint_key',
      'pgp_keys_recipient_id_fkey',
      'pgp_keys_recipient_id_key',
      'pgp_keys_user_id_fkey',
      'reserved_local_parts_domain_id_fkey',
      'sender_blocklists_alias_id_fkey',
      'suppression_list_email_key',
    ]) {
      expect(baseline).toContain(`"${name}"`);
    }
  });

  it('preserves delivery failure lookup indexes and metadata-only policy', () => {
    expect(baseline).toContain('CREATE INDEX "delivery_failure_log_alias_id_idx"');
    expect(baseline).toContain('CREATE INDEX "delivery_failure_log_reason_idx"');
    expect(baseline).toContain('CREATE INDEX "delivery_failure_log_timestamp_idx"');
    expect(baseline).toContain("COMMENT ON TABLE \"delivery_failure_log\" IS 'Metadata-only delivery failure log. Do not store message bodies.'");
  });
});
