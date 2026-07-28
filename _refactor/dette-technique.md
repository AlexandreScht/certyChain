# dette-technique.md — Limites connues et dettes consignées

> Ce fichier liste ce qui se règle **en écrivant du code**, mais qui a été délibérément laissé de
> côté — avec la raison. Ce ne sont **pas** des régressions : rien ici ne casse aujourd'hui.
> Les actions hors-code (provisionnement, souscription, réseau) sont dans
> [`infra.md`](./infra.md) ; le reste du travail à mener est dans
> [`reste-a-faire.md`](./reste-a-faire.md).
>
> Règle de lecture : chaque entrée dit **ce que c'est**, **ce que ça coûte aujourd'hui**, et
> **quand ça devient bloquant**. Une dette sans déclencheur identifié n'a rien à faire ici.

---

## 1. 🔴 Rotation de `MASTER_ENC_KEY` — aucun script de migration

**Ce que c'est.** `MASTER_ENC_KEY` chiffre tous les secrets stockés en base (clés privées d'école
en mode `envelope`, sels de divulgation, adresses postales, clés VC). On sait remplacer la valeur
dans la configuration, mais **tout ce qui a été chiffré avec l'ancienne clé devient illisible** :
il n'existe aucun script qui déchiffre l'existant puis le rechiffre avec la nouvelle.

**Ce que ça coûte aujourd'hui.** Rien, tant qu'on ne touche pas à la clé.

**Quand ça devient bloquant.** Le jour où cette clé doit être tournée — typiquement parce qu'elle a
fuité. C'est exactement le moment où l'on n'a **pas** le temps d'écrire un script de migration
correct. En l'état, une fuite de `MASTER_ENC_KEY` laisse le choix entre garder une clé compromise
et perdre l'accès aux données chiffrées.

**C'est la seule dette de ce fichier qui devient très coûteuse si on attend l'incident.**
À écrire *avant* d'en avoir besoin. La cérémonie
[`docs/security/root-secrets-rotation.md`](./docs/security/root-secrets-rotation.md) documente déjà
le manque, mais ne le comble pas.

---

## 2. 🟠 Rotation de la racine post-quantique non couverte

**Ce que c'est.** Côté Ed25519, la rotation de racine fonctionne : le serveur essaie **toutes** les
racines de confiance et embarque dans le bundle **celle qui a réellement signé** le certificat de
l'école (`findTrustedEd25519RootFor`, `apps/server/src/crypto/keys.ts`). Un diplôme émis avant une
rotation continue donc de se vérifier.

Côté ML-DSA, `bundle.root.publicKeyPq` embarque toujours la racine PQ **courante**, sans recherche
par correspondance. Si la racine PQ change, les diplômes signés sous l'ancienne ne se vérifieront
plus.

**Pourquoi ça n'a pas été corrigé.** Le faire côté serveur obligerait le navigateur à faire
confiance à une réponse réseau pour choisir l'ancre — ce qui casserait la garantie centrale du
projet, « la preuve est autonome » (`CLAUDE.md` §1), et le piège n°6 (une seule implémentation de
vérification, exécutable côté client). Ce n'est pas un oubli, c'est un arbitrage.

**Quand ça devient bloquant.** Le jour où une rotation de racine PQ devient nécessaire
(compromission, fin de vie de l'algorithme). Ça n'arrive pas tout seul.

---

## 3. 🟢 Cache `leafCache` jamais invalidé

**Ce que c'est.** Le service de checkpoint du journal de transparence garde en mémoire les feuilles
déjà lues, et ce cache n'est jamais purgé. Si une feuille est supprimée pendant que le processus
serveur l'a déjà chargée, son cache reste périmé jusqu'au redémarrage.

**Ce que ça coûte aujourd'hui.** Rien en production : **rien ne supprime jamais de feuille**, le
journal est append-only par construction. Le cas ne s'est manifesté qu'en test, quand une suite
d'intégration supprimait ses propres feuilles au teardown (corrigé côté test).

**Quand ça devient bloquant.** Si une opération de maintenance venait un jour à supprimer des
feuilles. À traiter à ce moment-là, pas avant.

---

## 4. 🟢 Pas d'interface de pagination des liens de partage

**Ce que c'est.** Le serveur sait renvoyer les liens de partage page par page (route paginée +
index composite, migration `0020_share_links_pagination`). L'interface du wallet, elle, ne propose
pas de navigation : elle demande simplement les 100 premiers.

**Ce que ça coûte aujourd'hui.** Un élève qui dépasserait 100 liens de partage sur un même diplôme
ne verrait pas les suivants. Peu probable.

**Quand ça devient bloquant.** Si l'usage réel montre des titulaires qui accumulent beaucoup de
liens. Le contrat serveur étant déjà en place, il ne reste que l'interface à faire.

---

## Différé par décision — pas des dettes

Ces points sont **volontairement** hors périmètre. Ils sont listés ici pour éviter qu'on les
reprenne pour des oublis.

### Comportements de conception vérifiés — ex-mémos `S7` et `WA3`

Ces deux constats de l'audit du 2026-07-10 sont restés des mois « ni confirmés clos, ni confirmés
ouverts ». Ils ont été **retrouvés dans l'historique git** (`git show 0404edb:_refactor/audit.md`)
et confrontés au code le **2026-07-28**. Verdict : ce ne sont pas des dettes, ce sont deux
compromis de conception, inchangés depuis leur description d'origine.

- **S7 — le statut de l'école n'est pas revérifié à chaque requête.**
  `middleware/auth.ts:10-26` ne valide que la signature et l'expiration du JWT : aucune requête en
  base. Le statut **est** re-contrôlé au login et au refresh (`auth.routes.ts:556-586`, avec un
  commentaire explicite : « a rejected/revoked school must not be able to rotate its refresh
  token »), et `revokeSchool` tue les sessions de rafraîchissement.
  **Conséquence exacte** : une école qui vient d'être révoquée conserve l'accès pendant, au pire,
  la durée de vie de son jeton d'accès — `ACCESS_TOKEN_TTL` = **900 s / 15 min** (`env.ts:100`).
  C'est le compromis JWT court **contre** une requête base à chaque appel. Assumé.
  *Déclencheur d'une éventuelle remise en cause* : si une révocation devait devenir effective en
  moins de 15 minutes (exigence contractuelle ou incident), il faudrait soit raccourcir le TTL, soit
  introduire une liste de révocation consultée par `requireAuth`.

- **WA3 — un même navigateur ne peut pas cumuler une session école et une session élève.**
  Les deux partagent le réalm de cookies `cc_*` (`config/constants.ts:3-25`) ; seul l'admin est
  isolé en `cc_admin_*`. Se connecter comme élève écrase donc la session école, et réciproquement.
  L'intention est écrite noir sur blanc dans `lib/cookies.ts:16-26`. `CookieRealm` ne comporte
  toujours que deux valeurs (`"public" | "admin"`).
  *Déclencheur* : le jour où un même utilisateur doit légitimement porter les deux rôles
  simultanément — un troisième réalm de cookies serait alors nécessaire.

### Chantiers différés

- **V5 — BBS+** : « sous conditions, pas avant ». Aucune date. Voir
  [`reste-a-faire.md`](./reste-a-faire.md) §DEC-3.
- **Turborepo** et **Biome-formatter** : différés, avec des déclencheurs concrets écrits dans
  `docs/architecture.md` §11.1 et §11.2. Tant que ces déclencheurs ne sont pas atteints, ne pas
  ouvrir le chantier.
- **Warnings de lint pré-existants** (wallet 2, admin 7, web 7) : 15 warnings `set-state-in-effect`
  plus un import inutilisé `CheckCircle2` dans `apps/client/admin/src/app/page.tsx`, présent depuis
  le commit `0404edb`. Jamais corrigés, jamais une régression. `pnpm lint` sort en 0.
