# Colis — gestion des livraisons

Site web statique pour les espaces Propriétaire, Administrateur et Livreur. Les connexions et les données utilisent Supabase Auth, Postgres avec RLS et la fonction serveur `manage-accounts`.

## Configuration publique Supabase

Le projet Colis utilise `https://wmryibxeyjvvmnffdjhd.supabase.co`. Avant publication, ouvre **Project Settings → API Keys** dans Supabase, copie la clé **publishable** et colle-la dans `supabase-config.js` à la place de `COLLER_LA_CLE_PUBLISHABLE_SUPABASE_ICI`.

Cette clé est publique et peut être visible dans le navigateur. N’utilise jamais la clé **secret** ou `service_role` dans ce fichier, le site ou GitHub.

## Comportement du site

- Les rôles sont déterminés après connexion par la fonction `manage-accounts`. Un livreur ne peut ouvrir que son espace.
- Le propriétaire peut créer une société et générer un lien d’activation pour son administrateur.
- Un administrateur peut générer un lien d’activation pour les livreurs de sa société.
- Les liens d’activation sont copiés et partagés en privé; aucun fournisseur SMTP n’est requis pour créer ces comptes.
- Les livraisons et les équipes sont chargées depuis Supabase et filtrées par les règles RLS du schéma.
- Les invités activent leur compte en choisissant eux-mêmes un mot de passe depuis le lien reçu en privé. Ce lien donne accès au compte et ne doit pas être publié.

## Publication sur Vercel

Le dépôt est déjà relié à Vercel. Remplace le contenu du dossier publié par les fichiers mis à jour, puis envoie-les sur GitHub pour déclencher un nouveau déploiement. Le **Root Directory** Vercel doit rester `colis-livraison-pack` si le dépôt conserve ce sous-dossier.

Dans **Authentication → URL Configuration**, définis l’URL du site Vercel comme **Site URL** et ajoute-la aux redirections autorisées pour que les invitations et la récupération de mot de passe reviennent sur le site.

Pour que les invitations sans e-mail fonctionnent, déploie aussi la version mise à jour de `supabase/functions/manage-accounts/index.ts` dans **Edge Functions → manage-accounts**. Le guide de mise à jour est dans `GUIDE-PUBLICATION.md`.
