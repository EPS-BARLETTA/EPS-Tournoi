# EPS Tournoi

EPS Tournoi est une application web statique HTML/CSS/JS pour organiser une séance de tournoi EPS sur téléphone, tablette ou ordinateur. Elle fonctionne localement dans le navigateur, avec sauvegarde `localStorage`, vue live, classement, impression et export CSV.

## Lancer l'application
1. Ouvrir un terminal dans le dossier du projet.
2. Lancer un petit serveur statique :
```bash
python3 -m http.server 4173
```
3. Ouvrir [http://localhost:4173/index.html](http://localhost:4173/index.html).

## Fonctionnalités réellement disponibles
- Sports collectifs : `Championnat`, `Coupe du monde`, `Poules tournantes`.
- Raquettes : `Tournoi poule`, `Poules`, `Échelle / Ladder`, `Ronde suisse`, `Défi`.
- Paramétrage simple : participants, terrains, créneau, durée, arbitre tournant, table de marque, nom de séance.
- Ladder raquettes avancé : choix de terrains arbitres fixes, placement initial manuel ou automatique, et logique montée-descente où l’arbitrage reste attaché au terrain.
- Défi raquettes avancé : classement initial alphabétique, aléatoire ou manuel, vue live compacte et saisie par victoire.
- Simulation / analyse rapide de séance avant lancement, pour estimer la fluidité et l’organisation.
- Vue live terrain : chrono, saisie de scores, validation explicite `0-0`, rotation précédente/suivante, bandeau d’état de rotation.
- Classement et statistiques : calculés uniquement à partir des scores validés.
- Sauvegarde locale et reprise de séance.
- Suivi par classe.
- Impression du résumé final.
- Export CSV des classements et des matchs réellement saisis.
- Accueil revu pour un usage plus centré et plus lisible, avec aide intégrée courte et à jour.

## Fonctionnalités non présentes dans cette version
- Pas de bouton ou mode `EPS rapide` distinct.
- Pas de vue `Projection` dédiée.
- Pas de hub `Gestion / Live / Projection`.
- Pas de panneau `Configuration recommandée` à appliquer en un clic.
- Pas d’options avancées pour `pause globale`, `score cible`, `coach`, `chrono avancé`, réglages `son/vibration`.
- Pas de rôles EPS complets au-delà de `Arbitre` et `Table`.

## Utilisation type
1. Choisir `Sports collectifs` ou `Raquettes`.
2. Sélectionner un format.
3. Renseigner le nombre de participants et les terrains.
4. Ajuster le créneau et la durée.
5. Activer si besoin `Arbitre tournant` et/ou `Table de marque`.
6. Utiliser `📊 Simuler la séance` pour obtenir un diagnostic rapide avant lancement.
7. Lancer la séance.
8. En live, saisir les scores terrain par terrain.
9. Utiliser `Valider 0-0` pour un vrai nul sans point marqué.
10. Passer à `Rotation suivante + reset chrono` quand tous les matchs de la rotation sont validés.

## Notes terrain
- Un match non saisi ne compte pas dans le classement, le résumé ni le CSV.
- Un score `0-0` ne compte que s’il a été validé explicitement.
- Si aucun élève ou équipe n’est au repos, l’application n’invente pas d’arbitre ou de table.
- La simulation est une aide à la décision avant lancement : elle n’enregistre rien et ne crée pas de tournoi.
- Pour un grand écran, utiliser simplement l’affichage du navigateur : cette version n’a pas de mode projection séparé.
- En `Échelle / Ladder`, un terrain arbitré fixe garde toujours `2 joueurs + 1 arbitre`. L’arbitre joue au tour suivant sur ce même terrain. Un joueur qui monte vers un terrain arbitré commence par arbitrer ; un joueur qui descend vers un terrain arbitré joue. Sur `T1`, le gagnant reste joueur ; sur le dernier terrain arbitré, le perdant devient arbitre.

## Smoke tests locaux
Un script léger de QA est fourni :
```bash
node tests/qa-smoke.js
```

Il vérifie notamment :
- championnats sport collectif avec `12`, `13`, `24`, `25` participants ;
- formats raquettes avec `8`, `9`, `16` joueurs ;
- ladder impair ;
- défi en `±5` ;
- simulation raquettes et sport collectif ;
- rôles arbitre/table activés ou non ;
- blocage du passage de rotation sans score ;
- validation explicite `0-0` ;
- sauvegarde/reprise locale ;
- export CSV sans matchs non validés.
