# ADR-0003 : Client RPC typé Hono (`hc<AppType>`) — inférence bout-en-bout serveur → fronts

- **Date** : 2026-07-07
- **Statut** : Accepté (implémenté — amendement A du plan de refonte, remplace le report décidé en `architecture.md` §11.3)
- **Auteur** : CertifyChain (solo dev)

## Contexte

Avant la refonte, chaque front consommait l'API via un client fetch maison + des types du contrat
(`import type` de `@contract/*`). Les **chemins et méthodes HTTP restaient des chaînes littérales**
non vérifiées : renommer une route serveur ne cassait aucune compilation cliente — l'erreur
n'apparaissait qu'à l'exécution (404). L'inspiration (arcadex) obtient l'inférence bout-en-bout
avec Eden Treaty (Elysia). Hono offre l'équivalent natif : `hono/client` (`hc<AppType>()`), à
condition que les routes serveur soient **composées en style chaîné** et que le type de l'app soit
exporté.

## Décision

1. **Serveur** : les 9 modules de routes sont écrits en chaîné
   (`new Hono<AppEnv>().use(...).get(...).post(...)`), `app.ts` compose en chaîne **sans annoter
   son type de retour**, et exporte `export type AppType = ReturnType<typeof createApp>` via
   l'export de package `"./rpc"` (pointe sur la **source** `src/app.ts`).
2. **Fronts** : chaque app construit `hc<AppType>(API_BASE, { fetch: csrfFetch(realm) })`
   (le fetch CSRF/credentials vient de `packages/shared`) et conserve sa façade `endpoints.ts` :
   des wrappers fins dont **les retours sont annotés avec les DTO du contrat**.
3. **Garde-fous** :
   - sonde de type permanente `apps/server/src/rpc.type-test.ts` (`InferRequestType`/
     `InferResponseType` sur des routes connues) — toute route sortie du style chaîné casse le typecheck ;
   - `lib/validator.ts` (wrapper `zValidator` maison) est casté `as typeof honoZValidator` pour
     rester transparent à l'inférence — **ne pas retirer ce cast** ;
   - pas d'annotation `Promise<Response>` sur les handlers (elle effacerait le type de `c.json`) ;
   - version de `hono` alignée entre serveur et fronts (un mismatch ferait diverger les types) ;
   - `hono` n'entre **jamais** dans `packages/shared` (frontière ADR-0002/D4) — chaque app cliente
     déclare `hono` + la devDependency type-only `@certifychain/server`.

Le double filet résultant : le RPC infère **chemins/méthodes/corps** depuis les routes (dérive de
câblage = erreur de compilation côté client), et les annotations DTO des wrappers vérifient la
**forme des réponses** (dérive de contrat = erreur de compilation aussi). Le contrat Zod reste la
validation runtime côté serveur — les deux mécanismes sont complémentaires, pas redondants.

## Conséquences

### Positives
1. Un changement de route, de schéma d'entrée ou de réponse casse la compilation des fronts
   immédiatement (prouvé pendant la refonte : la purge des endpoints morts du wallet a été
   détectée par le typecheck).
2. Les pages n'ont pas changé : les signatures publiques des `endpoints.ts` sont conservées
   (churn quasi nul, seule l'implémentation interne est passée sur `hc`).
3. L'import est **type-only** : aucun runtime serveur dans les bundles clients (vérifié au build).

### Négatives
1. `next build` type-checke le graphe des sources serveur (via `AppType`) → builds un peu plus
   lents, `@types/node` requis côté clients, et les Dockerfiles des fronts doivent copier
   `apps/server` dans le contexte de build.
2. Discipline d'écriture serveur non négociable (style chaîné, pas d'annotations de retour) —
   c'est le prix de l'inférence ; encadré par la sonde de type.
3. L'inférence hc ne couvre pas les corps non-JSON : l'import CSV (multipart) reste un appel
   `csrfFetch` hors-RPC assumé.

## Alternatives considérées

### 1. Statu quo (fetch maison + `import type` du contrat seul)
**Contre** : chemins/méthodes non vérifiés ; c'est la classe d'erreurs qu'on veut éliminer.
**Rejeté** (c'était le report §11.3, annulé par l'amendement A).

### 2. Génération OpenAPI + client généré (openapi-typescript, orval…)
**Contre** : pipeline de génération à maintenir (spec → codegen → drift), artefacts intermédiaires,
alors que Hono fournit l'inférence **sans étape de build**. **Rejeté.**

### 3. Migrer vers Elysia + Eden Treaty
**Contre** : changement de framework interdit (stack verrouillée), gain identique à `hc` natif.
**Rejeté.**

### 4. tRPC
**Contre** : remplacerait le routage REST existant et le contrat Zod partagé par un paradigme
propriétaire ; la surface publique (`/verify`) doit rester du HTTP simple. **Rejeté.**

## Implications sécurité

- Le fetch injecté (`csrfFetch`) garantit `credentials: include` + header CSRF double-submit sur
  toutes les mutations, par réalm (`cc_csrf` / `cc_admin_csrf`) — le RPC ne contourne aucun
  contrôle serveur (cookies httpOnly, rate-limits, zValidator inchangés).
- Export `"./rpc"` = types uniquement dans les faits ; aucune donnée sensible supplémentaire
  n'est exposée aux clients.

## Impact déploiement

- Dockerfiles des 3 fronts : `COPY apps/server` (sources) requis pour le type-check du build —
  déjà intégré (étape 8). Aucun impact runtime.

## Monitoring & observabilité

Sans objet (mécanisme compile-time). Le smoke E2E valide le câblage réel en conditions Docker.

## ADR liées

- ADR-0002 (layout monorepo) — fournit les frontières de packages que ce RPC respecte.

## Références

- `docs/architecture.md` §5 et §11.3 (état avant amendement) ; plan de refonte v2, amendement A.
- Hono docs — RPC / `hono/client` ; `apps/server/src/rpc.type-test.ts` (sonde).
