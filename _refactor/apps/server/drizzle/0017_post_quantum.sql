-- V4 — Post-quantique hybride (Ed25519 + ML-DSA-65 / FIPS 204), voir v2.md §V4.
-- Portée obligatoire (v2.md §V4-1) : diplômes ET certificats d'école ET
-- checkpoints du journal — une chaîne ne vaut pas plus que son maillon
-- classique. Mode "ET" : les deux signatures doivent vérifier, jamais "OU".
-- Additive uniquement, ZÉRO migration de données : les diplômes existants
-- restent 'v1'/'v2' et se vérifient comme avant, à vie. 'v3' = 'v2' + PQ.

ALTER TABLE "diplomas" ADD COLUMN IF NOT EXISTS "signature_pq" text;--> statement-breakpoint

ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "public_key_pq" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "signer_ref_pq" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "certificate_pq" text;--> statement-breakpoint

ALTER TABLE "log_checkpoints" ADD COLUMN IF NOT EXISTS "signature_pq" text;--> statement-breakpoint

-- Garde-fous : un diplôme 'v3' (= v2 + PQ) DOIT porter ses disclosures ET sa
-- signature PQ. Ajoutés en PLUS de "diplomas_v2_needs_disclosures" existante
-- (qui ne couvre que 'v2') plutôt que de la modifier — additif, zéro risque
-- sur la contrainte déjà en production.
DO $$ BEGIN
  ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_v3_needs_disclosures"
    CHECK ("proof_version" <> 'v3' OR "disclosures_encrypted" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "diplomas" ADD CONSTRAINT "diplomas_v3_needs_signature_pq"
    CHECK ("proof_version" <> 'v3' OR "signature_pq" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null;
END $$;
