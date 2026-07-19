import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(join(process.cwd(), 'drizzle/0005_cold_amazoness.sql'), 'utf8');

describe('BYO SMTP additive migration', () => {
  it('is locked, flag-guarded, and additive to the canonical production baseline', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("current_setting('app.byo_smtp_enabled'");
    expect(migration).toContain('CREATE TABLE "smtp_relay_profiles"');
    expect(migration).toContain('CREATE TABLE "smtp_relay_credentials"');
    expect(migration).toContain('CREATE TABLE "smtp_relay_tests"');
    expect(migration).toContain('CREATE TABLE "domain_signing_keys"');
    expect(migration).not.toMatch(/DROP (TABLE|TYPE|CONSTRAINT)/);
    expect(migration).not.toMatch(/CREATE TABLE "(users|domains|aliases|mail_logs|audit_logs)"/);
  });

  it('enforces scoped alias routing and retains only metadata delivery fields', () => {
    expect(migration).toContain('aliases_smtp_relay_scope_fkey');
    expect(migration).toContain('aliases_outbound_route_check');
    expect(migration).toContain('outbound_route_mode');
    expect(migration).toContain('bounce_token_hash');
    expect(migration).not.toMatch(/body|subject|raw_smtp|password/i);
  });
});
