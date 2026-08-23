// ─────────────────────────────────────────────────────────────
// Configuration centralisée du moteur de matching JOBSINC.
//
// Modifier les poids ici suffit pour rééquilibrer le score final :
// la somme des poids doit rester égale à 1 (vérifiée au chargement).
// ─────────────────────────────────────────────────────────────

const weights = {
  skills: 0.4,
  experience: 0.2,
  education: 0.15,
  location: 0.1,
  contract: 0.05,
  availability: 0.05,
  other: 0.05,
};

const weightSum = Object.values(weights).reduce((total, value) => total + value, 0);
if (Math.abs(weightSum - 1) > 1e-9) {
  throw new Error(`[matching] La somme des poids doit être 1 (actuellement ${weightSum})`);
}

// Seuil minimal pour qu'un candidat apparaisse dans les recommandations
// et niveaux de compatibilité (label affiché dans l'interface).
const MIN_SCORE_DEFAULT = 15;

const levels = [
  { key: 'excellent', min: 85, label: 'Excellent match' },
  { key: 'very_good', min: 70, label: 'Très bon match' },
  { key: 'interesting', min: 55, label: 'Match intéressant' },
  { key: 'weak', min: 40, label: 'Match faible' },
  { key: 'low', min: 0, label: 'Faible compatibilité' },
];

function levelFor(score) {
  return levels.find((level) => score >= level.min) || levels[levels.length - 1];
}

// Alias/variantes de compétences : clé = forme normalisée (sans accent,
// sans ponctuation), valeur = forme canonique normalisée.
const SKILL_ALIASES = {
  js: 'javascript',
  javascript: 'javascript',
  ecmascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  react: 'react',
  reactjs: 'react',
  reactnative: 'react native',
  vue: 'vue',
  vuejs: 'vue',
  angularjs: 'angular',
  node: 'node.js',
  nodejs: 'node.js',
  express: 'express.js',
  expressjs: 'express.js',
  nextjs: 'next.js',
  nuxtjs: 'nuxt.js',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mysql: 'mysql',
  mongo: 'mongodb',
  mongodb: 'mongodb',
  k8s: 'kubernetes',
  kubernetes: 'kubernetes',
  golang: 'go',
  py: 'python',
  python: 'python',
  flutter: 'flutter',
  dart: 'dart',
  git: 'git',
  github: 'git github',
  gitlab: 'git gitlab',
  docker: 'docker',
  aws: 'aws',
  amazonwebservices: 'aws',
  gcp: 'gcp',
  azure: 'azure',
  ci: 'intégration continue',
  cd: 'déploiement continu',
  sql: 'sql',
  nosql: 'nosql',
  rest: 'api rest',
  graphql: 'graphql',
  linux: 'linux',
  windows: 'windows',
  figma: 'figma',
  seo: 'seo',
};

// Marqueurs placés en fin de ligne dans le texte `skills` d'une offre
// pour classer une exigence comme souhaitée plutôt qu'obligatoire.
// Exemple : « Docker (souhaité) ».
const OPTIONAL_MARKERS = ['souhaité', 'souhaites', 'optionnel', 'optionnelle', 'bonus', 'apprecie', 'apprécié', 'appréciée', 'plus'];

// Échelle de formation : plus le rang est haut, plus le niveau est élevé.
const EDUCATION_LEVELS = [
  { key: 'bac', rank: 0, aliases: ['bac', 'baccalauréat', 'baccalaureat'] },
  { key: 'bac+2', rank: 1, aliases: ['bac+2', 'bac 2', 'bts', 'dut', 'deug'] },
  { key: 'licence', rank: 2, aliases: ['licence', 'bac+3', 'bac 3', 'l3'] },
  { key: 'maitrise', rank: 3, aliases: ['maîtrise', 'maitrise', 'bac+4', 'bac 4', 'm1'] },
  { key: 'master', rank: 4, aliases: ['master', 'bac+5', 'bac 5', 'm2', 'ingénieur', 'ingenieur', 'diplôme d\'ingénieur', 'diplome d\'ingenieur', 'grandes écoles', 'grandes ecoles'] },
  { key: 'doctorat', rank: 5, aliases: ['doctorat', 'phd', 'doctorate'] },
];

// Correspondance approximative entre un intitulé d'expérience d'offre
// (« Débutant », « Intermédiaire », « Confirmé », « Senior », « 2-5 ans »…)
// et une fourchette d'années.
const EXPERIENCE_RANGES = [
  { aliases: ['débutant', 'debutant', 'junior', 'stagiaire', 'stage'], min: 0, max: 2 },
  { aliases: ['intermédiaire', 'intermediaire', 'intermediate'], min: 1, max: 5 },
  { aliases: ['confirmé', 'confirme', 'confirmed'], min: 3, max: 8 },
  { aliases: ['senior', 'sénior', 'expert'], min: 5, max: 15 },
];

// Groupes d'équivalence contrat/type de poste (valeurs constatées en base :
// contractType « CDD », « Stage », « CDI »… ; jobType FULL_TIME/PART_TIME/
// INTERNSHIP/FREELANCE ; workMode « Sur site »…).
const CONTRACT_GROUPS = [
  ['stage', 'internship'],
  ['cdi', 'temps plein', 'full_time', 'full time'],
  ['cdd'],
  ['temps partiel', 'part_time', 'part time'],
  ['freelance'],
  ['alternance', 'apprentissage'],
];

// Modes de travail considérés comme ouverts à la distance : la
// localisation du candidat ne doit pas pénaliser le score.
const REMOTE_MODES = ['télétravail', 'teletravail', 'remote', 'hybride', 'hybrid', 'à distance', 'a distance'];

// Matching sémantique (embeddings) : emplacement réservé. Le moteur
// fonctionne intégralement en déterministe sans API externe ; brancher
// ici une fonction de similarité (null = désactivé) suffira à l'activer.
const semantic = {
  enabled: false,
  // similarity(textA, textB) => 0..1 | null
  similarity: null,
};

module.exports = {
  weights,
  levels,
  levelFor,
  SKILL_ALIASES,
  OPTIONAL_MARKERS,
  EDUCATION_LEVELS,
  EXPERIENCE_RANGES,
  CONTRACT_GROUPS,
  REMOTE_MODES,
  MIN_SCORE_DEFAULT,
  semantic,
};
