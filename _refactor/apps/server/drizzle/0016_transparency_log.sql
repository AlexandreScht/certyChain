-- V3 — Journal de transparence (registre public horodaté), voir v2.md §V3.
-- Une feuille append-only par diplôme émis (AUCUNE PII : le journal est public) +
-- des checkpoints (STH) signés par la racine PKI et ancrés via OpenTimestamps.
-- Le leaf_index est attribué DANS la transaction d'émission sous verrou consultatif
-- (contigu, sans trou) — PAS via une séquence (design D1 : rollback ⇒ trous, et
-- l'ordre de commit MVCC pourrait diverger de l'ordre de séquence).

CREATE TABLE IF NOT EXISTS "issuance_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "diploma_id" uuid NOT NULL UNIQUE REFERENCES "diplomas"("id"),
  "leaf_index" bigint NOT NULL UNIQUE CHECK ("leaf_index" >= 0),
  "leaf_hash" text NOT NULL,
  "reported_at" timestamptz,
  "reported_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "log_checkpoints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tree_size" bigint NOT NULL CHECK ("tree_size" >= 0),
  "root_hash" text NOT NULL,
  "signature" text NOT NULL,
  "ots_proof" bytea,
  "ots_upgraded_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Gel d'émission après signalement du journal (v2.md §V3-6) : PAS un 6ᵉ statut,
-- une simple colonne — la vérification des diplômes existants reste intacte.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "issuance_frozen_at" timestamptz;--> statement-breakpoint

-- Nouvelles valeurs d'audit. ⚠️ Piège v2.md §6.10 : ne JAMAIS les UTILISER dans
-- cette même migration (une valeur d'enum ajoutée n'est utilisable qu'après commit).
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'transparency_report';--> statement-breakpoint
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'school_unfrozen';
