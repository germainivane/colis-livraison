# Configuration Supabase de Colis

Le projet Supabase `colis-livraison` est déjà configuré : schéma multi-sociétés appliqué, propriétaire actif, adresse `SITE_URL` définie pour la fonction et URL de retour du site autorisée.

## Invitations sans SMTP

La version mise à jour de `manage-accounts` génère un lien d’activation au lieu d’envoyer un e-mail. Après création d’une société ou invitation d’un livreur, copie le lien affiché par le site et partage-le directement avec la personne concernée.

Le lien permet à son destinataire d’ouvrir le site et de choisir un mot de passe. Traite-le comme un code d’accès : partage-le en privé, uniquement avec la personne invitée. Ne l’envoie pas dans une conversation publique ou une capture d’écran.

Cette méthode ne demande pas de configurer SMTP. Les liens doivent être utilisés rapidement selon leur durée de validité Supabase. Si l’adresse e-mail existe déjà, vérifie le compte dans **Authentication → Users** avant toute suppression ou nouvelle tentative.

## Mise à jour de la fonction

Après avoir mis à jour `app.js` sur GitHub, remplace le code de **Edge Functions → manage-accounts** par `functions/manage-accounts/index.ts` et clique sur **Deploy updates**. Le guide complet se trouve dans `GUIDE-PUBLICATION.md`.

## Clés et sécurité

Le site utilise uniquement la clé **publishable** dans `supabase-config.js`. Ne place jamais la clé **secret** ou `service_role` dans le navigateur, GitHub ou Vercel.

La fonction vérifie le rôle du propriétaire ou de l’administrateur côté serveur. Les règles RLS isolent les sociétés et leurs données.
