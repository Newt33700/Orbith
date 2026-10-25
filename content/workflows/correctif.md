# Piste « Correctif »

> **Pour qui, pour quoi ?** Tu dois corriger un défaut précis dans un logiciel qui existe déjà : un bouton qui ne
> répond plus, un calcul faux, un message d'erreur incompréhensible. Le périmètre est petit et connu.
> C'est la piste la plus courte d'Orbith.

**Ne convient pas si** la correction impose de changer la structure du logiciel ou d'ajouter une vraie
nouveauté : passe alors en piste **évolution**. Demande conseil à `/orbith:guide` (Gemini) ou `/orbith`
(Claude).

Légende : 🔒 = **point de validation humaine** : rien n'avance tant qu'une personne n'a pas relu et validé.

## Les étapes

| # | Étape | Qui | Commande | Ce qui est produit |
|---|---|---|---|---|
| 1 | Décrire le défaut : une **US courte** avec au moins un critère Gherkin (modèle de bug : origine, cause, date de détection) | PO | `/orbith:po` · `/orbith-po` | `backlog/tasks/us-NNN - <Titre>.md` (brouillon) |
| 1 🔒 | **Relire et valider** la US | Toi | `npx orbith valider "backlog/tasks/us-NNN - <Titre>.md"` | `statut: validé` |
| 2 | Contrôler la DoR et passer la US en `Prête` | Toi (PO humain) | colonne du tableau → `Prête` | US prête à être développée |
| 3 | Écrire les tests puis corriger le code | Dev | `/orbith:dev US-NNN` · `/orbith-dev US-NNN` | Tests `@US-NNN`, code, documentation à jour si concernée, commits `fix(US-NNN): …` |
| 4 | Vérifier les tests et la conformité | Dev + QA | `/orbith:qa US-NNN` · `/orbith-qa US-NNN` ; `npx orbith check` | Rapport de QA |
| 5 🔒 | **Revue humaine** du correctif ; si c'est bon, la US passe en `Terminée` | Toi | colonne du tableau → `Terminée` | US terminée |
| 6 🔒 | Après la mise en production réelle du correctif : enregistrer la date de mise en production | Toi | `npx orbith deploiement <version>` | Date de mise en production (mesure du temps de rétablissement) |

Pour livrer, si besoin : `/orbith:sm` · `/orbith-sm` (notes de version).

## Détail des étapes

**1. US courte.** Le PO te pose quelques questions, une à la fois : ce qui se passe aujourd'hui, ce qui devrait se
passer, comment reproduire le défaut. Il écrit une US de quelques lignes et au moins **un scénario Gherkin** qui
décrit le comportement attendu après correction (par exemple : « Étant donné… Quand… Alors… »). Il n'invente rien :
ce qu'il ne sait pas est marqué « À confirmer ».

Quand le défaut vient d'une livraison (production, recette ou interne), le PO utilise le modèle de **bug**, qui ajoute
trois champs : `origine` (`production`, `recette` ou `interne`), `detecte_le` (la date où le défaut a été constaté) et
`cause` (la US dont la livraison a introduit le défaut, si on la connaît). Il te les demande un par un et ne les
devine jamais. Ces trois informations servent à calculer le taux d'échec des livraisons et le temps de rétablissement
(`npx orbith metriques`).

**1 🔒. Ta validation.** Relis la US. Elle dit bien ce que tu veux ? Alors lance `npx orbith valider`. Sinon,
demande des changements au PO. Le développeur refusera de commencer sans cette validation.

**2. Prête.** Vérifie la liste « Definition of Ready » de la US (`.orbith/config/dor.md`). Quand tout est vrai, passe
la carte en `Prête`.

**3. Correction.** Le développeur travaille sur **une seule US**. Il commence par un test qui reproduit le défaut
(il doit échouer), puis corrige, puis vérifie que le test passe. Il commit avec `fix(US-NNN): …`. S'il doit faire
un choix technique important, il te propose 2 ou 3 options et attend ta réponse.

**4. Contrôles.** Les tests sont lancés, `npx orbith check` vérifie le référentiel de l'entreprise (CSR), les
validations et les secrets. La QA contrôle que chaque critère est couvert et te remet un rapport. Elle n'approuve
jamais : **tu décides**.

**5 🔒. Revue.** Tu relis le correctif et le rapport. Satisfait : carte en `Terminée`. Sinon, la US retourne au
développeur.

## Règle d'or : une nouvelle session entre chaque étape

À la fin de chaque étape, **ouvre une nouvelle session** (ou tape `/clear`) avant de lancer la suivante. Chaque agent
repart ainsi avec un contexte propre et reste performant. Les documents du projet gardent la mémoire du travail, pas
la conversation.

En cas de doute à n'importe quel moment : `npx orbith next` t'indique l'étape suivante.

💡 Tâche terminée ? Ouvre une NOUVELLE session (ou tape `/clear`) avant la suivante : l'agent repart avec un contexte propre et reste performant.
