-- EUDI Wallet export — platform ES256 issuer keys, short-lived
-- OpenID4VCI pre-authorized offers, and privacy-minimised credential metadata.
-- Neither the SD-JWT VC nor its disclosures are persisted.

-- Audit enum additions stay separate from any INSERT using the new values:
-- PostgreSQL cannot use an enum value in the transaction that first adds it.
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'vc_offer_created';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'vc_credential_issued';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vc_issuer_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kid" text NOT NULL,
  "alg" text DEFAULT 'ES256' NOT NULL,
  "public_jwk" jsonb NOT NULL,
  "private_key_encrypted" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vc_issuer_keys_alg_check" CHECK ("alg" = 'ES256'),
  CONSTRAINT "vc_issuer_keys_status_check" CHECK ("status" IN ('active', 'retired'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vc_issuer_keys_kid_key"
  ON "vc_issuer_keys" ("kid");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vc_issuer_keys_one_active_idx"
  ON "vc_issuer_keys" ("status") WHERE "status" = 'active';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vc_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "diploma_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "pre_auth_code_hash" text NOT NULL,
  "tx_code_hash" text NOT NULL,
  "tx_attempts" integer DEFAULT 0 NOT NULL,
  -- The public Credential Offer contains a pre-authorized code. Encrypting the
  -- complete object lets the dereference endpoint return it without storing that
  -- bearer secret in plaintext.
  "offer_payload_encrypted" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "credential_issued_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vc_offers_tx_attempts_check" CHECK ("tx_attempts" >= 0)
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vc_offers"
    ADD CONSTRAINT "vc_offers_diploma_id_diplomas_id_fk"
    FOREIGN KEY ("diploma_id") REFERENCES "public"."diplomas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vc_offers"
    ADD CONSTRAINT "vc_offers_student_id_students_id_fk"
    FOREIGN KEY ("student_id") REFERENCES "public"."students"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vc_offers_pre_auth_code_hash_key"
  ON "vc_offers" ("pre_auth_code_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vc_offers_student_id_idx"
  ON "vc_offers" ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vc_offers_expires_at_idx"
  ON "vc_offers" ("expires_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vc_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "diploma_id" uuid NOT NULL,
  "offer_id" uuid NOT NULL,
  "status_list_id" integer DEFAULT 1 NOT NULL,
  "status_list_index" integer NOT NULL,
  "cnf_jkt" text NOT NULL,
  "vct" text NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vc_credentials_status_list_id_check" CHECK ("status_list_id" > 0),
  CONSTRAINT "vc_credentials_status_list_index_check" CHECK ("status_list_index" >= 0)
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vc_credentials"
    ADD CONSTRAINT "vc_credentials_diploma_id_diplomas_id_fk"
    FOREIGN KEY ("diploma_id") REFERENCES "public"."diplomas"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vc_credentials"
    ADD CONSTRAINT "vc_credentials_offer_id_vc_offers_id_fk"
    FOREIGN KEY ("offer_id") REFERENCES "public"."vc_offers"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vc_credentials_offer_id_key"
  ON "vc_credentials" ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vc_credentials_status_list_position_key"
  ON "vc_credentials" ("status_list_id", "status_list_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vc_credentials_diploma_id_idx"
  ON "vc_credentials" ("diploma_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vc_credentials_status_list_id_idx"
  ON "vc_credentials" ("status_list_id");
