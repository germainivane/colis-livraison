# Colis — site de gestion des livraisons

Site web statique préparé pour hébergement sur Vercel. Il contient une maquette des espaces Administrateur et Livreur ainsi qu'un schéma Supabase de départ.

## Déploiement de la maquette

1. Créer un dépôt GitHub et y envoyer les fichiers de ce dossier.
2. Dans Vercel, choisir **Add New → Project**, importer le dépôt GitHub, puis cliquer **Deploy**. Le site est statique : aucun framework ni commande de build n'est nécessaire.
3. Les prochains envois sur la branche reliée déclencheront un nouveau déploiement.

## Avant d'utiliser les comptes et données réels

La connexion et les données de la maquette ne sont pas encore branchées à Supabase. Le mode aperçu accepte un rôle de démonstration ; il ne constitue pas une authentification. Avant un usage réel, connecter Supabase Auth et les requêtes de l'interface, puis exécuter `supabase/schema.sql` dans le SQL Editor. Les rôles et les règles RLS du schéma doivent être appliqués et vérifiés dans le projet Supabase.

Ne jamais publier une clé `service_role` dans le navigateur ni dans GitHub. Seule une clé publishable peut être utilisée côté site, avec RLS activé.
