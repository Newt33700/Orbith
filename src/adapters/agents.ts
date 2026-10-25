/** Single source of truth for the agents exposed as slash commands (SPEC §6). */
export interface AgentDef {
  key: string;
  /** File relative to `.orbith/` (and to `content/`). */
  file: string;
  /** Command name in Gemini CLI, without the leading slash (e.g. `orbith:po`). */
  gemini: string;
  /** Command name in Claude Code, without the leading slash (e.g. `orbith-po`). */
  claude: string;
  description: string;
}

export const AGENTS: AgentDef[] = [
  { key: 'guide', file: 'agents/guide.md', gemini: 'orbith:guide', claude: 'orbith', description: "Guide Orbith : où j'en suis, quoi faire ensuite, aide" },
  { key: 'po', file: 'agents/po.md', gemini: 'orbith:po', claude: 'orbith-po', description: 'Product Owner : brief, PRD, epics, US, critères Gherkin' },
  { key: 'sm', file: 'agents/sm.md', gemini: 'orbith:sm', claude: 'orbith-sm', description: 'Scrum Master / chef de projet : sprints, DoD, livraisons' },
  { key: 'ux', file: 'agents/ux.md', gemini: 'orbith:ux', claude: 'orbith-ux', description: 'UX Designer : parcours, écrans, accessibilité' },
  { key: 'architecte', file: 'agents/architecte.md', gemini: 'orbith:archi', claude: 'orbith-archi', description: 'Architecte : architecture conforme au CSR, ADR' },
  { key: 'dev', file: 'agents/dev.md', gemini: 'orbith:dev', claude: 'orbith-dev', description: 'Développeur : implémente une US validée' },
  { key: 'qa', file: 'agents/qa.md', gemini: 'orbith:qa', claude: 'orbith-qa', description: 'QA : tests Gherkin, revue, couverture des critères' },
  { key: 'devops', file: 'agents/devops.md', gemini: 'orbith:devops', claude: 'orbith-devops', description: 'DevOps : pipelines CI/CD, environnements non identiques' },
  { key: 'atelier', file: 'workflows/atelier.md', gemini: 'orbith:atelier', claude: 'orbith-atelier', description: 'Atelier : plusieurs agents discutent ensemble' },
  { key: 'securite', file: 'agents/securite.md', gemini: 'orbith:securite', claude: 'orbith-securite', description: 'Sécurité : modélisation des menaces, revue des US sensibles' },
  { key: 'test-architect', file: 'agents/test-architect.md', gemini: 'orbith:test-archi', claude: 'orbith-test-archi', description: 'Test Architect : stratégie de test par risque' },
  { key: 'retro', file: 'workflows/retro.md', gemini: 'orbith:retro', claude: 'orbith-retro', description: 'Rétrospective après livraison, à partir des métriques et des constats QA' },
  { key: 'relecture-adverse', file: 'workflows/relecture-adverse.md', gemini: 'orbith:relecture-adverse', claude: 'orbith-relecture-adverse', description: 'Relecture adverse : passe critique avant de valider PRD, architecture ou US' },
  { key: 'changement-de-cap', file: 'workflows/changement-de-cap.md', gemini: 'orbith:changement-de-cap', claude: 'orbith-changement-de-cap', description: 'Changement de cap : impact d\'un changement de besoin sur les epics et les US' },
];

export const RULES = [
  'validation-humaine',
  'confidentialite',
  'tracabilite',
  'nouvelle-session',
  'couts-ia',
  'documentation',
] as const;

export const CLAUDE_DENY = [
  'Read(./.env)',
  'Read(./.env.*)',
  'Read(./**/*.pem)',
  'Read(./**/*.key)',
  'Read(./secrets/**)',
];

export const GEMINI_IGNORE = ['.env', '.env.*', '*.pem', '*.key', 'secrets/'];
