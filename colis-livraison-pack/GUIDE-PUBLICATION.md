# Publier manuellement le site Colis

## 1. Extraire le pack

Décompresse `colis-livraison-pack.zip` sur ton ordinateur, puis ouvre le dossier extrait.

## 2. Envoyer les fichiers sur GitHub

1. Crée un dépôt GitHub privé nommé `colis-livraison`.
2. Dans le dépôt, choisis **Add file → Upload files**.
3. Fais glisser les fichiers du dossier extrait, y compris le dossier `supabase`, dans la zone d’envoi.
4. Valide avec **Commit changes**.

À la racine du dépôt, tu dois voir `index.html`, `app.js`, `README.md`, `vercel.json`, `.gitignore` et `supabase/schema.sql`.

## 3. Publier sur Vercel

1. Dans Vercel, choisis **Add New → Project**.
2. Importe le dépôt GitHub `colis-livraison`.
3. Garde la configuration d’un site statique : aucun framework et aucune commande de build.
4. Clique sur **Deploy**. Vercel affichera l’adresse du site.

## Limite actuelle

Cette publication affiche la maquette. Les connexions sont en mode aperçu et les données restent dans le navigateur. Le schéma Supabase est inclus, mais l’interface n’est pas encore connectée à Supabase Auth ni à la base de données. N’utilise pas encore le site pour des comptes ou des livraisons réels.
