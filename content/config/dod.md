<!--
  DEFINITION OF DONE (DoD) : quand une story est-elle réellement terminée ?

  Ce fichier appartient à l'équipe. Tu peux le modifier librement :
  - adapte les points à vos outils (par exemple, ajoute « déployé en préproduction ») ;
  - garde une liste courte (6 à 10 points maximum) ;
  - un point doit être vérifiable : oui ou non, sans discussion.

  La DoD est vérifiée avant de passer une story en `Terminée`, et `npx orbith check` la
  complète en contrôlant la traçabilité, la documentation, les validations et le CSR.
-->

# Definition of Done

Une story passe en `Terminée` seulement si tous les points ci-dessous sont cochés.

- [ ] **Critères d'acceptation passés** : chaque scénario Gherkin de la story est vert.
- [ ] **Tests automatiques** : les tests unitaires et les scénarios Gherkin sont écrits et exécutés dans la CI.
- [ ] **Revue de code humaine** : au moins une personne de l'équipe a relu et approuvé le code (une IA ne suffit pas).
- [ ] **`npx orbith check` OK** : aucune erreur de conformité CSR, de validation ou de confidentialité.
- [ ] **Documentation à jour** : les fichiers de documentation concernés (README, guides, documentation technique, ADR,
      commentaires du code) sont modifiés dans les commits de la story, ou la story porte `documentation: non-concernée`
      avec la raison dans ses notes techniques ; `npx orbith check` n'affiche aucun avertissement « Documentation » pour
      elle (voir `.orbith/rules/documentation.md`).
- [ ] **Traçabilité US dans les commits** : chaque commit de la story porte l'identifiant `US-XXX` dans son scope.
