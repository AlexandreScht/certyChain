-- Persists the SIRENE-confirmed establishment address (postal code + city only
-- — non-sensitive, already partially disclosed for the postal proof). Lets the
-- "postal" ownership-proof method (verify.md) require a CONFIRMED official
-- address instead of just "SIRET present + INSEE configured".
-- Idempotent, mirrors the hand-written style of 0001–0006.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "sirene_postal_code" varchar(5);--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "sirene_city" text;
