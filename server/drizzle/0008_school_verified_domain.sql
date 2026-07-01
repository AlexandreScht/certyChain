-- Official domain CONFIRMED by a live web-search-grounded AI check (not a mere
-- email-domain guess) — gates the "dns" ownership-proof method (verify.md) on
-- genuine certainty instead of "a domain is deducible from the contact email".
-- Idempotent, mirrors the hand-written style of 0001–0007.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "verified_official_domain" text;
