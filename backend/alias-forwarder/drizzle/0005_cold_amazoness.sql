BEGIN;

SELECT pg_advisory_xact_lock(62720260719);

DO $$
BEGIN
  IF coalesce(current_setting('app.byo_smtp_enabled', true), 'false') = 'true' THEN
    RAISE EXCEPTION 'BYO SMTP must be disabled while the additive migration runs';
  END IF;
END $$;

LOCK TABLE "aliases", "domains", "mail_logs" IN SHARE ROW EXCLUSIVE MODE;

DO $$ BEGIN
  CREATE TYPE "outbound_route_mode" AS ENUM ('platform', 'custom_smtp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "smtp_relay_status" AS ENUM ('draft', 'credentials_unverified', 'testing_dns', 'testing_tls', 'testing_auth', 'test_submitted', 'awaiting_recipient_confirmation', 'ready', 'active', 'degraded', 'circuit_open', 'disabled', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "smtp_circuit_status" AS ENUM ('closed', 'open', 'half_open');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "smtp_test_phase" AS ENUM ('dns', 'tls', 'auth', 'submitted', 'confirmed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "domain_signing_key_status" AS ENUM ('pending', 'verified', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "domains" ADD CONSTRAINT "domains_id_owner_id_unique" UNIQUE ("id", "owner_id");

CREATE TABLE "smtp_relay_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "domain_id" uuid NOT NULL,
  "label" text NOT NULL,
  "host" text NOT NULL,
  "port" integer NOT NULL,
  "tls_mode" text NOT NULL,
  "auth_method" text NOT NULL,
  "identity_local_part" text NOT NULL,
  "bounce_spf_include" text NOT NULL,
  "status" "smtp_relay_status" NOT NULL DEFAULT 'credentials_unverified',
  "circuit_status" "smtp_circuit_status" NOT NULL DEFAULT 'closed',
  "circuit_failure_count" integer NOT NULL DEFAULT 0,
  "circuit_opened_at" timestamp with time zone,
  "circuit_until" timestamp with time zone,
  "last_outcome_code" text,
  "last_tested_at" timestamp with time zone,
  "active_credential_version" integer,
  "pending_credential_version" integer NOT NULL DEFAULT 1,
  "is_suspended" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "smtp_relay_profiles_owner_domain_unique" UNIQUE ("owner_id", "domain_id"),
  CONSTRAINT "smtp_relay_profiles_id_owner_domain_unique" UNIQUE ("id", "owner_id", "domain_id"),
  CONSTRAINT "smtp_relay_profiles_port_tls_check" CHECK (("port" = 465 AND "tls_mode" = 'implicit_tls') OR ("port" = 587 AND "tls_mode" = 'starttls')),
  CONSTRAINT "smtp_relay_profiles_auth_check" CHECK ("auth_method" IN ('plain', 'login')),
  CONSTRAINT "smtp_relay_profiles_domain_owner_fkey" FOREIGN KEY ("domain_id", "owner_id") REFERENCES "domains"("id", "owner_id") ON DELETE CASCADE
);

CREATE TABLE "smtp_relay_credentials" (
  "relay_id" uuid NOT NULL REFERENCES "smtp_relay_profiles"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "tag" text NOT NULL,
  "wrapped_dek" text NOT NULL,
  "kek_key_id" text NOT NULL,
  "envelope_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  PRIMARY KEY ("relay_id", "version")
);

CREATE TABLE "smtp_relay_tests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "relay_id" uuid NOT NULL REFERENCES "smtp_relay_profiles"("id") ON DELETE CASCADE,
  "recipient_id" uuid NOT NULL REFERENCES "recipients"("id") ON DELETE CASCADE,
  "credential_version" integer NOT NULL,
  "token_hash" text NOT NULL,
  "token_expires_at" timestamp with time zone NOT NULL,
  "phase" "smtp_test_phase" NOT NULL,
  "outcome_code" text NOT NULL,
  "submitted_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "domain_signing_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "domain_id" uuid NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "selector" text NOT NULL,
  "public_key" text NOT NULL,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "tag" text NOT NULL,
  "wrapped_dek" text NOT NULL,
  "kek_key_id" text NOT NULL,
  "envelope_version" integer NOT NULL DEFAULT 1,
  "status" "domain_signing_key_status" NOT NULL DEFAULT 'pending',
  "verified_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "domain_signing_keys_domain_selector_unique" UNIQUE ("domain_id", "selector")
);

ALTER TABLE "aliases" ADD COLUMN "outbound_mode" "outbound_route_mode" NOT NULL DEFAULT 'platform';
ALTER TABLE "aliases" ADD COLUMN "smtp_relay_id" uuid;
ALTER TABLE "mail_logs" ADD COLUMN "outbound_route_mode" "outbound_route_mode" NOT NULL DEFAULT 'platform';
ALTER TABLE "mail_logs" ADD COLUMN "smtp_relay_id" uuid;
ALTER TABLE "mail_logs" ADD COLUMN "provider_message_id" text;
ALTER TABLE "mail_logs" ADD COLUMN "smtp_response_class" text;
ALTER TABLE "mail_logs" ADD COLUMN "attempt_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "mail_logs" ADD COLUMN "next_attempt_at" timestamp with time zone;
ALTER TABLE "mail_logs" ADD COLUMN "bounce_token_hash" text;
ALTER TABLE "mail_logs" ADD COLUMN "bounce_expires_at" timestamp with time zone;

UPDATE "aliases" SET "outbound_mode" = 'platform', "smtp_relay_id" = NULL
WHERE "outbound_mode" IS DISTINCT FROM 'platform' OR "smtp_relay_id" IS NOT NULL;

ALTER TABLE "aliases" ADD CONSTRAINT "aliases_smtp_relay_scope_fkey"
  FOREIGN KEY ("smtp_relay_id", "owner_id", "domain_id")
  REFERENCES "smtp_relay_profiles"("id", "owner_id", "domain_id") ON DELETE RESTRICT NOT VALID;
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_outbound_route_check"
  CHECK (("outbound_mode" = 'platform' AND "smtp_relay_id" IS NULL) OR ("outbound_mode" = 'custom_smtp' AND "smtp_relay_id" IS NOT NULL)) NOT VALID;
ALTER TABLE "mail_logs" ADD CONSTRAINT "mail_logs_smtp_relay_id_fkey"
  FOREIGN KEY ("smtp_relay_id") REFERENCES "smtp_relay_profiles"("id") ON DELETE SET NULL NOT VALID;

ALTER TABLE "aliases" VALIDATE CONSTRAINT "aliases_smtp_relay_scope_fkey";
ALTER TABLE "aliases" VALIDATE CONSTRAINT "aliases_outbound_route_check";
ALTER TABLE "mail_logs" VALIDATE CONSTRAINT "mail_logs_smtp_relay_id_fkey";

CREATE INDEX "smtp_relay_tests_owner_created_idx" ON "smtp_relay_tests" ("owner_id", "created_at");
CREATE INDEX "mail_logs_smtp_relay_id_idx" ON "mail_logs" ("smtp_relay_id") WHERE "smtp_relay_id" IS NOT NULL;
CREATE UNIQUE INDEX "mail_logs_bounce_token_hash_unique" ON "mail_logs" ("bounce_token_hash") WHERE "bounce_token_hash" IS NOT NULL;

COMMIT;
