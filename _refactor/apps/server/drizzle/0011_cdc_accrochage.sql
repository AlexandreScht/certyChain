-- Accrochage CDC (Passeport de compétences) — configuration certificateur,
-- identités minimisées, lots XML et retours de traitement. Le modèle suit le
-- XSD CDC 2026 v1.1.5 : le NIR complet reste chiffré au repos mais seule sa
-- partie 13 caractères sera émise, avec le nom de naissance.
DO $$ BEGIN
  CREATE TYPE "public"."cdc_export_status" AS ENUM(
    'generated',
    'submitted',
    'accepted',
    'partially_rejected',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."cdc_item_status" AS ENUM('pending', 'accepted', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."cdc_identity_source" AS ENUM('csv', 'form');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."cdc_obtention_method" AS ENUM('PAR_ADMISSION', 'PAR_SCORING');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Audit enum additions are deliberately isolated from any INSERT using the
-- new values: PostgreSQL does not allow a freshly-added enum value to be used
-- in the same transaction.
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_export_generated';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_export_submitted';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_crt_ingested';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_identity_purged';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_module_toggled';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_settings_updated';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_identity_upserted';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_identity_deleted';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'cdc_export_downloaded';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cdc_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "certificateur_siret" text NOT NULL,
  "contact_email" text,
  "emitter_id_client" text,
  "certificateur_id_client" text,
  "contract_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cdc_settings_certificateur_siret_format" CHECK (
    "certificateur_siret" ~ '^[0-9]{14}$'
  ),
  CONSTRAINT "cdc_settings_emitter_id_client_length" CHECK (
    "emitter_id_client" IS NULL OR char_length("emitter_id_client") = 8
  ),
  CONSTRAINT "cdc_settings_certificateur_id_client_length" CHECK (
    "certificateur_id_client" IS NULL OR char_length("certificateur_id_client") = 8
  ),
  CONSTRAINT "cdc_settings_contract_id_length" CHECK (
    "contract_id" IS NULL OR char_length("contract_id") BETWEEN 1 AND 20
  )
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cdc_settings"
    ADD CONSTRAINT "cdc_settings_school_id_schools_id_fk"
    FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cdc_settings_school_id_key"
  ON "cdc_settings" ("school_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cdc_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "diploma_id" uuid NOT NULL,
  "school_id" uuid NOT NULL,
  "nir_encrypted" text,
  "birth_last_name" text,
  "obtention_method" "cdc_obtention_method" NOT NULL,
  "source" "cdc_identity_source" NOT NULL,
  "purge_after" timestamp with time zone,
  "purged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cdc_identities"
    ADD CONSTRAINT "cdc_identities_diploma_id_diplomas_id_fk"
    FOREIGN KEY ("diploma_id") REFERENCES "public"."diplomas"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cdc_identities"
    ADD CONSTRAINT "cdc_identities_school_id_schools_id_fk"
    FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cdc_identities_diploma_id_key"
  ON "cdc_identities" ("diploma_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cdc_identities_school_id_idx"
  ON "cdc_identities" ("school_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cdc_identities_purge_after_idx"
  ON "cdc_identities" ("purge_after")
  WHERE "purge_after" IS NOT NULL AND "purged_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cdc_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "status" "cdc_export_status" DEFAULT 'generated' NOT NULL,
  "file_name" text NOT NULL,
  "file_sha256" text NOT NULL,
  "generated_at" timestamp with time zone NOT NULL,
  "submitted_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cdc_exports"
    ADD CONSTRAINT "cdc_exports_school_id_schools_id_fk"
    FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cdc_exports_one_generated_per_school_idx"
  ON "cdc_exports" ("school_id") WHERE "status" = 'generated';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cdc_exports_school_created_at_idx"
  ON "cdc_exports" ("school_id", "created_at" DESC);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cdc_export_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "export_id" uuid NOT NULL,
  "diploma_id" uuid NOT NULL,
  "status" "cdc_item_status" DEFAULT 'pending' NOT NULL,
  "reject_code" text,
  "reject_reason" text
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cdc_export_items"
    ADD CONSTRAINT "cdc_export_items_export_id_cdc_exports_id_fk"
    FOREIGN KEY ("export_id") REFERENCES "public"."cdc_exports"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cdc_export_items"
    ADD CONSTRAINT "cdc_export_items_diploma_id_diplomas_id_fk"
    FOREIGN KEY ("diploma_id") REFERENCES "public"."diplomas"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cdc_export_items_export_diploma_key"
  ON "cdc_export_items" ("export_id", "diploma_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cdc_export_items_live_diploma_key"
  ON "cdc_export_items" ("diploma_id") WHERE "status" <> 'rejected';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cdc_export_items_export_id_idx"
  ON "cdc_export_items" ("export_id");
