# Audit d'Orbith par rapport à BMAD-METHOD

> Date : 2026-10-25 (mis à jour le même jour avec l'état de réalisation, voir §7). Document interne (en français, à la demande du porteur du projet).
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

Constat initial, avec son état aujourd'hui :

- `SPEC.md` §2 listait 7 agents alors que le dépôt en avait 8 : **corrigé** (la spec décrit maintenant 12 agents et 6 workflows).
- `SPEC.md` contenait un chemin local de machine : **retiré**.
- Registre des validations non protégé contre une édition manuelle : **corrigé** par les registres chaînés (§7), y compris la suppression de la dernière entrée, détectée via Git. Un humain qui réécrit tout l'historique Git reste hors de portée d'un outil local.
- Coûts IA auto-estimés (1 jeton ≈ 4 caractères) : **partiellement corrigé**. L'import des compteurs réels de Claude Code est disponible ; l'estimation reste le repli, et Gemini CLI n'a pas d'import.

## 6. Priorités

1. Version et release (`version`, `release`, CHANGELOG).
2. Demande de changement ITIL et matrice des rôles.
3. Contexte projet et check de préparation.
4. DORA enrichi (cibles, tendances, découpage de l'attente).
5. Journal d'audit chaîné et SBOM.
6. Le reste : agent Sécurité, Test Architect, rétrospective, plateformes.

## 7. État de réalisation (25 octobre 2026)

Tout ce qui suit est fusionné dans `main` (PR #1 à #9, CI verte sur 3 systèmes × 2 versions de Node). Tout est facultatif et rétrocompatible : sans configuration, un projet existant se comporte comme avant. Le détail technique est dans `docs/interne/SPEC.md`, le détail d'usage dans `docs/guide/`.

### 7.1 Les six priorités

| Priorité | Réalisé | Où |
|---|---|---|
| 1. Version et release | `orbith version` (sans numéro : proposition SemVer ; avec numéro : version et brouillon de notes), `orbith release` (CHANGELOG, notes validées, tag local annoté, jamais de push), garde-fous, étiquette `breaking`, tags atteignables uniquement | `versions.md`, SPEC §10.1 |
| 2. Demande de changement et rôles | Artefact `change`, matrice des rôles, quatre yeux, changement exigé avant `deploiement` | `changements-roles.md`, SPEC §11 |
| 3. Contexte projet et préparation | `init-context`, `preparation` (PASS / CONCERNS / FAIL) | `contexte-preparation.md`, SPEC §10.2 |
| 4. DORA enrichi | Cibles, tendances, découpage de l'attente, taille des changements, export CSV, avertissement quand aucun bug n'est déclaré | `metriques.md` |
| 5. Journal chaîné et SBOM | Registres chaînés, `orbith sbom` (CycloneDX), contrôle des licences interdites | `integrite-sbom.md`, SPEC §12 |
| 6. Le reste | Agents Sécurité et Test Architect, rétrospective, relecture adverse, changement de cap, plateforme GitHub Copilot (opt-in) | `agents-avances.md`, SPEC §13 |

### 7.2 Les manques du §2

| Manque | État |
|---|---|
| Contexte projet persistant | Fait |
| Projet existant | Fait (`init-context`) |
| Check de préparation | Fait |
| Relecture adverse | Fait (workflow) |
| Rétrospective | Fait (workflow, type `retro`) |
| Changement de cap | Fait (workflow) |
| Phase d'analyse | Fait (agent Analyste, type `analyse`) |
| Rédacteur technique, Mermaid | Fait (agent Rédacteur technique, blocs Mermaid dans les modèles) |
| Test Architect | Fait (type `strategie-test`) |
| Mode autonome borné | Fait (`orbith autopilote`, workflow `autopilote`, qui s'arrête à chaque porte humaine) |
| Création d'agents | Fait (`orbith agent new` / `agent list`, workflow `creer-agent`) |
| Plus de plateformes | GitHub Copilot ajouté, en option |
| Documents volumineux | Fait (`orbith decouper`, extraits dérivés, document source jamais modifié) |

### 7.3 Les pratiques ITIL du §3

| Pratique | État |
|---|---|
| Change Enablement | Fait |
| Release Management | Fait |
| Deployment Management | Fait : changement exigé avant la mise en production, recette enregistrée avant |
| Incident / Problem | Modèles `incident` et post-mortem |
| Service Level | Fait (clé `sla` comparée aux incidents et bugs de production : atteint, non atteint, non mesurable) |
| Risk / Security | Menaces, SBOM, licences, provenance IA |
| Continual Improvement | Fait (cibles, tendances, artefact `amelioration`, actions AMEL-NNN, `check` signale les retards) |
| Knowledge Management | Fait (champ `liens`, graphe dans `trace`) |
| Séparation des rôles | Fait |

### 7.4 Ajouts hors audit

- Règle « toute modification du code s'accompagne de la documentation » et `check` qui la contrôle.
- Taux de reprise des déploiements (5e indicateur DORA), sans niveau inventé.
- Registre de provenance IA (`orbith provenance`) et alerte `check` quand du code co-écrit par une IA est livré sans validation ni revue humaine tracée.
- Types validables supplémentaires : `menaces`, `strategie-test`, `retro`, `analyse`, `amelioration`.

### 7.5 Reste à faire et limites connues

- **Aucun agent ni workflow n'a tourné sur un vrai modèle.** Les fichiers, l'enregistrement des commandes et les commandes déterministes sont testés ; le comportement des prompts ne l'est pas.
- **`release` n'a pas été essayé sur un vrai poste Windows** (la CI le couvre sur des dépôts temporaires).
- **Versions à 4 chiffres :** `orbith version 1.1.0.0` accepte quatre chiffres, alors que `release` attend X.Y.Z. Incompatibilité possible, à confirmer et à trancher.
- **Gemini CLI :** pas d'import des coûts mesurés (format local non confirmé). Les totaux mesurés de Claude Code sont un minimum.
- **Seuils du taux d'échec** dans `metriques.md` (5 / 10 / 15 %) : ils ne correspondent pas au tableau du rapport DORA 2024. Non modifiés.
- **Non vérifiés :** rendu réel des blocs Mermaid, Copilot dans VS Code, interface interactive de `agent new`.
- **Publication npm** : il faut un `NPM_TOKEN` et un tag `v*`.
- **Ménage du dépôt :** worktrees verrouillés dans `.claude/worktrees/` et branches `worktree-agent-*`.
- **Source** : la documentation officielle de BMAD n'a jamais pu être ouverte ; les éléments du §2 marqués *(à confirmer)* le restent.
