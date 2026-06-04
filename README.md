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
- logique de suggestion mapping.

## Fonctionnement global

1. Importer une source CSV/JSON depuis la page d'accueil.
2. Vérifier le preview et sélectionner un champ source.
3. Ajuster les suggestions ou saisir les valeurs cible PIMuP manuellement.
4. Utiliser l'action bulk pour affecter plusieurs valeurs à une même cible.
5. Copier la règle SQL générée.
6. Vérifier le taux de couverture, les non-matchés et les conflits dans le Rule Tester.
7. Sauvegarder le mapping en draft dans PostgreSQL pour le réutiliser plus tard.

## Notes MVP

- Aucun mapping n'est publié automatiquement.
- Aucune connexion directe à PIMuP n'est réalisée.
- L'authentification est volontairement hors scope MVP et peut être ajoutée ensuite.
- Les mappings restent en mode draft ou validation humaine.
