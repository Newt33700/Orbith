# Audit d'Orbith par rapport à BMAD-METHOD

> Date : 2026-10-25. Document interne (en français, à la demande du porteur du projet).
> Sources : lecture du dépôt Orbith (README, `SPEC.md`, agents, workflows, règles, templates, CI) et page GitHub
> de [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD). La documentation officielle de BMAD n'a pas pu
> être ouverte : les éléments marqués *(à confirmer)* viennent de sources secondaires.

## 1. Ce qui est bien chez Orbith

| Point fort | Pourquoi c'est solide |
|---|---|
| Validation humaine inviolable | `orbith valider` enregistre qui, quand et le hash du contenu ; un document modifié après validation est détecté. BMAD n'a rien d'équivalent. |
| IA / déterministe séparés | `next`, `check`, `trace`, `tests`, `metriques`, `audit` fonctionnent sans IA : reproductible, auditable, gratuit. |
| CSR (référentiel technique) | Contrôle de conformité aux outils et versions de l'entreprise. Absent de BMAD. |
| Traçabilité US → commit → test → livraison | Exactement ce que demandent les auditeurs ITIL. |
| DORA + FinOps | 4 métriques DORA, métrique « attente », coûts IA par US. |
| Une tâche = une session | Bonne hygiène de contexte, rappelée à chaque fin de tâche. |
| Cœur unique, adaptateurs fins | Gemini et Claude servis sans dupliquer les prompts. |
| Confidentialité | Règles dédiées, `deny` des fichiers sensibles, scan de secrets dans `check`. |
| `audit` HTML pour comité | Directement utilisable en gouvernance. |
| Trois pistes (correctif / évolution / projet) | Version simple du « scale-adaptive » de BMAD. |
| Agents à portes | Prérequis vérifiés, 2 à 3 options proposées, jamais d'auto-approbation. |
| Qualité du dépôt | CI 3 OS × 2 Node, release npm, tests e2e, spec interne. |

## 2. Ce qu'il manque par rapport à BMAD

Confirmé sur la page GitHub : trois pistes (Quick Flow, BMad Method, Enterprise), modules Builder, Creative
Intelligence Suite, Test Architect, boucle « apprendre et ajuster ». À confirmer : Party Mode, check de préparation
(PASS / CONCERNS / FAIL), contexte projet persistant.

| Manque | Détail |
|---|---|
| Contexte projet persistant | Pas de « constitution » du projet (conventions, patterns, pièges) lue par tous les agents. |
| Projet existant (brownfield) | Aucun agent ne cartographie un code existant avant une évolution. |
| Check de préparation | Pas de contrôle de cohérence brief → PRD → archi → epics → US avec verdict. |
| Relecture adverse | Pas de passe critique obligatoire sur story, archi ou code. |
| Rétrospective | Rien ne recueille le retour d'expérience après livraison. |
| Changement de cap | Pas de gestion de l'impact d'un changement de besoin en cours de route. |
| Phase d'analyse | Pas de brainstorming ni de recherche structurés avant le brief. |
| Rédacteur technique | Pas d'agent de documentation, pas de diagrammes Mermaid dans les modèles. |
| Test Architect | La QA couvre les critères ; pas de stratégie de test par risque. |
| Mode autonome borné | Tout est pas à pas ; pas d'« autopilote » entre deux portes humaines. |
| Création d'agents | `custom/` existe, pas d'assistant de création. |
| Plus de plateformes | Seulement Gemini et Claude. |
| Documents volumineux | Un PRD de 40 pages entre en entier dans le contexte. |

## 3. Regard ITIL 4

| Pratique | État | À faire |
|---|---|---|
| Change Enablement | Pas de demande de changement | Artefact `change` (standard / normal / urgent), risque, retour arrière, fenêtre, approbateurs |
| Release Management | Notes de version seulement | `orbith version` / `orbith release`, CHANGELOG, tag |
| Deployment Management | Production enregistrée après coup | Enregistrer aussi la recette ; exiger la recette avant la production |
| Incident / Problem | Modèle de bug | Modèle d'incident + post-mortem sans blâme |
| Service Level | Rien | Objectifs de service dans la config, comparés aux métriques |
| Risk / Security | Scan de secrets | Licences, SBOM, modélisation des menaces |
| Continual Improvement | DORA sans cible | Cibles, tendances, registre d'amélioration |
| Knowledge Management | ADR et documents | Liens incidents ↔ bugs ↔ ADR ↔ retours d'expérience |
| Séparation des rôles | Un humain peut tout valider | Matrice des rôles, principe des quatre yeux |

## 4. Idées d'innovation

**A. Gestion des versions** : `orbith version` (SemVer proposé depuis les commits et US), `orbith release` (tag,
CHANGELOG, notes), garde-fous (pas de version avec US non terminée, `check` en erreur ou notes non validées), notes
« utilisateur » et « exploitation », étiquette `breaking`.

**B. DORA enrichi** : cibles et tendances, découpage du temps d'attente (revue / recette / production), taille des
changements, export JSON/CSV, rappel que DORA mesure une équipe et non des personnes. Une dimension « fiabilité »
a été ajoutée aux métriques DORA *(à confirmer avant reprise)*.

**C. Gouvernance** : demande de changement, matrice des rôles, journal d'audit chaîné (le registre
`validations.json` peut aujourd'hui être édité à la main), contrôle des licences et SBOM, registre de provenance IA.

**D. Qualité et sécurité** : agent Sécurité (menaces), Test Architect, relecture adverse, check de préparation.

**E. Expérience** : `orbith init-context` (projet existant), `orbith doctor`, `orbith retro`, davantage de
plateformes, publication npm.

## 5. Points d'attention dans le code actuel

- `SPEC.md` §2 liste 7 agents alors que le dépôt en a 8 (DevOps).
- `SPEC.md` contient un chemin local de machine (`/private/tmp/claude-501/...`) à retirer avant publication.
- Registre des validations non protégé contre une édition manuelle.
- Les coûts IA sont auto-estimés par les agents (1 jeton ≈ 4 caractères) : ordre de grandeur, pas une mesure.

## 6. Priorités

1. Version et release (`version`, `release`, CHANGELOG).
2. Demande de changement ITIL et matrice des rôles.
3. Contexte projet et check de préparation.
4. DORA enrichi (cibles, tendances, découpage de l'attente).
5. Journal d'audit chaîné et SBOM.
6. Le reste : agent Sécurité, Test Architect, rétrospective, plateformes.
