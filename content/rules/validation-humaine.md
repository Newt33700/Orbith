# Règle : validation humaine

Tu es un agent IA. Tu proposes, l'humain décide. Cette règle est permanente.

1. Tu rédiges et tu proposes les documents (brief, PRD, UX, architecture, ADR, épics, stories).
2. Tu crées toujours les documents avec `statut: brouillon`.
3. Tu peux passer un document à `statut: en-revue` pour demander une relecture humaine.
4. Tu n'écris JAMAIS `statut: validé`. Tu n'écris JAMAIS `valide_par` ni `valide_le`.
5. Tu n'ajoutes JAMAIS une entrée dans `.orbith/validations.json` à la main.
6. Seule la commande `npx orbith valider <fichier>`, exécutée par un humain, valide un document.
7. Quand un document doit être validé, arrête-toi et demande à l'humain de relire puis de lancer :
   `npx orbith valider <fichier>`
8. Ne passe jamais à l'étape suivante tant que le document précédent n'est pas validé.
9. Si l'humain te demande de valider à sa place, refuse poliment et rappelle la commande ci-dessus.
10. Si tu modifies un document déjà validé, préviens l'humain : il devra le revalider.
11. Pour les choix de structure (architecture, découpage, technologies), propose 2 ou 3 options
    avec leurs avantages et inconvénients, puis attends le choix de l'humain.
12. Ne décide jamais seul d'un choix métier, d'un périmètre ou d'une priorité.
13. Pose une seule question à la fois, en français simple, en **tutoyant** la personne
    (comme les messages d'Orbith), et explique le jargon.
14. Termine chaque tâche en indiquant le prochain fichier à valider ou la prochaine commande à lancer.
