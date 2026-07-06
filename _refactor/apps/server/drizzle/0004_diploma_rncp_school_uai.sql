-- RNCP repositioned + UAI added.
--   • RNCP identifies a TITLE (one per program), not an establishment → it moves
--     from the school to the diploma (per-diploma, optional).
--   • UAI / RNE is the official Éducation nationale ESTABLISHMENT id → added at the
--     school level (optional trust signal for AI scoring).
-- Idempotent, mirrors the hand-written style of 0001/0002/0003.
ALTER TABLE "schools" DROP COLUMN IF EXISTS "rncp";--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "uai" text;--> statement-breakpoint
ALTER TABLE "diplomas" ADD COLUMN IF NOT EXISTS "rncp" text;
