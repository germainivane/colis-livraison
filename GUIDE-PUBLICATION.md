# Mise à jour Colis : suivi des sociétés et liens d’activation

Cette version ajoute la liste des sociétés dans l’espace propriétaire et un bouton pour recréer un lien d’activation pour un administrateur existant qui n’a pas encore activé son compte. Le lien est affiché dans le site et n’est pas envoyé par e-mail.

## 1. Mettre à jour le site sur GitHub

1. Dans le dépôt `germainivane/colis-livraison`, ouvre la racine du dépôt.
2. Remplace `app.js` par celui de ce pack.
3. Remplace `supabase/functions/manage-accounts/index.ts` par celui de ce pack.
4. Valide les deux fichiers avec **Commit changes**. Vercel republiera le site.

## 2. Mettre à jour la fonction Supabase

1. Dans Supabase, ouvre **Edge Functions → manage-accounts**.
2. Remplace le code de la fonction par `supabase/functions/manage-accounts/index.ts` du pack.
3. Clique sur **Deploy updates** et attends la confirmation.

## 3. Récupérer le lien du compte déjà créé

Après le déploiement des deux fichiers, reconnecte-toi comme propriétaire. La page **Gestion des sociétés** affichera les espaces créés. Pour un compte encore en attente, clique sur **Récupérer le lien**, puis copie le lien et partage-le en privé avec l’administrateur.

Pour une nouvelle société, **Créer une société** affiche également un lien d’activation à partager.

Le lien est un accès temporaire au compte : ne le publie pas et partage-le uniquement avec la bonne personne.

## Important

La fonction doit être redéployée pour afficher la liste des sociétés et récupérer un lien pour un compte existant. Le réglage Supabase `SITE_URL` et l’adresse de retour du site doivent rester configurés comme ils le sont déjà.
