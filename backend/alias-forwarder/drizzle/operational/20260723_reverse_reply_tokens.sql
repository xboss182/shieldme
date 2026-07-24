BEGIN;

SELECT pg_advisory_xact_lock(68520260723);

-- MNC-708 Stage 1: reverse-reply tokens. Opaque per-forward token, hashed at
-- rest (SHA-256), bound to {alias_id, original_sender}. Additive + idempotent so
-- it is safe to re-run and safe to deploy dark (INBOUND_REPLY_ENABLED=false).
CREATE TABLE IF NOT EXISTS "reverse_reply_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "alias_id" uuid NOT NULL REFERENCES "aliases"("id") ON DELETE CASCADE,
  "original_sender" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "reverse_reply_tokens_alias_id_idx" ON "reverse_reply_tokens" ("alias_id");
CREATE INDEX IF NOT EXISTS "reverse_reply_tokens_expires_at_idx" ON "reverse_reply_tokens" ("expires_at");

COMMIT;
