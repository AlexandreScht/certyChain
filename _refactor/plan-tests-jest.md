# Plan de tests Jest — clients + back (2026-07-10)

> **STATUT : IMPLÉMENTÉ + ÉTENDU (5ᵉ vague, chantier V3)** — `pnpm test:jest` :
> **40 suites, 353 tests, 0 échec** (mis à jour 2026-07-15 ; 326/36 la veille, delta = chantier
> V3 journal de transparence : `shared/merkle-verify.spec.ts` — RFC 6962 inclusion/consistance +
> `verifyTransparency` —, `web/journal-page.spec.tsx` — tableau + gel + signalement —,
> `web/transparency-panel.spec.tsx` — « en attente » vs « confirmé », absence si `transparency`
> nul, note hash-only —, `admin/school-detail-page.spec.tsx` — bouton « Dégeler » conditionnel),
> sans casser l'existant (`pnpm test` node:test = **229/229** — était 181 ; typecheck ×6 = 0).
> Vague précédente (chantier V1, 2026-07-13/14) : `shared/verify-bundle.spec.ts` — l'algo de
> vérification tourne en jsdom, fallback @noble ET chemin WebCrypto —, `web/verify-page.spec.tsx`
> — verdict piloté par le client, état révoqué distinct, download bundle —,
> `wallet/share-fields.spec.tsx` — 7 cases, `holderEmail` décochée par défaut, payload exact.
> 🐛 La 2ᵉ vague a révélé un **bug sécurité réel** dans `login-throttle.ts`
> (après un 1ᵉʳ lockout expiré, le compte ne pouvait plus JAMAIS être re-verrouillé :
> `lockedUntil` restait non nul dans le passé et remettait `fails` à 0 à chaque échec).
> Corrigé à la source + test de régression — voir `PLAN.md` §4.

> Objectif : une suite **Jest** unifiée au niveau du monorepo qui teste le back (unités
> critiques sans DB) **et** les clients (kit partagé + composants web/wallet/admin),
> **sans toucher** à l'existant : les tests `node:test` du serveur (`pnpm test`, 68 à la création
> du plan, **181 actuellement**) et le
> smoke E2E Docker restent la référence d'intégration. Jest ajoute la couche
> composants/DOM que `node:test` ne couvre pas, plus des tests de régression sur les
> correctifs de l'audit 2026-07-10 (`audit.md`).

## 1. Architecture retenue

**Un seul runner à la racine** (`jest.config.cjs`, option `projects`) — 5 projets :

| Projet | Environnement | Cible | Dossier des specs |
|---|---|---|---|
| `server` | node | `apps/server/src` (modules purs, pas de DB) | `tests/jest/server/` |
| `shared` | jsdom | `packages/shared/src` (api client, hooks utils, UI) | `tests/jest/shared/` |
| `web` | jsdom | `apps/client/web/src` (composants sans next/*) | `tests/jest/web/` |
| `wallet` | jsdom | `apps/client/wallet/src` | `tests/jest/wallet/` |
| `admin` | jsdom | `apps/client/admin/src` | `tests/jest/admin/` |

Décisions structurantes :
- **Specs hors des workspaces** (`tests/jest/` à la racine) : les `tsconfig` des apps
  incluent `**/*.tsx` — des specs dans `src/` casseraient `pnpm -r typecheck` (types Jest
  absents des workspaces). À la racine, rien ne les ramasse à part Jest.
- **Nommage `*.spec.ts(x)`** : jamais `*.test.ts`, réservé aux tests `node:test` du serveur.
- **Transform `ts-jest`** en mode transpilation (`diagnostics: false`, tsconfig inline
  `module: commonjs`, `jsx: react-jsx`) : rapide, indépendant des tsconfig `bundler` des
  workspaces. Le typage des specs reste garanti indirectement par les imports des sources
  (déjà typées) — pas de double `tsc`.
- **`moduleNameMapper`** : `@certifychain/contract/*` et `@certifychain/shared/*` mappés
  directement sur les sources (mêmes cibles que les `exports` des packages) ; alias `@/*`
  résolu par des imports **relatifs directs** dans les specs (on importe le fichier ciblé,
  pas les barrels qui tirent `next/navigation`).
- **Résolution react & co** : dépendances de test installées à la **racine** du workspace
  (react, react-dom, framer-motion, lucide-react, clsx, tailwind-merge) pour que les
  sources de `packages/shared` (react en peerDependency) se résolvent depuis les specs.
- **Env serveur** : `tests/jest/setup/server-env.ts` (via `setupFiles`) recharge `.env`
  racine et fournit des valeurs par défaut sûres pour chaque variable exigée par
  `config/env.ts` (fail-fast) — y compris une paire de clés racine Ed25519 générée à la
  volée, pour tester la chaîne de certificats sans dépendre du `.env` local.
- **Polyfills jsdom** : `tests/jest/setup/jsdom-polyfills.ts` (`window.matchMedia` pour
  `useReducedMotion` de framer-motion, `requestAnimationFrame` si absent). `@testing-library/jest-dom`
  importé en tête des specs qui l'utilisent (pas de hook global → zéro couplage de config).
- **Stubs front (2ᵉ vague)** : `tests/jest/setup/stubs/` — `next/link` (ancre nue),
  `gsap` / `gsap/ScrollTrigger` / `@gsap/react` (no-op). Mappés **par projet** web/wallet
  (`frontStubMapper` dans `jest.config.cjs`) : permet de tester des composants clients qui
  importent next/gsap (WaitlistSection, DiplomaCard) sans routeur App ni layout. Les
  projets web/wallet mappent aussi l'alias `@/*` vers leur `src/` (nécessaire pour
  `jest.mock("@/lib/api/endpoints")`).
- **Timers & framer-motion** : l'animation de sortie d'`AnimatePresence` tourne sur les
  VRAIS rAF — les fake timers Jest ne la font pas avancer. Pattern retenu (toast.spec) :
  fake timers pour faire expirer le `setTimeout` d'auto-dismiss, puis `jest.useRealTimers()`
  + `waitFor(...toBeNull())` pour attendre le démontage.

## 2. Dépendances (devDependencies racine, `pnpm add -D -w`)

`jest` · `@types/jest` · `ts-jest` · `jest-environment-jsdom` ·
`@testing-library/react` · `@testing-library/dom` · `@testing-library/jest-dom` ·
`react@19.2.4` · `react-dom@19.2.4` · `framer-motion` · `lucide-react` · `clsx` · `tailwind-merge`

Script racine : `"test:jest": "jest"` (+ `jest --selectProjects server` pour cibler).

## 3. Inventaire des specs

### Back — projet `server` (node)

| Fichier | Ce qui est testé | Pourquoi |
|---|---|---|
| `crypto.spec.ts` | `canonicalize` (ordre de clés, imbrication), `hashDiplomaPayload` (stabilité, sensibilité au moindre champ), sign/verify Ed25519 + altération, certificat école émis/vérifié + payload altéré + mauvaise racine, `keyVault` roundtrip + ciphertext altéré/format invalide, `proofEngine` (preuve valide ; mauvais nonce / secret / signature ⇒ refus) | Cœur de confiance du produit |
| `totp-otp-password.spec.ts` | TOTP généré/vérifié à t, fenêtre ±1 pas, rejet hors fenêtre et mauvais format ; hash/verify OTP ; scrypt hash/verify + mot de passe faux + hash mal formé | Portes d'authentification |
| `tokens.spec.ts` | Access token : roundtrip claims (sub/role/email/schoolId) ; MFA token : realm/purpose ; un token MFA n'est **pas** accepté comme access token (audience) | Séparation des jetons |
| `stripe-webhook.spec.ts` | Signature valide → event parsé ; corps altéré, secret faux, timestamp périmé, header absent, multi-`v1` | Porte de sécurité paiement |
| `gemini-parse.spec.ts` | `parseResult` : JSON valide, invalide, score hors bornes clampé, flags non-string filtrés/limités | Robustesse sortie IA |
| `verification-helpers.spec.ts` | `domainFromEmail`, `dnsRecordValue`, `dnsTxtMatches` (TXT en morceaux), `postalPriceLabel`, `computeMethods` (gating DNS/postal/ProConnect selon l'état de l'école) | Logique d'éligibilité des preuves |
| `net-mask.spec.ts` | `rateLimitIpKey` (IPv4 complet, IPv6 /64), `anonymizeIp` (stable, ≠ IP brute), `maskEmail` (bords) | RGPD + rate-limit |
| `csv-import.spec.ts` | `parseCsv` (**export ajouté pour test**) : en-tête valide, en-tête réordonné ⇒ 422 (**régression S3**), format legacy 6 colonnes, champs quotés/CRLF/échappements | Régression audit S3 |
| `http-error.spec.ts` ² | Table exhaustive `fail.*` → couple status/code (+ test « tout helper est couvert »), messages par défaut/custom, `details` de validation | Contrat d'erreur consommé par `unwrap` des 3 apps |
| `login-throttle.spec.ts` ² | Verrouillage au 5ᵉ échec (durée exacte), expiration, **fenêtre neuve après lockout** (a révélé le bug `lockedUntil`), purge au succès, normalisation casse/espaces | Anti brute-force par compte |
| `cookies.spec.ts` ² | Réalms `cc_*` vs `cc_admin_*` disjoints, refresh scoppé `/auth` vs `/auth/admin`, CSRF jamais HttpOnly, MFA TTL 300 s, clear ⇒ Max-Age=0 (contexte Hono simulé, capture `Set-Cookie`) | Modèle de session à deux réalms |
| `mailer.spec.ts` ² | **Régression W1 serveur** : la notif waitlist part à l'équipe avec l'e-mail prospect ; OTP/claim contiennent code/URL ; échec SMTP **jamais** propagé ; sans SMTP ⇒ drop sans throw (rechargement `env` par `jest.isolateModules`) | Les mails portent l'auth et le claim |
| `signer.spec.ts` ³ | Chantier V2 : `EnvelopeSigner` (comportement identique à l'ancien chemin), `KmsSigner` contre un faux Vault Transit en mémoire (vecteur de non-régression figé vs `signDiplomaHash`, erreurs sans fuite du token), `resolveSchoolSigner` (matrice envelope/kms, fallback legacy `signerRef ?? encryptedPrivateKey`) | Couture `Signer`/KMS — plus aucun PEM privé hors de `signer.ts` |

### Clients — projet `shared` (jsdom)

| Fichier | Ce qui est testé | Pourquoi |
|---|---|---|
| `unwrap.spec.ts` | 2xx → body ; erreur contrat → `ApiClientError` (code/status/message) ; `details.fieldErrors` → premier message de champ ; corps zod brut ; corps vide ; corps non-JSON | Toute erreur affichée aux 3 apps passe par là |
| `csrf-fetch.spec.ts` | Header CSRF sur POST (pas sur GET) ; **régression C1** : 401 ⇒ `POST refreshPath` puis un retry ; single-flight (2 requêtes 401 concurrentes ⇒ 1 seul refresh) ; pas de refresh sur `/login` et `/otp/` ; refresh échoué ⇒ 401 d'origine rendu | Le correctif majeur de l'audit |
| `ui-primitives.spec.tsx` | `Badge` (tones, dot), `Button` (bouton vs ancre, `loading` ⇒ disabled+aria-busy, type par défaut), `Field` (label relié, hint vs erreur, `aria-invalid`, **`aria-required` — régression C2**), `Table` (état vide, lignes, rowKey), `EmptyState` | Kit UI unique des 3 apps |
| `query.spec.ts` | `toQueryRecord` : drop `undefined`/`null`, stringification | Filtres/pagination |
| `modal.spec.tsx` ² | Dialog `aria-modal` nommé/décrit, Échap, clic backdrop (+ `disableBackdropClose`), bouton Fermer / `hideCloseButton`, verrou de scroll body restauré, footer | Utilisée partout (dont confirmation S4+W6) |
| `toast.spec.tsx` ² | `success`→`status` / `error`→`alert`, auto-dismiss (fake timers + waitFor réel), `duration: 0`, fermeture manuelle, `dismiss(id)` ciblé, `useToast` hors provider ⇒ erreur explicite | Canal de feedback des 3 apps |
| `theme.spec.tsx` ² | ThemeToggle/useTheme : défaut clair, bascule `data-theme`+`color-scheme`+localStorage, reprise d'un thème déjà posé, synchro multi-instances via `themechange` | Thème global |
| `ui-primitives-2.spec.tsx` ² | `Input` (invalid/aria-invalid ⇒ anneau, leftIcon ⇒ pl-10, pas de wrapper superflu), `Select` (options, placeholder désactivé, natif+chevron), `Textarea` (rows), `Spinner` (status+sr-only), `Skeleton`(+Text) (aria-hidden, px, 60 %), `Stat`, `Card`/`GlassPanel` (alias strict, glass/strong, padding, halo, glow `--mx/--my`), `PageHeader` (h1+grad-text/cool, eyebrow, actions) | Reste du kit UI |
| `security-headers.spec.ts` ² | CSP (connect-src borné à l'API, `unsafe-eval` dev-only et script-src-only), nosniff/DENY, HSTS preload, Permissions-Policy, Referrer-Policy par surface, `X-Robots-Tag` noindex des surfaces privées | En-têtes des 3 `next.config.ts` |
| `cn.spec.ts` ² | Conflit tailwind ⇒ dernier gagnant (surcharge des défauts du kit), falsy filtrés, syntaxe clsx, familles fusionnées | Composition de classes de tout le kit |

### Clients — projet `web` (jsdom)

| Fichier | Ce qui est testé |
|---|---|
| `failed-card.spec.tsx` | `FailedCard` : copy exacte des 4 états non-vérifiés, `role="alert"`, bouton Réessayer câblé |
| `status-badge.spec.tsx` | `SchoolStatusBadge` / `DiplomaStatusBadge` : libellé français par statut (dont `provisional`) |
| `footer.spec.tsx` ² | **Régression W4** : année © dynamique, zéro `href="#"`, pages non publiées grisées « Bientôt disponible », ancres réelles cliquables, réseaux sociaux non cliquables |
| `waitlist-section.spec.tsx` ² | **Régression W1 client** : submit ⇒ `joinWaitlist({email trim})` puis confirmation ; la promesse « sous 24h » n'apparaît JAMAIS avant la réponse (bouton « Envoi… » disabled) ; `ApiClientError` ⇒ `role=alert` + retry possible ; erreur inattendue ⇒ message générique ; e-mail vide ⇒ aucun appel |
| `accrochage-page.spec.tsx` | Les 4 blocs CDC, état désactivé sans appels sensibles, badge d’identité manquante, NIR masqué/révélable, import CSV, panne distincte avec retry, détail CRT (items/code/raison) et révocation différée des object URLs |

### Clients — projet `wallet` (jsdom)

| Fichier | Ce qui est testé |
|---|---|
| `format.spec.ts` | `formatDate`/`formatYear` (ISO valide, invalide, null), `diplomaStatusMeta` (labels/tones) |
| `diploma-card.spec.tsx` ² | **Régression WA1** : `DiplomaCard` (« signé Ed25519 », jamais Groth16/ZKP, lien `/id` accessible, école/programme/promo/mention/statut) + `DiplomaDetailCard` (« Preuve cryptographique · nonce unique », « Signature valide » actif-only, avertissement révoqué, tuile RNCP conditionnelle) |
| `eudi-export.spec.tsx` | Export EUDI server-driven : bouton absent si indisponible, offre OpenID4VCI en modale (QR, `tx_code`, expiration), copie, erreur accessible et régénération |

### Clients — projet `admin` (jsdom)

| Fichier | Ce qui est testé |
|---|---|
| `audit-labels.spec.ts` | **Régression A2** : chaque valeur de l'enum `audit_type` (liste miroir du serveur) a un libellé français |
| `score-gauge.spec.tsx` | `ScoreGauge` : score affiché, `null` → « — », clamp 0–100 |

> ² = 2ᵉ vague (2026-07-10, même session que le correctif login-throttle). ³ = 4ᵉ vague
> (2026-07-14, chantier V2 couture `Signer`/KMS). Restent
> volontairement hors périmètre Jest : S5 (extraction `current_period_end` inline dans
> `handleSubscriptionUpdated`, couplée DB → smoke), W2 (compteurs GSAP reduced-motion,
> nécessiterait le vrai gsap en jsdom), pages App Router (§4).

## 4. Hors périmètre (assumé)

- Pages App Router complètes (providers next/navigation, GSAP) → couvertes par le smoke E2E.
- Routes serveur avec DB (drizzle/postgres) → pattern `app.request()` en `node:test` (P10
  du PLAN) + smoke ; Jest reste sans réseau/DB pour tourner partout en < 30 s.
- Snapshots : évités (fragiles avec le design system) — assertions sémantiques uniquement.

## 5. Exécution

```bash
corepack pnpm@9.12.0 add -D -w …   # §2 (une fois)
corepack pnpm@9.12.0 test:jest                 # toute la suite
corepack pnpm@9.12.0 test:jest -- --selectProjects server
corepack pnpm@9.12.0 --filter @certifychain/server test  # 181 tests node:test serveur
```
