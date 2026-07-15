CREATE SCHEMA "drizzle";--> statement-breakpoint
CREATE TABLE "drizzle"."__drizzle_migrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"created_at" bigint
);--> statement-breakpoint
CREATE TYPE "public"."account_plan" AS ENUM('free', 'basic', 'pro', 'business');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('admin', 'system', 'user');--> statement-breakpoint
CREATE TYPE "public"."alias_status" AS ENUM('active', 'disabled', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."delivery_failure_reason" AS ENUM('bounce', 'complaint', 'failed');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending', 'verified', 'failed');--> statement-breakpoint
CREATE TYPE "public"."mail_log_status" AS ENUM('queued', 'delivered', 'failed', 'rejected', 'bounced', 'complained');--> statement-breakpoint
CREATE TYPE "public"."pgp_mode" AS ENUM('none', 'optional', 'required');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('pending', 'verified');--> statement-breakpoint
CREATE TYPE "public"."reserved_local_part_action" AS ENUM('reserve', 'allow');--> statement-breakpoint
CREATE TYPE "public"."suppression_reason" AS ENUM('bounce', 'complaint', 'manual');--> statement-breakpoint
CREATE TYPE "public"."tti_check_status" AS ENUM('pending', 'forwarded', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"local_part" text NOT NULL,
	"status" "alias_status" DEFAULT 'active' NOT NULL,
	"pgp_mode" "pgp_mode" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aliases_local_part_domain_id_unique" UNIQUE("local_part","domain_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_failure_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_id" uuid,
	"alias_address" text NOT NULL,
	"recipient" text NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"reason" "delivery_failure_reason" NOT NULL,
	"failure_detail" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"verification_token" text NOT NULL,
	"status" "domain_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"dkim_selector" text NOT NULL,
	"dkim_public_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "mail_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_id" uuid,
	"envelope_from" text NOT NULL,
	"envelope_to" text NOT NULL,
	"forwarded_to" text,
	"external_message_id" text,
	"resend_message_id" text,
	"outbound_provider" text,
	"failure_type" text,
	"failure_reason" text,
	"tracking_protection" jsonb,
	"pgp_mode_used" "pgp_mode" DEFAULT 'none' NOT NULL,
	"pgp_encrypted" boolean DEFAULT false NOT NULL,
	"status" "mail_log_status" DEFAULT 'queued' NOT NULL,
	"rejection_reason" text,
	"size_bytes" integer,
	"auth_results" jsonb,
	"auth_failure_count" integer DEFAULT 0 NOT NULL,
	"spam_scan" jsonb,
	"spam_score" integer DEFAULT 0 NOT NULL,
	"spam_category" text,
	"spam_action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pgp_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"public_key_armored" text NOT NULL,
	"fingerprint" text NOT NULL,
	"algorithm" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pgp_keys_recipient_id_key" UNIQUE("recipient_id"),
	CONSTRAINT "pgp_keys_fingerprint_key" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"email" text NOT NULL,
	"verification_token_hash" text,
	"verification_token_expires_at" timestamp with time zone,
	"status" "recipient_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserved_local_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_part" text NOT NULL,
	"domain_id" uuid,
	"action" "reserved_local_part_action" DEFAULT 'reserve' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sender_blocklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_id" uuid NOT NULL,
	"sender_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sender_blocklists_alias_sender_unique" UNIQUE("alias_id","sender_email")
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppression_list_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "tti_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"probe_token" text NOT NULL,
	"alias_address" text NOT NULL,
	"provider" text,
	"synthetic_inbox" text,
	"external_message_id" text,
	"provider_message_id" text,
	"status" "tti_check_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone,
	"latency_ms" bigint,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tti_checks_probe_token_unique" UNIQUE("probe_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"plan" "account_plan" DEFAULT 'free' NOT NULL,
	"refresh_token_hash" text,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_failure_log" ADD CONSTRAINT "delivery_failure_log_alias_id_fkey" FOREIGN KEY ("alias_id") REFERENCES "public"."aliases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_logs" ADD CONSTRAINT "mail_logs_alias_id_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."aliases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD CONSTRAINT "pgp_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pgp_keys" ADD CONSTRAINT "pgp_keys_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserved_local_parts" ADD CONSTRAINT "reserved_local_parts_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_blocklists" ADD CONSTRAINT "sender_blocklists_alias_id_fkey" FOREIGN KEY ("alias_id") REFERENCES "public"."aliases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_failure_log_alias_id_idx" ON "delivery_failure_log" USING btree ("alias_id");--> statement-breakpoint
CREATE INDEX "delivery_failure_log_reason_idx" ON "delivery_failure_log" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "delivery_failure_log_timestamp_idx" ON "delivery_failure_log" USING btree ("timestamp");--> statement-breakpoint
COMMENT ON TABLE "delivery_failure_log" IS 'Metadata-only delivery failure log. Do not store message bodies.';--> statement-breakpoint
CREATE UNIQUE INDEX "reserved_local_parts_global_unique" ON "reserved_local_parts" USING btree ("local_part") WHERE "reserved_local_parts"."domain_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reserved_local_parts_domain_unique" ON "reserved_local_parts" USING btree ("local_part","domain_id") WHERE "reserved_local_parts"."domain_id" is not null;