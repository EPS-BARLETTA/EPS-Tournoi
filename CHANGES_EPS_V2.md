# CHANGES EPS V2

## Version partageable testeurs

### Alignement produit
- Suppression des promesses non tenues dans la documentation : `Mode EPS rapide`, `Projection`, ancienne simulation avancée, `Configuration recommandée`, hub `Gestion / Live / Projection`, options avancées non codées, rôles `Coach`.
- Aide intégrée alignée sur le produit réel : grand écran via le navigateur, impression et export, sans faux mode projection.
- Libellé live cohérent : `Rotation suivante + reset chrono`.

### Pré-lancement
- Ajout d’une vraie `Simulation / Analyse rapide de séance` avant lancement.
- La simulation lit les paramètres actuels, affiche un diagnostic de fluidité et d’organisation, mais ne crée pas de tournoi et ne modifie pas l’état principal.

### Fiabilité terrain
- Fallback `structuredClone` pour compatibilité avec Safari/iPad plus anciens.
- Garde-fous supplémentaires sur les listeners et plusieurs accès DOM sensibles.
- Génération de séance protégée par `try/catch` avec message clair côté enseignant.
- Message explicite quand aucun élève ou aucune équipe n’est au repos et qu’un rôle `Arbitre` ou `Table` ne peut pas être attribué.

### Scores et classements
- Un score ne compte que s’il est validé explicitement.
- `0-0` ne compte que via `Valider 0-0`.
- Un match non saisi ne modifie ni classement, ni résumé, ni export CSV.
- Export CSV limité aux matchs réellement validés.
- Ronde suisse : gestion correcte des matchs nuls.
- Challenge : barème cohérent `3 points par victoire`, `1 point par nul`.
- Badges attaque/défense corrigés pour éviter les faux badges à `0`.

### Sauvegarde
- Sauvegarde des séances protégée contre le dépassement du quota `localStorage`.
- Restauration toujours basée sur des clones sûrs de l’état enregistré.

### QA locale
- Ajout et extension du script `node tests/qa-smoke.js` pour les scénarios terrain principaux, dont la simulation avant lancement.

## Limites connues
- Pas de vue projection dédiée.
- Pas de recommandation appliquée en un clic ni de génération automatique depuis la simulation.
- Pas de coach ni de rôles sociaux avancés configurables.
- Pas de format au score cible ni de réglages avancés de chrono.
