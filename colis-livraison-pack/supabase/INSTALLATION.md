# Configuration Supabase de Colis

Le projet `colis-livraison` est créé. Le schéma multi-sociétés, les protections RLS, le compte propriétaire `Colislivraison@colis.com` et la fonction serveur `manage-accounts` ont été préparés dans Supabase.

## Activation du compte propriétaire

1. Ouvre l’invitation reçue à `Colislivraison@colis.com` et définis ton mot de passe depuis le lien.
2. Depuis le site, le propriétaire peut créer le premier compte administrateur de chaque société.
3. L’administrateur de chaque société peut ensuite inviter ses livreurs.

Les invitations et liens de récupération doivent revenir sur l’adresse Vercel du site. Dans **Authentication → URL Configuration**, règle le **Site URL** et ajoute l’adresse publique du site à la liste des redirections autorisées.

## Connexion du site

Dans **Project Settings → API Keys**, copie uniquement la clé **publishable** et renseigne-la dans `supabase-config.js`. Cette clé est prévue pour le navigateur. N’utilise jamais une clé **secret** ou `service_role` dans le site, dans GitHub ou dans Vercel.

La fonction `manage-accounts` vérifie les rôles côté serveur avant de créer des invitations. Les requêtes de livraisons restent isolées par société grâce aux règles RLS du schéma.

## Schéma du compte et des données

Le fichier `schema.sql` décrit les tables `companies`, `platform_owners`, `company_members` et `deliveries`, les règles RLS et les fonctions RPC de changement d’état des livraisons. Il a déjà été appliqué au projet Colis. Ne le rejoue pas si les tables et fonctions sont déjà présentes.

## Désactivation d’une société

Pour ajouter l’option **Désactiver / Réactiver** sur un projet déjà configuré, exécute une fois `upgrade_company_status.sql` dans le SQL Editor du projet. Cette mise à jour ajoute un état à la société et fait respecter cet état par les règles RLS. Les comptes et livraisons restent conservés.
