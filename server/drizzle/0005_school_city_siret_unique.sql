-- School registration hardening:
--   • `city` — the establishment's city, declared at registration and cross-checked
--     against the official SIRENE commune (identifies WHICH school it is).
--   • Unique SIRET — a SIRET identifies exactly one establishment, so two schools
--     may never claim the same one. Partial index (WHERE siret IS NOT NULL) keeps
--     schools without a SIRET allowed. Assumes no existing duplicates (verified).
-- Idempotent, mirrors the hand-written style of 0001–0004.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schools_siret_key" ON "schools" ("siret") WHERE "siret" IS NOT NULL;
