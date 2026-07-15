# copy.md — Deck de copie produit (version finale)

> **Comment lire ce fichier.** Chaque ligne de copie porte un **tag de véracité** :
>
> - **`[LIVE]`** — vrai **aujourd'hui**, déployable immédiatement.
> - **`[V1]` `[V2]` `[V3]` `[V4]`** — ne devient vrai **que** quand ce chantier de [`v2.md`](./v2.md) est livré.
> - **`[F1]` `[F2]`** — idem pour [`features.md`](./features.md) (accrochage CDC, export EUDI).
>
> **Règle d'or (apprise à nos dépens).** Le produit a affiché « ZKP Groth16 » pendant des mois alors
> qu'aucun zero-knowledge n'était implémenté. On ne recommence pas. **Une ligne taguée `[V3]` ne part
> pas en prod avant que V3 soit en prod.** La landing prend des paiements : une promesse non tenue
> n'est pas une maladresse marketing, c'est un litige commercial.
>
> Ce fichier est le **deck cible**. Il ne remplace pas la copie live tant qu'un chantier n'a pas
> atterri. Le jour où V1 passe, on vient ici, on prend les lignes `[V1]`, on les colle. C'est tout.

---

## A. Positionnement

### La promesse, en une phrase

> **CertifyChain rend un diplôme vérifiable en 2 secondes — et vérifiable sans nous.**

### Le sound bite

> **« Ne nous croyez pas. Vérifiez. »**

C'est la phrase à faire retenir. Elle est agressive, elle est vraie *(à partir de V1)*, et **presque
aucun concurrent ne peut la prononcer** — c'est exactement pour ça qu'elle vaut de l'or.

### Les 3 différenciateurs (contre le marché réel)

**a) Contre le PDF + le coup de fil au secrétariat** *(le vrai concurrent, celui de 90 % des cas)*
Aujourd'hui un recruteur qui doute appelle l'école, attend, et souvent renonce. Le PDF, lui, se
falsifie en cinq minutes dans un éditeur d'images. Nous : la vérification passe de **plusieurs
semaines à moins de 2 secondes**, sans compte, et **un document falsifié n'aura jamais une
signature valide**. Ce n'est pas un gain de confort : c'est un changement de nature.

**b) Contre les « diplômes sur la blockchain » / NFT**
Ils inscrivent des données personnelles (ou leur hash) dans une chaîne **immuable** — ce qui rend le
**droit à l'effacement du RGPD structurellement impossible**. Un hash de donnée personnelle reste une
donnée personnelle : pseudonymisé n'est pas anonymisé. Nous : **zéro donnée personnelle sur la
chaîne**. On ancre uniquement la **racine d'un arbre** portant des milliers d'émissions — elle
n'identifie personne et n'est pas réversible. **On obtient le seul bénéfice réel de la blockchain
— une chronologie qu'on ne peut pas trafiquer — sans son coût et sans son problème juridique.**

**c) Contre les SaaS de vérification fermés**
Chez eux, « Vérifié » signifie **« notre serveur dit oui »**. Il faut les croire — et croire qu'ils
ne se sont pas fait pirater. Chez nous, la preuve se vérifie **dans le navigateur du recruteur**, et
le registre des émissions est **public et horodaté**. Nous ne nous donnons **pas le pouvoir de
mentir**. C'est le différenciateur le plus difficile à copier, parce qu'il oblige à renoncer à un
pouvoir — et personne n'y renonce volontiers.

---

## B. Le deck, surface par surface

### B.1 — `HeroSection.tsx`

**Badge (3–5 mots, sous l'icône clé)**
- `[LIVE]` **Signé Ed25519 · lien à usage unique**
- `[V1]` **Signé par l'école · vérifié chez vous**

**H1** *(garder le format court existant)*
- `[LIVE]` **Un faux diplôme ne passe plus.**

**Paragraphe** *(≈ 2 phrases, max 65 caractères de large)*
- `[LIVE]`
  > Chaque diplôme est signé cryptographiquement par son école, sous la racine PKI CertifyChain.
  > Le recruteur vérifie en 2 secondes, sans compte — et un lien capturé ne rejoue pas.
- `[V1]` *(remplace la version LIVE le jour où V1 atterrit)*
  > Chaque diplôme est signé par son école. Le recruteur le vérifie **dans son propre navigateur**,
  > en 2 secondes, sans compte — et l'élève choisit **exactement** ce qu'il montre.

**Trust bar (3 KPI)**
- `[LIVE]` `< 2s` / **vérification** · `99,9 %` / **SLA Enterprise** · `KYB` / **institutionnel**
- `[V1]` remplacer le 1er par : `0` / **compte à créer** *(plus fort que « < 2s » : c'est la friction, pas la vitesse, qui tue la vérification)*

---

### B.2 — `CryptoSection.tsx` (la section « principe »)

**Titre de section**
- `[LIVE]` **La fraude au diplôme devient un problème de mathématiques.**

**Étape « double vérification »**
- `[LIVE]` Signature validée contre la clé publique de l'école **ET** certificat validé contre la
  racine CertifyChain.

**Bloc de conclusion**
- `[LIVE]`
  > Un document falsifié n'aura jamais une signature valide. Un lien capturé ne peut pas être rejoué.
  > Un émetteur révoqué invalide rétroactivement tous ses diplômes. Chaque école signe avec sa propre
  > clé — **nous ne sommes pas le tiers de confiance : les mathématiques le sont.**
- `[V1]` *(ajouter en dernière phrase)*
  > Et vous n'avez pas à nous croire sur parole : **la vérification s'exécute dans votre navigateur.**
  > Téléchargez la preuve, vérifiez-la hors ligne, sans nous.
- `[V3]` *(ajouter)*
  > Chaque émission est inscrite dans un **registre public horodaté**. Même nous ne pouvons pas
  > réécrire l'histoire.

---

### B.3 — `FeaturesGrid.tsx` — bandeau défilant (« standards »)

Format : 6–7 items courts. **Ne jamais y mettre un standard qu'on n'implémente pas.**

- `[LIVE]` `SIRET · INSEE` · `RNCP · France Compétences` · `Ed25519 · PKI CertifyChain` ·
  `Lien à usage unique` · `Révocation en temps réel` · `Clés chiffrées AES-256-GCM` ·
  `RGPD · divulgation minimale`
- `[V3]` ajouter : `Registre public horodaté`
- `[V4]` ajouter : `Post-quantique · ML-DSA`
- `[F2]` ajouter : `EUDI Wallet · eIDAS 2.0`
- `[F1]` ajouter : `Accrochage CDC · Passeport de compétences`

---

### B.4 — `HowItWorksSection.tsx`

**Colonne « Vérification publique sans compte »**
- `[LIVE]` **Vérifié en < 2 s** — Lien à usage unique : un lien capturé ne rejoue pas.
- `[LIVE]` **Authenticité double** — Vérifie le diplôme **et** le certificat d'établissement.
- `[V1]` **Vérifié chez vous** — La preuve s'exécute dans votre navigateur. Vous ne nous faites pas
  confiance : vous vérifiez.

**Colonne élève**
- `[V1]` **Vous choisissez ce que vous montrez** — Programme seul ? Mention comprise ? Votre e-mail
  reste privé par défaut.

---

### B.5 — `ProblemSection.tsx` (les compteurs)

Ne rien inventer : **si un chiffre n'a pas de source publique citable, il dégage.**
Les compteurs actuels (`%`, `± sem.`, `< s`) doivent chacun pouvoir être sourcés (étude fraude aux
CV, délai moyen de vérification). **À sourcer avant mise en ligne — sinon les retirer.**
→ *Action ouverte, pas une ligne de copie.*

---

### B.6 — `PricingSection.tsx`

⚠️ **Le palier Enterprise vendait « Ancrage blockchain Polygon » — retiré, ça n'existait pas.**
Ne remets **aucune** feature non livrée dans une grille tarifaire : c'est le mensonge le plus
coûteux juridiquement (une feature facturée qui n'existe pas).

**Enterprise (399+)**
- `[LIVE]` Tout Pro, plus : · API publique + SSO · SLA 99,9 % garanti · IA : scoring, traduction ·
  Multi-établissements · CSM dédié
- `[F1]` ajouter : **Accrochage CDC automatisé** *(conformité art. L6113-8 — argument de vente
  massif : c'est une obligation légale, pas un confort)*
- `[F2]` ajouter : **Export EUDI Wallet (eIDAS 2.0)**
- `[V3]` ajouter : **Registre d'émission auditable** *(l'école voit tout ce qui est signé en son nom)*

> **Note stratégique.** L'ancrage (V3) est **gratuit** (OpenTimestamps) : n'en fais **pas** un upsell
> Enterprise. Mets-le dans **toutes** les offres et fais-en un argument de marque. Ce qui se facture
> en Enterprise, c'est le **registre consultable + l'alerte**, pas l'ancrage lui-même.

---

### B.7 — `Footer.tsx`

- `[LIVE]` Lien produit : **Principe cryptographique**
- `[LIVE]` Baseline :
  > Plateforme SaaS B2B de délivrance et vérification de diplômes signés cryptographiquement par
  > leur établissement. Pour un monde où un faux diplôme ne passe plus.
- `[V1]` Baseline (remplace) :
  > Des diplômes signés par leur école, vérifiables par n'importe qui, en 2 secondes — sans compte,
  > et sans avoir à nous faire confiance.

---

### B.8 — `layout.tsx` (metadata SEO — **le mensonge y est le plus cher : Google l'indexe**)

**description**
- `[LIVE]`
  > Plateforme SaaS de délivrance et de vérification de diplômes signés cryptographiquement par leur
  > établissement. Un faux diplôme ne passe plus : vérification en moins de 10 secondes, sans compte.
- `[V1]`
  > Diplômes numériques signés par leur école et vérifiables dans le navigateur du recruteur, en
  > moins de 10 secondes, sans compte. L'élève choisit les informations qu'il partage.

**keywords**
- `[LIVE]` diplôme numérique · vérification diplôme · signature Ed25519 · PKI éducation · SaaS école ·
  anti-fraude diplôme · diplôme infalsifiable
- `[F2]` ajouter : EUDI Wallet · eIDAS 2.0 · SD-JWT VC
- `[F1]` ajouter : accrochage CDC · passeport de compétences

---

### B.9 — Pages de vérification (`verify/`) — **la surface la plus sensible : c'est là que le recruteur juge**

**`VerifyScan.tsx` (pendant le scan)**
- `[LIVE]` Vérification de la signature et du certificat. Aucun secret ne transite en clair.
- `[V1]` Vérification de la signature **dans votre navigateur**. Aucune donnée ne nous est envoyée.

**`VerifiedCard.tsx` (le verdict)**
- `[LIVE]` **Signature de l'école vérifiée** · `moteur · ed25519-nonce-v1`
- `[V1]` **Vérifié dans votre navigateur** · *« 3 champs masqués par le titulaire »*
- `[V1]` Bouton : **Télécharger la preuve (JSON)** — *« Vérifiez-la hors ligne, sans nous. »*
- `[V3]` **Inscrit au registre public** — position 12 480, horodaté le 12/07/2026.

**`VerifyExperience.tsx` (note de réassurance)**
- `[LIVE]` Vérification cryptographique · sans inscription
- `[V1]` Vérification **dans votre navigateur** · sans inscription · sans nous faire confiance

⚠️ **Règle absolue sur cette page** : ne **jamais** afficher « Vérifié » sur la seule base de la
cryptographie. La crypto ne dit **rien** de la révocation (un fait postérieur à la signature).
Toujours croiser avec le statut réseau. Cf. `v2.md` §V1-2.

---

### B.10 — Wallet élève (`login`, `claim`)

- `[LIVE]` Vos diplômes sont signés cryptographiquement par votre école.
- `[V1]` Vos diplômes sont signés par votre école. **Vous seul décidez de ce que vous montrez.**

**Panneau de partage** `[V1]`
- Titre : **Que voulez-vous montrer ?**
- Aide : *« Le recruteur ne verra que les champs cochés. Votre e-mail reste privé par défaut. »*

---

### B.11 — Portail école

**Dashboard — carte PKI**
- `[LIVE]` Chaque diplôme est signé par la clé privée de votre établissement, sous la racine PKI
  CertifyChain — et vérifiable publiquement en moins de 2 secondes.
- `[V2]` **Votre clé ne quitte jamais son coffre matériel.** Même nous ne pouvons pas l'extraire.

**Page « Mon registre » (V3-6)** `[V3]`
- Titre : **Tout ce qui est signé en votre nom.**
- Sous-titre : *« Si un diplôme apparaît ici sans que vous l'ayez émis, c'est que votre clé est
  compromise. Signalez-le en un clic. »*
- → C'est **le** argument de vente auprès d'un directeur d'école : on lui donne un pouvoir de
  contrôle sur nous, pas seulement un service.

---

## C. Tableau « claim → preuve »

**Règle : si la colonne « preuve » ne peut pas être remplie, le claim dégage.**

| Claim | Tag | Preuve technique | Où |
|---|---|---|---|
| « Signé par l'école, pas par nous » | `[LIVE]` | Clé Ed25519 propre à chaque école, sous racine PKI ; la plateforme ne détient pas de clé de signature de diplôme | `crypto/keys.ts`, `schools.encrypted_private_key` |
| « Un faux diplôme ne passe plus » | `[LIVE]` | Vérification signature Ed25519 + chaîne de certificat contre la racine | `verify.routes.ts` |
| « Un lien capturé ne rejoue pas » | `[LIVE]` | Nonce à usage unique, TTL 120 s, consommation **atomique** | `proof-engine.ts`, `verification_nonces` |
| « Révocation en temps réel » | `[LIVE]` | Statut diplôme **et** statut école re-vérifiés à chaque vérification (porte `approved`) | `verify.routes.ts` (correctif S1) |
| « Le recruteur ne voit pas le document » | `[LIVE]` | Seuls des champs minimaux sont renvoyés ; le document n'est jamais transmis | `verify.routes.ts` |
| « L'élève choisit ce qu'il montre » | **`[V1]`** | Disclosures à hachés salés (SD-JWT / RFC 9901) + `share_links.disclosed_fields` | `v2.md` §V1 |
| « Vérifiable dans votre navigateur » | **`[V1]`** | `verifyProofBundle()` pur, exécuté client-side (`@noble/ed25519`) | `v2.md` §V1-6 |
| « Vérifiez-la hors ligne, sans nous » | **`[V1]`** | Proof bundle JSON téléchargeable + page `/verifier` autonome | `v2.md` §V1-6 |
| « Votre clé ne quitte jamais son coffre » | **`[V2]`** | `Signer` + KMS/HSM : la clé privée n'est jamais exfiltrable | `v2.md` §V2 |
| « Nous ne pouvons pas réécrire l'histoire » | **`[V3]`** | Journal Merkle append-only (RFC 6962) + racine ancrée dans Bitcoin (OpenTimestamps) | `v2.md` §V3 |
| « Zéro donnée personnelle sur la blockchain » | **`[V3]`** | On ancre **uniquement** un hash de racine d'arbre ; la feuille elle-même ne contient aucune PII | `v2.md` §V3-1 |
| « Votre école voit tout ce qui est émis en son nom » | **`[V3]`** | Page `/ecole/journal` + signalement | `v2.md` §V3-6 |
| « Encore vérifiable dans 40 ans » | **`[V4]`** | Double signature hybride Ed25519 + ML-DSA (FIPS 204), mode « ET » | `v2.md` §V4 |
| « Compatible portefeuille d'identité européen » | **`[F2]`** | SD-JWT VC émis via OpenID4VCI (eIDAS 2.0 / ARF) | `features.md` §F2 |
| « Votre obligation légale d'accrochage, automatisée » | **`[F1]`** | Génération XML CDC conforme au XSD officiel (art. L6113-8) | `features.md` §F1 |

---

## D. Ce qu'on ne dira JAMAIS

| Formulation tentante | Pourquoi elle est **fausse** |
|---|---|
| « ZKP », « Groth16 », « zero-knowledge », « preuve à divulgation nulle », « SnarkJS » | **Aucun zero-knowledge n'est implémenté, et ne le sera pas.** Groth16 a été abandonné (cf. `v2.md` §0.1). Ces mots sont bannis, sous toute forme. |
| « La fraude aux diplômes devient impossible » | **Faux.** La crypto empêche la **falsification** d'un diplôme. Elle n'empêche **pas** une école malhonnête (ou un employé corrompu) d'émettre un **vrai** diplôme à un imposteur. Dire « la fraude » sans qualifier, c'est mentir. → Dire : **« un faux diplôme ne passe plus »** ou **« un document falsifié n'aura jamais une signature valide »**. |
| « Ancrage blockchain Polygon » | N'a **jamais** existé dans le code. Et l'ancrage prévu est **Bitcoin via OpenTimestamps**, gratuit. |
| « Diplôme sur la blockchain », « NFT » | On ne met **rien** de personnel on-chain — c'est notre **argument contre** eux, pas notre produit. Le dire nous ferait hériter de leur problème RGPD. |
| « W3C Verifiable Credentials », « EQAR » | Non implémentés. (F2 vise **SD-JWT VC**, et l'ADR exclut explicitement W3C VC JSON-LD.) |
| « 100 % sécurisé », « inviolable », « incassable » | Aucun système ne l'est. Un claim absolu détruit la crédibilité auprès du seul public qui compte : celui qui sait. |
| « Certifié RGPD » | **La certification RGPD n'existe pas.** On est *conforme*, on n'est pas *certifié*. |
| « Certifié ANSSI / eIDAS qualifié » | Nous ne sommes **pas** un prestataire qualifié (QTSP). F2 livre une émission **non qualifiée**, interopérable. Ne jamais laisser entendre l'inverse. |
| « Vos données ne quittent jamais votre appareil » | Faux : le serveur détient les diplômes. Ce qui est vrai (post-V1), c'est que **la vérification** s'exécute côté client. Nuance essentielle. |
| Chiffres sans source (« 40 % des CV sont falsifiés ») | Si on ne peut pas citer l'étude, le chiffre dégage. Cf. §B.5. |

---

## E. Séquence d'activation (le calendrier de la vérité)

| Quand | Ce qu'on peut enfin dire |
|---|---|
| **Aujourd'hui** | « Signé par l'école. Un faux diplôme ne passe plus. Vérifié en 2 s, sans compte. Un lien capturé ne rejoue pas. » |
| **V1 livré** | ⭐ **« Ne nous croyez pas. Vérifiez. »** + « L'élève choisit ce qu'il montre. » ← *le vrai saut marketing du produit* |
| **V2 livré** | « Votre clé ne quitte jamais son coffre matériel. » |
| **V3 livré** | « Nous ne pouvons pas réécrire l'histoire. » + « Votre école voit tout ce qui est signé en son nom. » |
| **V4 livré** | « Encore vérifiable dans 40 ans. » |
| **F1 / F2 livrés** | « Votre obligation légale, automatisée. » / « Compatible portefeuille européen. » |

> **Le message à retenir pour la stratégie produit** : le plus gros gain marketing du projet n'est pas
> une feature visible, c'est **V1** — le jour où la vérification quitte notre serveur pour le
> navigateur du recruteur. C'est ce jour-là qu'on gagne le droit de dire la seule phrase que la
> concurrence ne peut pas copier : **« vous n'avez pas à nous faire confiance. »**
