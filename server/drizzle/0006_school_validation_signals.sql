-- Concise validation breakdown behind the AI score: an array of
-- { label, status: 'good'|'warn'|'bad' } shown as color chips in the admin.
-- Idempotent, mirrors the hand-written style of 0001–0005.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "validation_signals" jsonb;
