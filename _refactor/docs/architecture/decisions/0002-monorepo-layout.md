# ADR-0002 : Réorganisation en monorepo `apps/` + `packages/` (élimination de la triplication frontend)

- **Date** : 2026-07-07
- **Statut** : Accepté (implémenté — refonte `_refactor/`, étapes 0–10, voir `PROGRESS.md`)
- **Auteur** : CertifyChain (solo dev)

## Contexte

Le layout historique posait le web public à la racine (`src/`) et les autres services en dossiers
frères (`server/`, `wallet/`, `admin/`), chacun **copiant-collant** le design system (18 composants
`ui/`), le client API (fetch + CSRF), les hooks de session et `globals.css`. La dérive n'était plus
théorique : mesurée en direct le 2026-07-06 (`Badge.tsx`/`Input.tsx`/`globals.css` modifiés ×3
simultanément, rayon de halo déjà divergent 280 px vs 250 px entre les copies — 2ᵉ vague de
synchronisation manuelle en un mois). Le contrat d'API vivait dans `server/src/contract`, atteint
depuis les fronts par un alias de contournement `@contract/*` traversant le filesystem.

Critères : zéro duplication, typage fort de bout en bout, lisibilité de reprise à froid,
**stack verrouillée inchangée** (Hono/Node, JWT+OTP+TOTP, Zod, Drizzle, Docker distroless),
faisable par un solo dev qui vérifie via `docker compose`.

## Décision

Adopter le monorepo pnpm suivant (forme inspirée d'`arcadex/`, stack conservée) :

```
apps/client/{web,wallet,admin}   # 3 fronts Next.js (1 Dockerfile + 1 docker-compose PAR app)
apps/server                      # API Hono (sans src/contract)
packages/contract                # @certifychain/contract — dto, enums, errors, schemas (Zod)
packages/shared                  # @certifychain/shared — ui, styles, hooks, api, lib, config
```

- **Packages internes sans étape de build** : `exports` par sous-chemin vers les sources
  `.ts/.tsx/.css` ; `transpilePackages` dans chaque `next.config.ts` ; `tsup` du serveur bundle
  `contract` nativement (`noExternal`).
- **`packages/shared` = peerDependencies** (react, next, framer-motion, lucide, clsx, tw-merge)
  et **zéro dépendance backend** — le realm (nom du cookie CSRF) est un paramètre d'app.
- **`packages/contract` conservé tel quel** (vocabulaire : DTO, codes d'erreur, schémas Zod
  runtime pour le serveur) ; l'alias `@contract/*` disparaît au profit de la vraie dépendance
  workspace `@certifychain/contract`.
- **Un `docker-compose.yml` par app cliente** (`context: ../../..`, service unique durci,
  `NEXT_PUBLIC_API_URL` surchargeable) pour le déploiement indépendant d'un front ; le compose
  racine (`name: certifychain`) reste la stack complète ; API seule = `docker compose up db server`.
- **Turborepo différé, ESLint conservé** (Biome écarté pour le lint) — décisions tranchées dans
  `docs/architecture.md` §11.1/§11.2, avec déclencheurs concrets de réévaluation.
- Swap effectué le 2026-07-07 : l'ancien arbre racine est supprimé, le monorepo **est** le projet
  (voir `MIGRATION-SWAP.md`).

## Conséquences

### Positives
1. Un seul exemplaire des 18 composants UI, du CSS design-system, du client API et des hooks —
   la classe de dérive observée devient impossible par construction.
2. Frontière type-only web→serveur préservée et renforcée (ADR-0003).
3. Chaque front est déployable seul (compose par app) sans recréer le reste.
4. Reprise à froid : le split `apps/` = déployable / `packages/` = bibliothèque est immédiat.

### Négatives
1. Les builds Next type-checkent aussi le graphe serveur via `AppType` (ADR-0003) — un peu plus lents.
2. Les Dockerfiles copient 7 manifests avant `pnpm install --frozen-lockfile` (verbosité assumée
   pour le cache de layers).
3. Toute nouvelle app cliente doit déclarer `transpilePackages` + l'`@source` Tailwind vers
   `packages/shared` — piège documenté (CLAUDE.md §8).

## Alternatives considérées

### 1. Statu quo (3 copies synchronisées à la main)
**Contre** : dérive active mesurée ; chaque correctif UI = 3 éditions identiques. **Rejeté.**

### 2. Copier le layout arcadex tel quel (`shared/`+`types/` à plat, Turborepo, Biome)
**Contre** : `types/` ambiant-only ne porte pas la validation runtime Zod dont CertifyChain a
besoin ; turbo `dev` est `cache:false` chez arcadex lui-même ; arcadex ne confie pas son lint à
Biome. **Rejeté** — on reprend la *forme* `apps/*`, pas l'outillage.

### 3. Packages avec étape de build (`dist/` + watch)
**Contre** : un watcher de plus par package, complexité de publication sans bénéfice pour un
workspace interne. **Rejeté** (exports de sources brutes).

### 4. Fusionner les 3 fronts en une seule app multi-zones
**Contre** : réalms cookies/CSP différents, surfaces d'exposition différentes (admin en loopback),
cycle de vie de déploiement différent. **Rejeté.**

## Implications sécurité

- Les frontières de réalm (cookies `cc_*` vs `cc_admin_*`, headers par app) sont inchangées ;
  `buildSecurityHeaders(overrides)` centralise les CSP avec overrides par app (admin : noindex,
  no-referrer).
- `packages/shared` ne peut pas fuir de code serveur : aucune dépendance backend déclarée, et le
  seul lien vers le serveur est `import type` (effacé au build).
- Hardening Docker inchangé (distroless non-root, `cap_drop: ALL`, read-only, DB interne).

## Impact déploiement

- Compose racine : seuls les chemins `dockerfile:` changent ; volumes/réseaux re-préfixés par
  `name: certifychain` (l'ancien projet s'appelait `certychain` — nettoyer ses réseaux/volumes,
  cf. `MIGRATION-SWAP.md`).
- Nouveau : déploiement par front via `docker compose -f apps/client/<app>/docker-compose.yml up`.

## Monitoring & observabilité

Inchangés (logs JSON, audit_log). Le smoke E2E (`pnpm smoke`, 44 checks) devient le contrôle de
non-régression post-déploiement de référence.

## ADR liées

- ADR-0001 (ProofEngine Ed25519+nonce) — inchangée par cette réorganisation.
- ADR-0003 (RPC typé Hono) — décidée conjointement, cœur du « typage fort de bout en bout ».

## Références

- `docs/architecture.md` (cible §3, analyse comparative §11–§12, 2026-07-06).
- `PROGRESS.md` (journal d'exécution étapes 0–10, pièges).
- Plan approuvé v2 avec amendements A/B (2026-07-06).
