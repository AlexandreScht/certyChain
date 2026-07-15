-- V1 — Divulgation sélective native (ed25519-sd-v2), voir v2.md §V1-3.
-- Versionnage du moteur de preuve par diplôme + stockage chiffré des disclosures ;
-- choix des champs révélés porté par le lien de partage. Aucune re-signature
-- rétroactive : les diplômes existants restent en 'v1' et vérifient à l'identique.

ALTER TABLE "diplomas"
  ADD COLUMN IF NOT EXISTS "proof_version" text NOT NULL DEFAULT 'v1';--> statement-breakpoint

ALTER TABLE "diplomas"
  ADD COLUMN IF NOT EXISTS "disclosures_encrypted" text;--> statement-breakpoint

-- Garde-fou : un diplôme v2 DOIT porter ses disclosures chiffrées.
DO $$ BEGIN
  ALTER TABLE "diplomas"
    ADD CONSTRAINT "diplomas_v2_needs_disclosures"
    CHECK ("proof_version" <> 'v2' OR "disclosures_encrypted" IS NOT NULL);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- share_links : les champs que l'élève accepte de montrer (défaut = comportement
-- historique de verify.routes.ts, pour ne pas changer les liens existants).
ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "disclosed_fields" text[] NOT NULL
  DEFAULT '{holderName,programTitle,mention,rncp,issuedAt}';
