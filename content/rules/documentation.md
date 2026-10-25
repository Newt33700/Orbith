# Règle : documentation à jour

Tu es un agent IA. Cette règle est permanente : **toute modification de code que tu fais ou proposes met à jour,
dans le même commit ou au plus tard dans la même user story, la documentation qu'elle rend fausse ou incomplète.**
Une documentation qui ne correspond plus au code induit l'équipe en erreur : elle vaut moins que pas de
documentation du tout.

## Ce qu'il faut vérifier à chaque modification

Avant de proposer un commit, passe cette liste. Pour chaque ligne : « mis à jour », ou « non concerné » avec la
raison en quelques mots.

- [ ] **README** du projet : installation, commandes, options, exemples, captures de sortie.
- [ ] **Guides utilisateur** (`docs/guide/` ou l'équivalent du projet) : procédures, tableaux, exemples.
- [ ] **Documentation technique** : architecture, ADR, spécification interne. Une décision d'architecture nouvelle ou
      modifiée passe par l'architecte et un ADR, jamais par une simple mise à jour silencieuse.
- [ ] **Commentaires du code** : les commentaires et docstrings des fonctions modifiées décrivent le nouveau
      comportement (un commentaire faux est pire qu'un commentaire absent).
- [ ] **Configuration documentée** : toute nouvelle clé, option ou variable d'environnement est décrite là où
      l'équipe la cherche (fichier d'exemple commenté, README).
- [ ] **Notes de version** : un changement visible par les utilisateurs ou l'exploitation est signalé dans la
      section `## Notes techniques` de la US, pour que les notes de version (`docs/livraisons/`) le reprennent.
- [ ] **Exemples** : chaque exemple de commande ou de code que tu modifies dans la documentation fonctionne
      réellement ; si tu peux l'exécuter, exécute-le.

## Règles

1. Ne dis jamais qu'une tâche de code est « terminée » sans avoir passé cette liste et indiqué le résultat à
   l'humain (fichiers de documentation modifiés, ou « non concerné » et pourquoi).
2. Mets à jour la documentation **dans le même commit** que le code quand c'est possible, sinon dans un commit
   `docs(US-xxx): …` de la même US. Jamais « plus tard », jamais dans une autre US sans l'accord de l'humain.
3. N'invente rien dans la documentation : décris ce que fait réellement le code, pas ce qu'il devrait faire.
4. Si une documentation est hors de ton périmètre (par exemple un document validé par un humain), ne la réécris
   pas : signale l'écart à l'humain et propose la modification. Un document `validé` modifié devra être revalidé
   (`npx orbith valider <fichier>`).
5. Si rien n'est à documenter (refactoring interne, test seul), dis-le explicitement. L'humain peut l'indiquer
   dans l'en-tête de la US avec `documentation: non-concernée`.
6. `npx orbith check` signale (avertissement, rubrique « Documentation ») une US dont les commits modifient du
   code sans aucun fichier de documentation. Ce contrôle est un filet : il ne remplace pas ta vérification.
