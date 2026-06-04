# PIMuP Mapping Assistant

Application web interne MVP pour accélérer la création de mappings produits PIMuP à partir de sources CSV/JSON et générer des règles SQL `CASE WHEN` compatibles PostgreSQL/JSONB.

## Fonctionnalités MVP

- Upload CSV ou JSON côté navigateur.
- Preview des 50 premières lignes importées.
- Détection automatique des colonnes et chemins JSON imbriqués (`raw_data.name`, `raw_data.formattedCategories[0]`, etc.).
- Sélection d'un champ source à mapper.
- Calcul des valeurs distinctes avec leur count.
- Suggestions automatiques basées sur :
  - mémoire de suggestions validées ;
  - similarité Levenshtein ;
  - mots-clés inclus dans la valeur source.
- Tableau de mapping avec recherche, édition manuelle, statuts et action bulk.
- Sélection/édition du nom de source pour réutiliser des mappings fournisseur déjà connus.
- Éditeur de mappings existants par source (`valeur source => valeur cible`) pour alimenter les suggestions sans attendre une sauvegarde PostgreSQL.
- Détection indicative des typologies de source : sport, thématique ou famille produit à partir des mots-clés présents dans les données importées.
- Import de mappings one-to-one CSV/JSON, preview de validation, correction en interface et arbitrage des conflits.
- Gestion des valeurs cibles autorisées via le bloc **Target Values** et selector searchable/addable dans le tableau.
- Export des mappings validés en CSV, JSON ou SQL `CASE WHEN`.
- Génération SQL `CASE WHEN` avec regroupement des valeurs source par valeur cible.
- Test virtuel des règles sur les données importées : total, matchés, non matchés, couverture, conflits et exemples.
- Sauvegarde des projets et règles en draft dans PostgreSQL via Prisma.

## Stack

- Next.js + TypeScript
- TailwindCSS
- API routes Next.js
- PostgreSQL
- Prisma ORM
- PapaParse pour CSV
- Vitest pour tests unitaires

## Installation

```bash
npm install
```

## Variables d'environnement

Créer un fichier `.env` à la racine :

```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/pimup_mapping_assistant?schema=public"
```

## Base de données

Générer le client Prisma puis créer les tables :

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

Charger les exemples métier en mémoire de suggestion :

```bash
npm run prisma:seed
```

Tables créées :

- `mapping_projects`
- `mapping_rules`
- `mapping_history`
- `suggestion_memory`
- `mapping_knowledge_base`
- `target_values`

## Lancement local

```bash
npm run dev
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).


## Prévisualisation locale rapide

Une fois les dépendances installées, lancer l'application :

```bash
npm run dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000) et cliquer sur **Charger les données de démo locales** dans le bloc d'upload.

Le fichier utilisé pour cette prévisualisation est `public/samples/pimup-products.json`. Il contient des produits de démonstration couvrant les exemples métier (`SNAPBACK`, `TRUCKER`, `SWIMSUIT`, `BIKINI BOTTOM`, `T-SHIRT`, `HOODIE`, etc.) afin de tester immédiatement :

- l'exploration de chemins JSON comme `raw_data.name` ;
- les suggestions automatiques ;
- la génération SQL `CASE WHEN` ;
- le Rule Tester avec produits matchés, non matchés et conflits potentiels.

## Tests

```bash
npm test
```

Les tests couvrent :

- normalisation texte ;
- génération SQL et escaping ;
- détection des conflits ;
- logique de suggestion mapping ;
- preview d’import one-to-one et export CSV.

## Fonctionnement global

1. Importer une source CSV/JSON depuis la page d'accueil.
2. Vérifier le preview et sélectionner un champ source.
3. Renseigner ou sélectionner le nom de source/fournisseur pour prioriser ses mappings existants.
4. Ajouter au besoin des mappings connus dans l’éditeur (`SNAPBACK => Casquette snapback`) afin de pré-remplir le tableau.
5. Consulter les typologies détectées automatiquement (sport, thématique, famille produit) pour orienter le mapping.
6. Ajuster les suggestions ou saisir les valeurs cible PIMuP manuellement.
7. Utiliser l'action bulk pour affecter plusieurs valeurs à une même cible.
8. Copier la règle SQL générée.
9. Vérifier le taux de couverture, les non-matchés et les conflits dans le Rule Tester.
10. Sauvegarder le mapping en draft dans PostgreSQL pour le réutiliser plus tard.




## Knowledge base one-to-one

La table `mapping_knowledge_base` stocke les mappings fiables `source_value → target_value` validés par l’utilisateur. Elle contient `source_name`, `attribute_name`, `source_value`, `source_value_normalized`, `target_value`, `source_path`, `matcher_type`, `family`, `sport`, `category`, `brand`, `gender`, `confidence_score`, `status` et `validation_count`.

Le bloc **Import mappings one-to-one CSV/JSON** accepte :

```csv
source_name,attribute_name,source_value,target_value,family,sport,category,brand
Nike,family,SNAPBACK,Casquette snapback,Accessoire,Lifestyle,Casquette,Nike
Puma,family,TRUCKER,Casquette trucker,Accessoire,Lifestyle,Casquette,Puma
Adidas,family,TEE,T-shirt,Textile,Football,Haut,Adidas
```

Ou un tableau JSON d’objets utilisant les mêmes clés. Les fichiers exemples sont disponibles dans `public/samples/pimup-one-to-one-mappings.csv` et `public/samples/pimup-one-to-one-mappings.json`.

Après import, l’interface affiche le nombre de lignes importées, valides, invalides, doublons, mappings existants et conflits. Un conflit correspond à un même couple `source_value` + `attribute_name` avec une `target_value` différente. L’utilisateur peut alors garder l’existant, remplacer, créer une exception par source ou ignorer la ligne avant sauvegarde.

Les mappings sauvegardés sont réinjectés dans `/api/suggestions` et deviennent immédiatement disponibles pour les imports suivants : par exemple `TEE → T-shirt` peut suggérer `T-shirt` pour `OVERSIZED TEE` via le matching keyword/contains.


## Import SQL CASE Parser

L’éditeur **Éditeur de mappings existants** accepte uniquement des mappings one-to-one simples : `SOURCE => TARGET`, `SOURCE ; TARGET`, `SOURCE, TARGET` ou `SOURCE | TARGET`. Si le contenu contient des marqueurs SQL (`CASE`, `WHEN`, `THEN`, `ELSE`, `END`, `raw_data->`, `CONCAT(`), il n’est pas importé comme mapping one-to-one et l’interface affiche un warning demandant d’utiliser **Import SQL CASE Parser**.

Le module **Import SQL CASE Parser** analyse les règles `WHEN ... THEN ...` et extrait `source_path`, `matcher_type`, `source_value` et `target_value`. Il supporte :

- `WHEN <path> = 'value' THEN 'target'` → `matcher_type = exact` ;
- `WHEN <path> IN ('value 1', 'value 2') THEN 'target'` → plusieurs mappings `exact` ;
- `WHEN <path> ~* 'regex' THEN 'target'` → `matcher_type = regex`.

Les lignes `ELSE CONCAT(...)` sont ignorées et affichées dans la section debug/unmapped cases afin d’éviter la création automatique de mappings invalides.

## Target Values et exports

La page `/target-values` et le bloc **Target Values** listent les valeurs cibles connues pour alimenter le selector `target_value` du tableau de mapping. L’utilisateur peut rechercher une cible existante ou saisir une nouvelle valeur directement depuis le selector.

Les mappings courants peuvent être exportés depuis l’interface en :

- CSV ;
- JSON ;
- SQL `CASE WHEN`.

## Éditeur de mappings et typologies détectées

Le bloc **Nom de la source / fournisseur** permet de nommer explicitement la source importée, par exemple `supplier-running-2026.csv`. Ce nom est envoyé à `/api/suggestions` pour récupérer les mappings déjà sauvegardés sur cette source et les appliquer en priorité. Les sources déjà présentes en base sont proposées via l’autocomplétion du champ.

Le bloc **Éditeur de mappings existants** affiche maintenant deux champs obligatoires avant la zone de saisie : **Source Name** et **Attribute Name**. `Source Name` est searchable avec autocomplétion des sources connues et des exemples métier (`Nike B2B`, `Puma B2B`, `Ekkia`, `Bihr`, `DK Company`, `Tamaris`, `New Era`) tout en permettant de saisir une nouvelle source. `Attribute Name` propose notamment `family`, `size`, `color`, `season`, `gender` et `sport`. Tant qu’un de ces champs est vide, le bouton **Ajouter à cette source** reste désactivé et un message explicite est affiché.

Le même bloc accepte ensuite un mapping par ligne, avec les formats `SOURCE => CIBLE`, `SOURCE; CIBLE`, `SOURCE, CIBLE` ou `SOURCE | CIBLE`. Ces mappings sont associés au couple `Source Name` + `Attribute Name`, ajoutés à la mémoire locale de la source courante et utilisés en priorité dans les suggestions futures. Ils restent locaux jusqu’à la sauvegarde draft PostgreSQL.

Le panneau **Typologies détectées** scanne les valeurs primitives des premières lignes importées et signale les sports, thématiques ou familles produit potentielles grâce à des mots-clés simples (`RUNNING`, `YOGA`, `SWIMSUIT`, `SNAPBACK`, etc.). Cette détection est volontairement indicative dans le MVP : elle aide l’utilisateur à choisir le bon champ ou la bonne cible, mais ne valide rien automatiquement.

## Réutilisation des mappings existants par source

Quand une source est chargée, l'application appelle `/api/suggestions` avec `attributeName` et `sourceName`. L'API recherche alors les règles `draft` ou `validated` déjà sauvegardées dans `mapping_projects` / `mapping_rules` pour la même source et le même attribut.

Ces mappings historiques sont renvoyés avec la raison `source-history` et sont prioritaires sur la mémoire globale `suggestion_memory`. Dans le tableau, ils apparaissent en vert avec le suffixe `source`, ce qui permet aux équipes de repérer rapidement les mappings déjà connus pour ce fournisseur/source.

## Notes MVP

- Aucun mapping n'est publié automatiquement.
- Aucune connexion directe à PIMuP n'est réalisée.
- L'authentification est volontairement hors scope MVP et peut être ajoutée ensuite.
- Les mappings restent en mode draft ou validation humaine.
