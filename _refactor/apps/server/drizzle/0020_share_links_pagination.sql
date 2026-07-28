-- R4 (PLAN.md) — Pagination des liens de partage (`GET /wallet/diplomas/:id/shares`).
-- La liste filtre déjà sur `diploma_id` et trie par `created_at` : sans index composite,
-- un diplôme accumulant beaucoup de liens force un tri complet côté Postgres à chaque page.
--
-- Additive, IF NOT EXISTS — rejouable sans effet de bord.

CREATE INDEX IF NOT EXISTS "share_links_diploma_id_created_at_idx"
  ON "share_links" ("diploma_id", "created_at");
