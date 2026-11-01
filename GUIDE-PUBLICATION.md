# Mise à jour Colis : invitations sans SMTP

Cette version remplace l’envoi d’e-mail par un lien d’activation à partager en privé. Elle met à jour le site et la fonction Supabase `manage-accounts`.

## 1. Mettre à jour le site sur GitHub

1. Dans le dépôt `germainivane/colis-livraison`, ouvre le dossier `colis-livraison-pack`.
2. Remplace `app.js` par le nouveau fichier du pack.
3. Remplace aussi `README.md` et `supabase/INSTALLATION.md` si tu veux garder la documentation à jour.
4. Valide avec **Commit changes**. Vercel publiera le nouveau site automatiquement.

## 2. Mettre à jour la fonction Supabase

1. Dans Supabase, ouvre **Edge Functions → manage-accounts**.
2. Remplace le code de la fonction par `supabase/functions/manage-accounts/index.ts` du pack.
3. Clique sur **Deploy updates** et attends la confirmation.

## 3. Créer une société ou inviter un livreur

Le bouton d’invitation crée maintenant le compte et affiche un lien d’activation à copier. Envoie ce lien directement à la personne concernée par un message privé. Elle ouvrira le lien sur le site, puis choisira son mot de passe.

Le lien est un accès temporaire au compte : ne le publie pas, ne le partage pas dans une capture d’écran, et envoie-le uniquement à la bonne personne. Si Supabase indique que l’adresse e-mail existe déjà, vérifie d’abord **Authentication → Users** au lieu de supprimer le compte à l’aveugle.

## Important

La fonction doit être redéployée pour que les invitations fonctionnent sans SMTP. Le réglage Supabase `SITE_URL` et l’adresse de retour du site doivent rester configurés comme ils le sont déjà.
