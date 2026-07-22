BEGIN;

SELECT pg_advisory_xact_lock(68520260722);

LOCK TABLE "aliases", "domain_signing_keys" IN SHARE ROW EXCLUSIVE MODE;

DO $$ BEGIN
  CREATE TYPE "transparency_event_type" AS ENUM (
    'alias.created',
    'alias.disabled',
    'alias.enabled',
    'alias.deleted',
    'alias.forward_count_daily',
    'dkim.activated',
    'dkim.retired',
    'provider.changed',
    'migration.snapshot'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "domain_signing_keys" ADD COLUMN IF NOT EXISTS "public_key_sha256" text;
ALTER TABLE "domain_signing_keys" ADD COLUMN IF NOT EXISTS "expected_dns_name" text;
ALTER TABLE "domain_signing_keys" ADD COLUMN IF NOT EXISTS "activated_at" timestamp with time zone;
ALTER TABLE "domain_signing_keys" ADD COLUMN IF NOT EXISTS "retired_at" timestamp with time zone;
ALTER TABLE "domain_signing_keys" ADD COLUMN IF NOT EXISTS "signing_source" text;

CREATE TABLE IF NOT EXISTS "transparency_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sequence" bigint NOT NULL UNIQUE,
  "event_type" "transparency_event_type" NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "public_payload" jsonb NOT NULL,
  "canonical_version" integer NOT NULL DEFAULT 1,
  "leaf_hash" text NOT NULL UNIQUE,
  "idempotency_key" text UNIQUE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "transparency_event_links" (
  "event_id" uuid PRIMARY KEY REFERENCES "transparency_events"("id"),
  "alias_id" uuid REFERENCES "aliases"("id") ON DELETE SET NULL,
  "domain_id" uuid REFERENCES "domains"("id") ON DELETE SET NULL,
  "utc_date" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "transparency_mmr_nodes" (
  "start_sequence" bigint NOT NULL,
  "size" bigint NOT NULL,
  "hash" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("start_sequence", "size")
);

CREATE TABLE IF NOT EXISTS "transparency_heads" (
  "tree_size" bigint PRIMARY KEY,
  "root_hash" text NOT NULL UNIQUE,
  "previous_head_hash" text,
  "key_id" text NOT NULL,
  "signature" text NOT NULL,
  "published_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "alias_verify_capabilities" (
  "alias_id" uuid PRIMARY KEY REFERENCES "aliases"("id") ON DELETE CASCADE,
  "code_hash" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "rotated_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "alias_daily_forward_counts" (
  "alias_id" uuid NOT NULL REFERENCES "aliases"("id") ON DELETE CASCADE,
  "utc_date" text NOT NULL,
  "forwarded_count" integer NOT NULL DEFAULT 0,
  "published_event_id" uuid UNIQUE REFERENCES "transparency_events"("id"),
  "finalized_at" timestamp with time zone,
  PRIMARY KEY ("alias_id", "utc_date")
);

CREATE TABLE IF NOT EXISTS "provider_transparency_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider_id" text NOT NULL,
  "customer_spf_value" text NOT NULL,
  "platform_spf_include" text,
  "dkim_identity_description" text NOT NULL,
  "profile_sha256" text NOT NULL,
  "effective_at" timestamp with time zone NOT NULL DEFAULT now(),
  "retired_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "transparency_events_sequence_idx" ON "transparency_events" ("sequence");
CREATE INDEX IF NOT EXISTS "provider_transparency_profiles_active_idx" ON "provider_transparency_profiles" ("effective_at") WHERE "retired_at" IS NULL;

CREATE OR REPLACE FUNCTION "shieldme_reject_transparency_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Transparency log records are append-only';
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER "transparency_events_immutable"
  BEFORE UPDATE OR DELETE ON "transparency_events"
  FOR EACH ROW EXECUTE FUNCTION "shieldme_reject_transparency_mutation"();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER "transparency_mmr_nodes_immutable"
  BEFORE UPDATE OR DELETE ON "transparency_mmr_nodes"
  FOR EACH ROW EXECUTE FUNCTION "shieldme_reject_transparency_mutation"();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER "transparency_heads_immutable"
  BEFORE UPDATE OR DELETE ON "transparency_heads"
  FOR EACH ROW EXECUTE FUNCTION "shieldme_reject_transparency_mutation"();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
