# Référentiel CDC — Accrochage des certificateurs

Référentiel figé le **12 juillet 2026** depuis le portail officiel des responsables de
diplômes et certifications de la Caisse des Dépôts. Les ressources du portail sont indiquées
comme mises à jour le **30 mars 2026**.

## Version de référence

- Namespace XML : `urn:cdc:cpf:pc5:schema:1.0.0`
- Version déclarée par le XSD : `1.1.5`
- Encodage : XML **UTF-8** avec déclaration `<?xml version="1.0" encoding="UTF-8"?>`
- XSD : `kit-2026/Exemple de fichier XML avec son XSD/certifications-cdc.xsd`
- Exemples officiels : `CREATION.xml` et `SUPPRESSION.xml` dans le même dossier

Le XSD versionné ici est la source de vérité technique. Le dictionnaire précise les règles
métier lorsque le XSD rend un élément optionnel ou nullable.

## Sources officielles conservées

| Fichier local | Source |
|---|---|
| `guide-utilisation-xsd-notepad.pdf` | <https://certificateurs.moncompteformation.gouv.fr/espace-public/sites/certificateur/files/2026-03/Guide%20utilisation%20du%20fichier%20XSD%20sur%20l%E2%80%99application%20Notepad%20%2B%2B%20%20_1.pdf> |
| `guide-construction-xml.pdf` | <https://certificateurs.moncompteformation.gouv.fr/espace-public/sites/certificateur/files/2026-03/Guide%20d%27accompagnement%20construction%20fichier%20XML.pdf> |
| `exemple-xml-xsd.zip` | <https://certificateurs.moncompteformation.gouv.fr/espace-public/sites/certificateur/files/2026-03/Exemple%20de%20fichier%20XML%20avec%20son%20XSD.zip> |
| `dictionnaire-donnees.pdf` | <https://certificateurs.moncompteformation.gouv.fr/espace-public/sites/certificateur/files/2026-03/Dictionnaire_des_donn%C3%A9es.pdf> |
| `guide-fichiers-traites-avec-erreur.pdf` | <https://certificateurs.moncompteformation.gouv.fr/espace-public/sites/certificateur/files/2026-03/Guide%20pour%20les%20fichiers%20trait%C3%A9s%20avec%20erreur.pdf> |
| `guide-fichiers-rejetes.pdf` | <https://certificateurs.moncompteformation.gouv.fr/espace-public/sites/certificateur/files/2026-03/Comment%20corriger%20mes%20fichiers%20rejet%C3%A9s.pdf> |

Page d'index officielle :
<https://certificateurs.moncompteformation.gouv.fr/espace-public/ressources/le-depot-des-donnees>.

## Champs produits par CertifyChain

Le flux `CREATION` est groupé par code RNCP. Les champs structurels obligatoires sont :

- `flux.idFlux` : UUID stable du lot ;
- `flux.horodatage` : date de génération figée du lot, avec décalage explicite ;
- `flux.action` : `CREATION` ;
- `emetteur.idClient` : identifiant CDC/BCR de 8 caractères ;
- `certificateur.idClient` : identifiant CDC/BCR de 8 caractères ;
- `certificateur.idContrat` : identifiant CDC de 1 à 20 caractères ;
- `certification.type` : `RNCP` ;
- `certification.code` : code sous la forme `RNCP…` ;
- `passageCertification.idTechnique` : identifiant stable de l'item d'export ;
- données métier obligatoires du dictionnaire : mode d'obtention, caractère définitif,
  date de début de validité, niveaux européen/numérique, scoring/mention et modalité d'accès
  (avec `xsi:nil="true"` lorsque le dictionnaire l'autorise et que la donnée est inconnue) ;
- `identificationTitulaire.identifiantNational.nir` et `nomNaissance`.

### Point de sécurité NIR

L'application reçoit et valide le NIR complet sur **15 caractères**, clé de contrôle comprise,
puis le chiffre avec le KeyVault. Le XSD et le dictionnaire exigent toutefois **les 13 premiers
caractères uniquement** : la clé de deux chiffres n'est retirée qu'en mémoire au moment de la
construction du XML. Elle n'est jamais exportée. La branche `identifiantNational` est exclusive
des branches d'identité détaillée et de dossier CPF ; aucun prénom ni date de naissance n'est donc
collecté pour ce flux.

La désactivation administrative du module est refusée tant qu'un lot est généré ou déposé. Une
fois les lots résolus, elle purge immédiatement les NIR et noms de naissance encore chiffrés ; une
réactivation exige donc de les collecter à nouveau.

## Lots, nommage et dépôt

- Le portail accepte des fichiers `.xml`. Aucune convention publique plus restrictive de nommage
  n'a été trouvée dans le kit courant ; CertifyChain utilise un nom déterministe, ASCII et sans
  espace, contenant le BCR certificateur, l'horodatage et l'UUID du lot.
- Les identifiants émetteur/certificateur et le contrat sont figés dans le lot lors de sa création
  (migration `0013_cdc_export_settings_snapshot`) : un téléchargement historique reste donc
  byte-identique même si la configuration de l'établissement change ensuite.
- La FAQ officielle annonce jusqu'à **200 000 lignes de passages** par fichier et le guide général
  historique une limite de **200 Mo**. CertifyChain applique volontairement une limite produit plus
  prudente de **500 passages** par lot.
- Aucun environnement public de préproduction n'est documenté dans le kit accessible sans compte.
  Le dépôt de test doit être coordonné avec la CDC depuis l'espace certificateur. La phase A reste
  un téléchargement manuel et ne conserve aucun identifiant de connexion CDC.

## Comptes rendus de traitement

Un accusé de traitement contient des sections `passagesOK` et `passagesKO`. La corrélation repose
sur `idTechnique`; un passage KO porte au moins un `messageErreur`. Le parseur CertifyChain refuse
les identifiants inconnus et n'applique les résultats qu'au lot explicitement sélectionné.

## Validation locale XSD

Depuis la racine du dépôt, après génération d'un exemple :

```powershell
docker run --rm -v "${PWD}/docs/cdc:/x" alpine:3 sh -c "apk add --no-cache libxml2-utils && xmllint --noout --schema '/x/kit-2026/Exemple de fichier XML avec son XSD/certifications-cdc.xsd' /x/exemple-genere.xml"
```

Validation rejouée avec succès le **13 juillet 2026** sur
[`exemple-genere.xml`](./exemple-genere.xml) contre le XSD 1.1.5 versionné ci-dessus.

Cette validation structurelle ne remplace pas les règles métier du dictionnaire ni un dépôt sur
l'environnement CDC.
