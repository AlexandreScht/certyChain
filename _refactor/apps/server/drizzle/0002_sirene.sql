ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "sirene_verified" boolean;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "sirene_legal_name" text;
