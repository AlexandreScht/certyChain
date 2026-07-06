-- Ownership verification (verify.md): provisional status + per-school control proofs.
-- Idempotent (mirrors the hand-written style of 0001/0002). New enum values are
-- only ADDED here, never used in this same migration (Postgres restriction).
ALTER TYPE "public"."school_status" ADD VALUE IF NOT EXISTS 'provisional' BEFORE 'approved';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'school_provisional';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'verification_method_chosen';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'ownership_verified';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'verification_failed';--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."verification_method" AS ENUM('dns', 'postal', 'proconnect');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."verification_status_v" AS ENUM('pending', 'awaiting_payment', 'code_sent', 'verified', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "domain" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "control_proof_method" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "control_proof_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "proconnect_sub" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "school_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"method" "verification_method" NOT NULL,
	"status" "verification_status_v" DEFAULT 'pending' NOT NULL,
	"dns_token" text,
	"postal_code_hash" text,
	"postal_address_enc" text,
	"postal_street_no" text,
	"postal_postal_code" varchar(5),
	"postal_city" text,
	"stripe_session_id" text,
	"payment_status" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "school_verifications" ADD CONSTRAINT "school_verifications_school_id_schools_id_fk"
    FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "school_verifications_school_idx" ON "school_verifications" USING btree ("school_id");
