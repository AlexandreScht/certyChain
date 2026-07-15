-- V2 — Couture Signer (clés hors-base), voir v2.md §V2-1.
-- Deux "kinds" de signature coexistent PAR ÉCOLE : 'envelope' (clé chiffrée en
-- base, comportement historique) et 'kms' (clé chez un KMS/HSM — Vault Transit —,
-- la référence opaque vit dans signer_ref). Aucune migration de données : les
-- écoles existantes restent 'envelope' et leur clé continue d'être lue depuis
-- encrypted_private_key (fallback legacy à la résolution).

ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "signer_kind" text NOT NULL DEFAULT 'envelope';--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "signer_ref" text;--> statement-breakpoint

-- Garde-fou : une école kms DOIT porter la référence de sa clé côté KMS.
DO $$ BEGIN
  ALTER TABLE "schools" ADD CONSTRAINT "schools_kms_needs_ref"
    CHECK ("signer_kind" <> 'kms' OR "signer_ref" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
