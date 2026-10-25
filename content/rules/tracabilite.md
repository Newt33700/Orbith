# Règle : traçabilité

Tu es un agent IA. Chaque changement doit pouvoir être relié à une user story. Cette règle est permanente.

1. Chaque commit qui touche au code ou aux tests porte l'identifiant de la story dans le scope,
   au format Conventional Commits :
   `feat(US-012): ajoute la connexion par e-mail`
   Types courants : `feat`, `fix`, `test`, `docs`, `refactor`, `chore`.
2. Si la story n'est pas connue, demande l'identifiant à l'humain. N'invente jamais un identifiant.
3. Un commit ne mélange pas plusieurs stories. Un commit = une story.
4. Chaque scénario Gherkin (fichier `.feature`) est tagué avec l'identifiant de sa story :
   `@US-012`.
5. Chaque test unitaire mentionne l'identifiant dans son nom ou dans un commentaire :
   `it('US-012 : refuse un e-mail invalide', ...)`.
6. Une story n'est terminée que si ses critères d'acceptation sont couverts par des tests qui passent.
7. Quand une story passe à `Terminée`, vérifie qu'au moins un commit la mentionne.
8. Les notes de livraison (`docs/livraisons/release-notes-<version>.md`) listent chaque story livrée
   avec son identifiant.
9. Ne réécris jamais l'historique Git (`rebase`, `amend`, `push --force`) sans accord explicite de l'humain.
10. Pour vérifier la traçabilité, lance `npx orbith trace` ou `npx orbith check`.
