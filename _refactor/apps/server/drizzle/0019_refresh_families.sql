-- P3 (PLAN.md) — Rotation refresh PAR FAMILLE : détection de vol de session.
-- Chaque session de refresh appartient à une "famille" (par convention : l'id
-- de la session racine, celle créée au login). À chaque rotation, la session
-- consommée est révoquée et `replaced_by_id` pointe vers la nouvelle session,
-- qui hérite du même `family_id`. Si un token déjà tourné (donc révoqué ET
-- portant un `replaced_by_id`) est présenté à nouveau, c'est le signal fort
-- d'un cookie de refresh volé/rejoué : le code applicatif (auth.routes.ts)
-- révoque alors TOUTE la famille et journalise un événement d'audit durable.
--
-- Additive, IF NOT EXISTS partout — rejouable sans effet de bord.

ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "family_id" uuid;--> statement-breakpoint

-- Auto-référence : la session qui a remplacé celle-ci lors de sa rotation.
-- NULL tant que la session n'a jamais été tournée (ou si elle a simplement été
-- révoquée sans rotation — logout, changement de statut école : ce n'est PAS
-- un signal de vol, seul `revoked_at` + `replaced_by_id` NON NUL l'est).
ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "replaced_by_id" uuid
  REFERENCES "refresh_sessions"("id");--> statement-breakpoint

-- Backfill : les sessions existantes (créées avant cette migration) démarrent
-- chacune sa propre famille — comportement identique à avant (aucune n'a
-- encore été tournée sous le nouveau schéma, donc aucune ne peut déclencher de
-- faux positif de vol).
UPDATE "refresh_sessions" SET "family_id" = "id" WHERE "family_id" IS NULL;--> statement-breakpoint

ALTER TABLE "refresh_sessions" ALTER COLUMN "family_id" SET NOT NULL;--> statement-breakpoint

-- La révocation de famille met à jour toutes les lignes actives d'un family_id
-- d'un coup — indexer pour que ça reste rapide même sur une famille longue.
CREATE INDEX IF NOT EXISTS "refresh_sessions_family_id_idx" ON "refresh_sessions" ("family_id");--> statement-breakpoint

-- Nouvel événement d'audit durable pour la détection de vol de session.
-- ⚠️ Piège v2.md §6.10 : ne JAMAIS utiliser cette valeur dans CETTE migration
-- (un ALTER TYPE ... ADD VALUE n'est visible qu'après le commit de la
-- transaction qui l'ajoute) — seul le code applicatif, après migration,
-- l'utilise (auth.routes.ts).
ALTER TYPE "public"."audit_type" ADD VALUE IF NOT EXISTS 'refresh_reuse_detected';
