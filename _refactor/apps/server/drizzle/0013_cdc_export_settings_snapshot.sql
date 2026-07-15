ALTER TABLE "cdc_exports"
  ADD COLUMN IF NOT EXISTS "emitter_id_client" text,
  ADD COLUMN IF NOT EXISTS "certificateur_id_client" text,
  ADD COLUMN IF NOT EXISTS "contract_id" text;--> statement-breakpoint

UPDATE "cdc_exports" AS "export"
SET
  "emitter_id_client" = "settings"."emitter_id_client",
  "certificateur_id_client" = "settings"."certificateur_id_client",
  "contract_id" = "settings"."contract_id"
FROM "cdc_settings" AS "settings"
WHERE "settings"."school_id" = "export"."school_id"
  AND (
    "export"."emitter_id_client" IS NULL
    OR "export"."certificateur_id_client" IS NULL
    OR "export"."contract_id" IS NULL
  );--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM "cdc_exports"
    WHERE "emitter_id_client" IS NULL
       OR "certificateur_id_client" IS NULL
       OR "contract_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot snapshot incomplete CDC settings for an existing export';
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "cdc_exports"
  ALTER COLUMN "emitter_id_client" SET NOT NULL,
  ALTER COLUMN "certificateur_id_client" SET NOT NULL,
  ALTER COLUMN "contract_id" SET NOT NULL;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "cdc_exports"
    ADD CONSTRAINT "cdc_exports_emitter_id_client_length_check"
    CHECK (char_length("emitter_id_client") = 8);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "cdc_exports"
    ADD CONSTRAINT "cdc_exports_certificateur_id_client_length_check"
    CHECK (char_length("certificateur_id_client") = 8);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "cdc_exports"
    ADD CONSTRAINT "cdc_exports_contract_id_length_check"
    CHECK (char_length("contract_id") BETWEEN 1 AND 20);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
