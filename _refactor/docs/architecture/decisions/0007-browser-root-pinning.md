# ADR-0007 : Épinglage de la racine PKI côté navigateur (root pinning)

> Numérotée 0007 à la suite de [ADR-0006](./0006-post-quantum-hybrid.md) (post-quantique hybride).
> Correctif d'un défaut de conception réel du vérificateur navigateur, corrigé le 2026-07-27/28.

- **Date** : 2026-07-27
- **Statut** : **Accepté** — implémenté (`packages/shared`, `apps/server`, `apps/client/web`, Docker/compose).
- **Auteur** : CertifyChain (solo dev)
- **Référence** : [`CLAUDE.md`](../../../CLAUDE.md) §1 (« la preuve est autonome ») · [`v2.md`](../../../v2.md)
  §V1-6, §V4-1, §6 (pièges) · [ADR-0004](./0004-selective-disclosure-and-key-custody.md) (preuve autonome) ·
  [ADR-0005](./0005-transparency-log.md) (checkpoints signés par la racine) · [ADR-0006](./0006-post-quantum-hybrid.md)
  (racine post-quantique).

## Contexte

`packages/shared/src/crypto/verify-bundle.ts` (`verifyProofBundle`) et `verify-transparency.ts`
(`verifyTransparency`) valident la chaîne PKI d'un bundle de preuve — mais, avant ce correctif, ils
lisaient la clé publique racine **depuis le bundle lui-même** (`bundle.root.publicKey`, et depuis
V4 `bundle.root.publicKeyPq`). Aucune racine n'était épinglée côté client : zéro occurrence dans
`apps/client/**`, aucune constante dans `packages/shared/src/config/`, aucune variable
`NEXT_PUBLIC_*` dans `.env.example`.

Conséquence concrète sur la page hors ligne `/verifier`
(`apps/client/web/src/components/verify/OfflineVerifier.tsx`) : `verifyProofBundle(parsed)` est
appelé sur un **JSON collé par l'utilisateur**, potentiellement un attaquant. Rien n'empêchait ce
dernier de :
1. générer sa propre paire de clés racine Ed25519 (et ML-DSA-65 pour un bundle v3) ;
2. forger une « école » et un diplôme avec ses propres clés ;
3. signer le tout de façon cohérente **avec ses propres clés** — la chaîne se vérifiait alors
   **contre elle-même**, puisque le vérificateur ne connaissait aucune autre racine.

La page affichait alors « Vérifié ». Le mode hybride « ET » de V4 (ADR-0006) n'y changeait rien : le
faussaire génère simplement deux fausses racines au lieu d'une. C'est exactement ce qui rendait
fausse la promesse « la preuve est autonome » (`CLAUDE.md` §1) et « Vérifiable dans votre navigateur,
sans compte » (`v2.md` §5) : la preuve n'était autonome que si l'observateur faisait déjà confiance
au contenu qu'il vérifiait, ce qui n'a aucun sens pour un mécanisme de confiance.

## Décision

### 1. `trustedRoots` : un paramètre OBLIGATOIRE, jamais optionnel

`verifyProofBundle(bundle, trustedRoots, opts?)` et `verifyTransparency(bundle, trustedRoots, opts?)`
prennent désormais un second argument **requis**, `TrustedRoots`
(`packages/shared/src/crypto/trusted-roots.ts`) :

```ts
export interface TrustedRoots {
  ed25519: readonly string[];   // SPKI PEM — NON vide, sous peine de rejet
  mlDsa65: readonly string[];   // base64 brut — peut être vide si le PQ n'est pas déployé
}
```

Un paramètre **facultatif** aurait silencieusement retombé dans le comportement actuel pour tout
appelant existant et laissé le piège intact ailleurs dans le dépôt — en le rendant obligatoire, le
compilateur TypeScript signale **tous** les sites d'appel (serveur, script de smoke, 3 suites de
tests) ; aucun n'est resté sur l'ancienne signature.

### 2. Une LISTE de racines, pas une seule clé

`ed25519`/`mlDsa65` sont des listes, pas des chaînes uniques : la rotation de la racine PKI est un
chantier prévu (v2.md P2, non implémenté ici). Une liste permet de garder l'ancienne et la nouvelle
racine épinglées simultanément pendant la fenêtre de bascule — testé explicitement (« 2 racines
épinglées, bundle signé par la 2ᵉ ⇒ acceptée », `tests/jest/shared/verify-bundle-root-pinning.spec.ts`).
Une liste **vide** est un **rejet immédiat** (« no trusted CertifyChain root configured »), jamais un
laissez-passer.

### 3. Comparaison sur les octets décodés, jamais la chaîne brute

`isTrustedEd25519Root`/`isTrustedMlDsaRoot` décodent chaque candidat (`pemToRawEd25519` /
`b64ToBytes`) avant de comparer — un même PEM peut varier en en-têtes, espaces, `\r\n` sans que la
clé change. Testé explicitement : la même racine épinglée sous une forme PEM différente (CRLF +
espaces finaux) est acceptée.

### 4. Ordre : le rejet pour racine inconnue précède toute autre vérification cryptographique

Dans les deux fonctions, la vérification de la racine (liste vide → rejet ; racine non épinglée →
rejet) est la **toute première** étape, avant le moindre `verifyEd25519`/`mlDsaVerify`. Le motif de
rejet (`"this proof was not issued by CertifyChain (unknown PKI root)"`) est **distinct** de
`"invalid school signature"`/`"invalid checkpoint signature"` — un recruteur ou un audit ne doit
jamais confondre « cette preuve ne vient pas de CertifyChain » avec « cette signature est corrompue »,
deux diagnostics et deux suites d'action différentes.

### 5. Câblage : serveur (env), navigateur (build-time)

- **Serveur** (`apps/server/src/modules/verify/verify.routes.ts`, `SERVER_TRUSTED_ROOTS`) : construit
  une fois depuis `config/env.ts` (`CERTIFYCHAIN_ROOT_PUBLIC_KEY`, `CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`
  quand `env.pqEnabled`) — jamais depuis le bundle qu'il vient de construire lui-même.
- **Navigateur** (`apps/client/web/src/lib/trusted-roots.ts`, `TRUSTED_ROOTS`) : valeur figée **au
  build** via `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY` / `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`
  (CSV de valeurs base64, même encodage que les variables serveur homonymes — copiées telles quelles
  depuis `.env` par `docker-compose.yml`, jamais re-dérivées). C'est le fait d'être **inlinée à la
  compilation par Next.js** qui en fait une véritable ancre de confiance : une valeur récupérée au
  runtime depuis l'API serait sans valeur, puisque l'API est précisément ce que la page `/verifier`
  cherche à vérifier **hors ligne**, potentiellement sans lui faire confiance.
- `packages/shared` reste 100 % framework-serveur-free : il ne lit **jamais** `process.env` — les
  deux câblages ci-dessus vivent dans leurs couches respectives, jamais dans le module de vérification.

### 6. Dégradation choisie si absente au build : refus explicite, jamais un contournement silencieux

Si `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY` est absente au moment du build d'un front, `TRUSTED_ROOTS.ed25519`
est une liste vide → **toute** vérification échoue avec un motif explicite. Alternative rejetée :
faire échouer le build Docker lui-même (`ARG ... :?required` façon `POSTGRES_PASSWORD`). Choix
justifié par cohérence avec le reste du dépôt : SIRENE/Gemini/ProConnect/Stripe dégradent tous
proprement (fonctionnalité désactivée, jamais un crash du pipeline) quand leur clé est absente ; le
serveur, lui, refuse déjà de démarrer sans `CERTIFYCHAIN_ROOT_PRIVATE_KEY`/`PUBLIC_KEY` (`env.ts`,
fail-fast), donc un déploiement où le serveur tourne mais où les fronts ne sont pas épinglés est déjà
une anomalie de configuration — la rendre visible en page (« vérification impossible ») plutôt qu'en
échec de pipeline garde `next build` disponible pour l'itération locale sans secrets.

### 7. Câblé dans les 3 fronts, consommé par un seul aujourd'hui

Les 3 `Dockerfile` clients (`web`, `wallet`, `admin`) et les 4 `docker-compose*.yml` (racine + 3
composes par app) déclarent tous `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY` /
`NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`, par cohérence de contrat de build-args entre les trois
images. Seul `apps/client/web` (`/verifier`, `/verify/[token]`) lit effectivement cette valeur
aujourd'hui (`src/lib/trusted-roots.ts`) — `wallet`/`admin` ne rendent aucun composant de
vérification cryptographique ; la variable y est un ARG/ENV inutilisé, gardé pour parité et pour
qu'une future UI de vérification dans ces apps hérite du même épinglage sans travail Docker
supplémentaire.

### 8. Conséquence opérationnelle : rotation = rebuild

Une rotation de la racine PKI CertifyChain (chantier P2, non implémenté ici) exige de **reconstruire
les 3 images front**, pas seulement de redéployer/redémarrer les conteneurs — `NEXT_PUBLIC_*` est
figé dans le bundle JS à la compilation, jamais relu au runtime. Documenté dans `.env.example`, à côté
de `CERTIFYCHAIN_ROOT_PUBLIC_KEY`/`CERTIFYCHAIN_ROOT_PQ_PUBLIC_KEY`, là où la cérémonie de rotation
sera lue.

## Conséquences

- Positives : le bundle attaquant décrit en Contexte (racine, école, diplôme entièrement forgés,
  cohérents entre eux) est désormais rejeté avec un motif explicite et distinct — c'est le test
  décisif de `tests/jest/shared/verify-bundle-root-pinning.spec.ts` et
  `apps/server/test/crypto/root-pinning.test.ts`. Aucune régression sur les bundles v2/v3
  légitimes. Une seule implémentation de la vérification (piège n°6 de `v2.md`) : le correctif vit
  entièrement dans `packages/shared`, jamais dupliqué côté serveur.
- Négatives / limites (à dire honnêtement) : la rotation de racine reste un chantier P2 non
  implémenté — cette ADR pose seulement l'interface (liste, pas clé unique) qui la rendra possible
  sans rupture de signature supplémentaire. Un opérateur qui oublie de renseigner
  `NEXT_PUBLIC_CERTIFYCHAIN_ROOT_PUBLIC_KEY` au build d'un front obtient un vérificateur qui refuse
  TOUT (faux négatif visible), pas un message d'erreur au démarrage du conteneur — c'est un choix
  assumé (voir §6), mais ça déplace la détection de l'erreur de configuration vers la première
  vérification réelle plutôt que vers le déploiement lui-même.

## Alternatives considérées

1. **Paramètre optionnel avec valeur par défaut `undefined` → comportement actuel** — rejetée
   explicitement : c'est le bug lui-même déguisé en compatibilité ascendante, et le compilateur ne
   signalerait alors aucun site d'appel oublié.
2. **Racine unique (`string`) plutôt qu'une liste** — rejetée : bloquerait toute rotation future sans
   nouvelle rupture de signature ; le coût d'une liste est nul aujourd'hui (un seul élément partout).
3. **Récupérer la racine depuis l'API au chargement de la page `/verifier`** — rejetée : l'API est
   précisément l'acteur dont`/verifier` doit pouvoir se passer (page qui « fonctionne même hors
   ligne ») ; une racine récupérée au runtime pourrait être servie par un serveur compromis ou usurpé,
   ce qui annule la propriété recherchée.
4. **Échec du build Docker si la variable est absente** — rejetée (voir §6) : cohérence avec la
   dégradation propre déjà en place pour SIRENE/Gemini/ProConnect/Stripe, et le serveur fail-fast déjà
   existant rend cette configuration déjà anormale avant même d'atteindre les fronts.

## ADR liées

- [ADR-0004](./0004-selective-disclosure-and-key-custody.md) — « preuve autonome », vérification
  partagée serveur/navigateur dans `verify-bundle.ts`.
- [ADR-0005](./0005-transparency-log.md) — les checkpoints du journal, également signés par la racine
  et donc également concernés par ce correctif (`verify-transparency.ts`).
- [ADR-0006](./0006-post-quantum-hybrid.md) — la racine post-quantique ML-DSA-65, épinglée selon le
  même mécanisme (`TrustedRoots.mlDsa65`).
