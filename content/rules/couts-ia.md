# Règle : coûts IA (FinOps)

Tu es un agent IA. Tu estimes honnêtement ce que ta tâche consomme, pour que l'équipe sache ce que coûte l'IA.
Cette règle est permanente et s'applique à CHAQUE tâche liée à une user story ou à un bug.

1. Estime ta consommation à la fin de chaque tâche liée à une US ou à un bug. Méthode simple : 1 jeton ≈ 4 caractères.
   - `tokens_entree` : tout ce que tu as lu pendant la tâche (fichiers, instructions, conversation), car il est
     renvoyé à chaque échange.
   - `tokens_sortie` : tout ce que tu as écrit (réponses, fichiers, commandes).
   Ce sont des estimations : arrondis, et ne prétends jamais qu'elles sont exactes.
2. Calcule le coût avec la section `finops.prix` de `.orbith/config.yaml` :
   - choisis la clé qui correspond à ta famille de modèle (par exemple `claude-sonnet`, `claude-opus`,
     `gemini-pro`, `gemini-flash`), sinon prends `defaut` ;
   - `cout = tokens_entree / 1 000 000 × entree + tokens_sortie / 1 000 000 × sortie`, arrondi à 2 décimales ;
   - la devise est `finops.devise` (par exemple EUR).
3. Ajoute UNE entrée à la fin de la liste `couts_ia` du frontmatter de la US (ou du bug) concerné :
   ```yaml
   couts_ia:
     - date: 2026-10-25
       agent: dev
       outil: claude-code
       modele: inconnu
       tache: "Implémentation des scénarios 1 et 2"
       tokens_entree: 120000
       tokens_sortie: 15000
       cout: 0.59
       devise: EUR
       source: estimé
   ```
   Si la liste est vide (`couts_ia: []`), remplace `[]` par la liste avec ta première entrée.
4. Ne modifie JAMAIS les entrées précédentes de `couts_ia` : tu n'en supprimes aucune, tu n'en changes aucune.
5. Ne touche jamais au corps de la US (description, critères, notes) pour écrire ton coût. Ajouter une entrée de coût
   ne demande pas de revalidation, car la validation porte sur le corps.
6. Mets `updated_date` à la date du jour uniquement si tu as modifié le contenu de la US. Ne modifie pas `created_date`.
7. Ne remplis JAMAIS `mis_en_prod_le`, `termine_le` ni `debut_dev_le` : ces champs sont écrits par les commandes
   `npx orbith deploiement`, jamais par un agent.
8. Si aucune US ni aucun bug n'est concerné (par exemple un brief ou un PRD), ne crée aucun fichier : donne
   l'estimation dans la conversation seulement.
9. Montre l'estimation à l'humain en une ligne, en disant clairement que c'est une estimation, par exemple :
   « Coût IA estimé pour cette tâche : environ 0,59 EUR (estimation, pas une facture). »
10. Si tu ne connais pas ton modèle, écris `modele: inconnu` et utilise la clé `defaut`. Ne devine pas le nom du modèle.
11. N'écris jamais toi-même `source: mesuré` : cette valeur est réservée aux entrées importées par un humain avec
    `npx orbith couts importer` (compteurs réels de l'outil). Ne modifie ni ne supprime ces entrées, et ne les
    recopie pas dans une estimation.
