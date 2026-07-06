CREATE TYPE "public"."audit_type" AS ENUM('school_registered', 'school_approved', 'school_login', 'student_login', 'issuance', 'revocation', 'share_created', 'verification');--> statement-breakpoint
CREATE TYPE "public"."diploma_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('student_login');--> statement-breakpoint
CREATE TYPE "public"."school_status" AS ENUM('pending', 'approved', 'rejected', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."subject_type" AS ENUM('school_admin', 'student');--> statement-breakpoint
CREATE TYPE "public"."verification_result" AS ENUM('verified', 'not_found', 'revoked', 'expired', 'invalid');--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"siret" varchar(14),
	"rncp" text,
	"accreditation" text,
	"contact_email" text,
	"status" "school_status" DEFAULT 'pending' NOT NULL,
	"public_key" text,
	"encrypted_private_key" text,
	"certificate" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "school_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "school_admins_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diplomas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid,
	"holder_name" text NOT NULL,
	"holder_email" text NOT NULL,
	"program_title" text NOT NULL,
	"mention" text,
	"issued_at" date NOT NULL,
	"external_id" text,
	"payload_hash" text NOT NULL,
	"signature" text NOT NULL,
	"encrypted_holder_secret" text NOT NULL,
	"status" "diploma_status" DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diplomas_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "diplomas_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diploma_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_by_student_id" uuid,
	"expires_at" timestamp with time zone,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token"),
	CONSTRAINT "share_links_diploma_id_diplomas_id_fk" FOREIGN KEY ("diploma_id") REFERENCES "public"."diplomas"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "share_links_created_by_student_id_students_id_fk" FOREIGN KEY ("created_by_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "verification_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_token" text NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_nonces_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" "otp_purpose" DEFAULT 'student_login' NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "audit_type" NOT NULL,
	"result" "verification_result",
	"school_id" uuid,
	"diploma_id" uuid,
	"anonymized_subject" text,
	"ip_hash" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "school_admins_email_idx" ON "school_admins" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "students_email_idx" ON "students" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "diplomas_school_id_idx" ON "diplomas" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "diplomas_student_id_idx" ON "diplomas" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "share_links_diploma_id_idx" ON "share_links" USING btree ("diploma_id");--> statement-breakpoint
CREATE INDEX "verification_nonces_share_token_idx" ON "verification_nonces" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "otp_codes_email_idx" ON "otp_codes" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "audit_log_school_id_idx" ON "audit_log" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
