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
});
