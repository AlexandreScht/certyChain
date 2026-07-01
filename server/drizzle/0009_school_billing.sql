-- Subscription billing (cahier des charges §5.1): Starter/Pro (Stripe Checkout,
-- self-serve) + Enterprise (contact-sales, custom pricing/SLA — no self-serve
-- price). Mirrors Stripe's own subscription status verbatim rather than
-- re-modeling it, so it never drifts from what Stripe reports.
-- Idempotent, mirrors the hand-written style of 0001–0008.
DO $$ BEGIN
  CREATE TYPE "public"."school_plan" AS ENUM('starter', 'pro', 'enterprise');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'subscription_started';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'subscription_updated';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'subscription_canceled';--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "plan" "school_plan";--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "subscription_status" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "subscription_current_period_end" timestamp with time zone;
