-- Decouples the student's login identity (durable personal email) from the
-- school-issued delivery address (may go stale once the holder leaves the
-- school — it's the school's identifier, not theirs to keep). Issuance now
-- creates an unclaimed student (email null) plus a per-school alias carrying a
-- one-time claim link mailed to the school address at issuance time, when it's
-- most likely still live. Idempotent, mirrors the hand-written style of 0001-0009.
ALTER TABLE "students" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "students_email_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "students_email_idx" ON "students" (lower("email")) WHERE "email" IS NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."otp_purpose" ADD VALUE IF NOT EXISTS 'student_claim';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'student_claim';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_email_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"email" text NOT NULL,
	"claim_token" text,
	"claim_token_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_email_aliases" ADD CONSTRAINT "student_email_aliases_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_email_aliases" ADD CONSTRAINT "student_email_aliases_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_email_aliases_school_email_idx" ON "student_email_aliases" ("school_id",lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_email_aliases_claim_token_idx" ON "student_email_aliases" ("claim_token") WHERE "claim_token" IS NOT NULL;
