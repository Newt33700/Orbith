<!--
  DEFINITION OF READY (DoR) : quand une story est-elle prête à être développée ?

  Ce fichier appartient à l'équipe. Tu peux le modifier librement :
  - ajoute, retire ou reformule des points selon les besoins de ton équipe ;
  - garde une liste courte (6 à 10 points maximum) pour qu'elle reste utile ;
  - chaque point doit pouvoir être vérifié en quelques secondes par le PO ou le tech lead.

  Après modification, les nouvelles stories reprennent automatiquement la liste.
  Les stories déjà créées gardent leur ancienne checklist : copie-la à la main si besoin.
-->

# Definition of Ready

Une story passe en `Prête` seulement si tous les points ci-dessous sont cochés.

- [ ] **Valeur métier claire** : le bénéfice pour l'utilisateur ou l'entreprise est écrit dans la description.
- [ ] **Critères Gherkin** : au moins un scénario complet (Étant donné / Quand / Alors) dans « Critères d'acceptation ».
- [ ] **Estimable** : l'équipe peut dire grossièrement combien de temps cela prend, sans grande inconnue.
- [ ] **Dépendances identifiées** : les stories, décisions (ADR) ou accès externes nécessaires sont listés.
- [ ] **Maquette UX si besoin** : pour toute story qui touche une interface, la maquette ou le parcours est disponible.
- [ ] **Validée par le PO** : la story a été relue et validée avec `npx orbith valider`.
