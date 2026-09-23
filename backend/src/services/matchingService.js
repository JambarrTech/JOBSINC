const prisma = require('../config/prisma');
const { getCached, setCache } = require('../utils/cache');
const { getRedis, isRedisAvailable } = require('../config/redis');
const {
  weights,
  levelFor,
  SKILL_ALIASES,
  OPTIONAL_MARKERS,
  EDUCATION_LEVELS,
  EXPERIENCE_RANGES,
  CONTRACT_GROUPS,
  REMOTE_MODES,
  EXPERIENCE,
  EDUCATION,
  LOCATION,
  AVAILABILITY,
  OTHER,
} = require('./matching/config');

// ─────────────────────────────────────────────────────────────
// Moteur de matching candidat ↔ offre (0-100).
//
// Sept critères pondérés (voir services/matching/config.js) :
// compétences 40 % · expérience 20 % · formation 15 % ·
// localisation 10 % · contrat 5 % · disponibilité 5 % · autres 5 %.
//
// Un critère dont les données manquent d'un côté ou de l'autre est
// marqué « unknown » et EXCLU du calcul : les poids des critères
// connus sont renormalisés pour que le score final reste fidèle.
// Aucun score n'est stocké ni inventé : tout est recalculé depuis
// les données réelles. Le cache est à deux niveaux — mémoire locale
// (L1) + Redis (L2, multi-instance) — et la clé inclut updatedAt,
// donc toute modification d'une offre ou d'un profil change la clé :
// invalidation automatique sans TTL agressif.
// ─────────────────────────────────────────────────────────────

const CACHE_MAX = 800;
const MATCH_REDIS_PREFIX = 'matching:match:';
// 30 min : simple garde-fou, la clé (updatedAt) s'invalide déjà seule.
const MATCH_REDIS_TTL_SECONDS = 30 * 60;
const matchCache = new Map();

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Clé de comparaison sans ponctuation/espaces superflus. */
function compact(value) {
  return normalize(value).replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set([
  'les', 'des', 'une', 'aux', 'est', 'par', 'pour', 'avec', 'dans',
  'sur', 'and', 'the', 'ses', 'son', 'leur', 'plus', 'tout', 'maitrise',
]);

function words(phrase) {
  return new Set(
    compact(phrase)
      .split(' ')
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word)),
  );
}

function wordHits(phraseWordSet, part) {
  if (phraseWordSet.has(part)) return true;
  for (const word of phraseWordSet) {
    if (word.startsWith(part)) return true;
    // Correspondance bidirectionnelle sur les mots assez longs :
    // « logiciel » ↔ « logiciels », « dev » ↔ « développement »…
    if (part.length >= 4 && word.length >= 4 && part.startsWith(word)) return true;
  }
  return false;
}

// ── Compétences ──────────────────────────────────────────────

/** Canonise une compétence via la table d'alias. */
function canonicalSkill(raw) {
  const key = compact(raw).replace(/ /g, '');
  return SKILL_ALIASES[key] || SKILL_ALIASES[compact(raw)] || compact(raw);
}

/**
 * Sépare le texte `skills` d'une offre en exigences obligatoires et
 * souhaitées. Une ligne se terminant par un marqueur optionnel
 * (« Docker (souhaité) », « Git apprécié »…) part dans les souhaitées.
 */
function splitJobSkills(raw) {
  const required = [];
  const optional = [];
  if (!raw) return { required, optional };
  for (const line of raw.split(/[,;\n]+/)) {
    const phrase = normalize(line).replace(/\s+/g, ' ').trim().replace(/[.]+$/, '').trim();
    if (!phrase || phrase.length < 2) continue;
    const isOptional = OPTIONAL_MARKERS.some((marker) => phrase.endsWith(marker) || phrase.includes(`(${marker})`));
    (isOptional ? optional : required).push(phrase);
  }
  return { required, optional };
}

function candidateSkillTokens(raw) {
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((token) => canonicalSkill(token))
    .filter((token) => token && token.length >= 2);
}

/** Un token couvre une exigence : mots inclus/préfixes, alias déjà appliqués. */
function covers(candidateToken, requirement) {
  const requirementWords = words(requirement);
  const parts = candidateToken.split(' ').filter((part) => part.length >= 3 && !STOPWORDS.has(part));
  if (parts.length > 0 && parts.every((part) => wordHits(requirementWords, part))) return true;
  if (candidateToken.length >= 4 && requirement.includes(candidateToken)) return true;
  return false;
}

function scoreBucket(tokens, requirements) {
  let matched = 0;
  const matchedLabels = [];
  for (const requirement of requirements) {
    const hit = tokens.find((token) => covers(token, requirement));
    if (hit) {
      matched += 1;
      matchedLabels.push(hit);
    }
  }
  return {
    score: requirements.length === 0 ? null : Math.round((matched / requirements.length) * 100),
    matched,
    total: requirements.length,
    matchedLabels,
  };
}

/**
 * Score compétences = moyenne entre :
 *   - la couverture des exigences (obligatoires pondérées 75 %,
 *     souhaitées 25 %) : « combien l'offre est satisfaite » ;
 *   - la pertinence des mots-clés du candidat pour l'offre :
 *     « combien le profil est valorisé par cette offre ».
 * Les offres stockent leurs compétences en phrases libres : compter
 * uniquement les exigences fragmentées écraserait les profils à
 * mots-clés courts. Les libellés d'explication affichent les comptages
 * bruts (« X/Y obligatoires », « X/Z souhaitées »).
 */
function scoreSkills(jobSkillsRaw, candidateSkillsRaw) {
  const tokens = candidateSkillTokens(candidateSkillsRaw);
  if (tokens.length === 0) return { known: false };

  const { required, optional } = splitJobSkills(jobSkillsRaw);
  if (required.length === 0 && optional.length === 0) return { known: false };

  const req = scoreBucket(tokens, required);
  const opt = scoreBucket(tokens, optional);

  let coverage;
  if (req.total > 0 && opt.total > 0) coverage = req.score * 0.75 + opt.score * 0.25;
  else if (req.total > 0) coverage = req.score;
  else coverage = opt.score;

  const allRequirements = [...required, ...optional];
  let relevantTokens = 0;
  for (const token of tokens) {
    if (allRequirements.some((requirement) => covers(token, requirement))) relevantTokens += 1;
  }
  const relevance = allRequirements.length === 0 ? 0 : Math.round((relevantTokens / tokens.length) * 100);

  const score = Math.round(coverage * 0.5 + relevance * 0.5);

  const missingRequired = required.filter((requirement) => !req.matchedLabels.some((label) => covers(label, requirement)));
  const missingOptional = optional.filter((requirement) => !opt.matchedLabels.some((label) => covers(label, requirement)));

  const explanationParts = [];
  if (req.total > 0) explanationParts.push(`${req.matched}/${req.total} compétence${req.total > 1 ? 's' : ''} obligatoire${req.total > 1 ? 's' : ''}`);
  if (opt.total > 0) explanationParts.push(`${opt.matched}/${opt.total} souhaitée${opt.total > 1 ? 's' : ''}`);

  return {
    known: true,
    score,
    label: explanationParts.join(' · ') || null,
    matched: [...req.matchedLabels, ...opt.matchedLabels],
    missing: [...missingRequired, ...missingOptional],
  };
}

// ── Expérience ────────────────────────────────────────────────

/** « Intermédiaire », « 2-5 ans », « 3 ans » → fourchette [min, max]. */
function experienceRangeFromJob(job) {
  if (job.minExperienceYears != null || job.maxExperienceYears != null) {
    return { min: job.minExperienceYears ?? 0, max: job.maxExperienceYears ?? 45 };
  }
  const text = normalize(job.experience);
  if (!text) return null;
  const yearsMatch = text.match(/(\d+)\s*(?:[-àa]\s*(\d+))?\s*ans?/);
  if (yearsMatch) {
    return { min: Number(yearsMatch[1]), max: yearsMatch[2] ? Number(yearsMatch[2]) : Number(yearsMatch[1]) };
  }
  const range = EXPERIENCE_RANGES.find((entry) => entry.aliases.some((alias) => text.includes(normalize(alias))));
  if (range) return { min: range.min, max: range.max };
  return null;
}

function scoreExperience(job, candidateYears) {
  const range = experienceRangeFromJob(job);
  if (!range || candidateYears == null) return { known: false };
  const years = Number(candidateYears);
  if (Number.isNaN(years)) return { known: false };
  if (years >= range.min && years <= range.max) {
    return { known: true, score: 100, label: `${years} an${years > 1 ? 's' : ''} — dans la fourchette recherchée` };
  }
  const gap = years < range.min ? range.min - years : years - range.max;
  const score = Math.max(EXPERIENCE.floor, 100 - gap * EXPERIENCE.penaltyPerYear);
  const side = years < range.min ? 'en dessous' : 'au-dessus';
  return { known: true, score, label: `${years} an${years > 1 ? 's' : ''} (${side} de la fourchette ${range.min}-${range.max} ans)` };
}

// ── Formation ────────────────────────────────────────────────

function educationRank(text) {
  const value = normalize(text);
  if (!value) return null;
  // 1re passe : égalité exacte (évite que « bac+2 » soit capté par « bac »).
  for (const level of EDUCATION_LEVELS) {
    if (level.aliases.some((alias) => value === normalize(alias))) return level.rank;
  }
  // 2e passe : inclusion (« master en informatique » → master).
  for (const level of EDUCATION_LEVELS) {
    if (level.aliases.some((alias) => value.includes(normalize(alias)))) return level.rank;
  }
  return null;
}

function scoreEducation(job, profile) {
  const jobRank = educationRank(job.educationLevel);
  const candidateRank = educationRank(profile.educationLevel);
  const hasFieldData = Boolean(job.educationField || job.department) && Boolean(profile.educationField);
  if (jobRank == null && candidateRank == null && !hasFieldData) return { known: false };

  let levelScore = null;
  if (jobRank != null && candidateRank != null) {
    if (candidateRank >= jobRank) levelScore = EDUCATION.rankOk;
    else if (candidateRank === jobRank - 1) levelScore = EDUCATION.oneBelow;
    else if (candidateRank === jobRank - 2) levelScore = EDUCATION.twoBelow;
    else levelScore = EDUCATION.farBelow;
  } else if (jobRank != null && candidateRank == null) {
    // Niveau candidat non renseigné mais offre exige un niveau : on ne peut pas évaluer
    levelScore = null;
  } else if (jobRank == null && candidateRank != null) {
    // Offre sans exigence de niveau, candidat a un niveau : neutre
    levelScore = null;
  }

  let fieldScore = null;
  if (hasFieldData) {
    const jobWords = words(`${job.educationField || ''} ${job.department || ''}`);
    const candWords = words(profile.educationField);
    const hits = [...candWords].filter((word) => wordHits(jobWords, word)).length;
    fieldScore = candWords.size === 0 ? null : Math.round((hits / candWords.size) * 100);
    // Si aucun mot du domaine ne match, on considère un score faible mais pas nul
    if (fieldScore === 0) fieldScore = EDUCATION.fieldMismatch;
  }

  const parts = [];
  if (levelScore != null) parts.push(levelScore);
  if (fieldScore != null) parts.push(fieldScore);
  if (parts.length === 0) return { known: false };
  // Si on a les deux, on fait la moyenne ; sinon on prend le seul disponible
  const score = Math.round(parts.reduce((total, part) => total + part, 0) / parts.length);
  const label = score >= 80 ? 'Formation compatible' : score >= 50 ? 'Formation à évaluer' : 'Formation éloignée';
  return { known: true, score, label };
}

// ── Localisation ─────────────────────────────────────────────

function scoreLocation(job, profile, company) {
  const mode = normalize(job.workMode);
  if (mode && REMOTE_MODES.some((remote) => mode.includes(remote))) {
    return { known: true, score: LOCATION.sameCity, label: `Poste ${normalize(job.workMode).includes('hybride') ? 'hybride' : 'ouvert au télétravail'} — aucune contrainte géographique` };
  }
  const jobLocation = normalize(job.location);
  const city = normalize(profile.city);
  const country = normalize(profile.country);
  if (!jobLocation || (!city && !country)) return { known: false };
  const locationWords = words(jobLocation);
  if (city && wordHits(locationWords, city)) return { known: true, score: LOCATION.sameCity, label: profile.city };
  // Même pays que l'offre ou que l'entreprise → compatibilité partielle.
  if (country && (locationWords.has(country) || (company?.country && normalize(company.country) === country))) {
    return { known: true, score: LOCATION.sameCountry, label: `${profile.country} (même pays)` };
  }
  return { known: true, score: LOCATION.otherRegion, label: `${[profile.city, profile.country].filter(Boolean).join(', ')} — autre région que ${job.location}` };
}

// ── Contrat ──────────────────────────────────────────────────

function contractGroup(label) {
  const value = normalize(label);
  if (!value) return null;
  const group = CONTRACT_GROUPS.find((entries) => entries.some((entry) => value === entry || value.includes(entry)));
  return group ? group[0] : compact(value);
}

function scoreContract(job, profile) {
  const desired = profile.desiredContracts;
  if (!desired) return { known: false };
  const jobLabel = job.contractType || job.jobType;
  if (!jobLabel) return { known: false };
  const jobKey = contractGroup(jobLabel);
  const wantedTokens = desired.split(/[,;\n]+/).map((token) => contractGroup(token)).filter(Boolean);
  if (wantedTokens.length === 0 || !jobKey) return { known: false };
  if (wantedTokens.includes(jobKey)) {
    return { known: true, score: 100, label: `${jobLabel} accepté` };
  }
  return { known: true, score: 0, label: `Préférence(s) : ${desired} — poste en ${jobLabel}` };
}

// ── Disponibilité ────────────────────────────────────────────

function scoreAvailability(job, profile) {
  // Compare la date de début d'offre (job.startsAt) avec la disponibilité
  // du candidat (profile.availableFrom) : le critère est inactif tant que
  // l'une des deux dates est inconnue.
  const startsAt = job.startsAt ? new Date(job.startsAt) : null;
  if (!startsAt || !profile.availableFrom) return { known: false };
  const available = new Date(profile.availableFrom);
  if (Number.isNaN(available.getTime())) return { known: false };
  const diffDays = Math.round((available - startsAt) / 86400000);
  if (diffDays <= 0) return { known: true, score: AVAILABILITY.onTime, label: 'Disponible pour le démarrage' };
  if (diffDays <= AVAILABILITY.lateGraceDays) return { known: true, score: AVAILABILITY.within30Days, label: `Disponible avec ~${diffDays} j de décalage` };
  return { known: true, score: AVAILABILITY.later, label: `Disponible seulement à partir du ${available.toISOString().slice(0, 10)}` };
}

// ── Autres critères (complétude du dossier, signaux réels) ──

function scoreOther(profile) {
  const signals = [];
  let score = 0;
  if (profile.cvUrl) { score += OTHER.cv; signals.push('CV déposé'); } else signals.push('CV manquant');
  if (profile.city || profile.country) { score += OTHER.location; signals.push('Localisation renseignée'); }
  if (profile.skills && profile.skills.trim()) { score += OTHER.skills; signals.push('Compétences renseignées'); }
  return { known: true, score, label: signals.join(' · ') };
}

// ── Agrégation ───────────────────────────────────────────────

/**
 * Calcule le match complet d'un profil pour une offre.
 * Les critères inconnus sont exclus et les poids renormalisés.
 */
function computeMatch(job, profile, context = {}) {
  const company = context.company || null;
  const criteria = {
    skills: () => scoreSkills(job.skills, profile.skills),
    experience: () => scoreExperience(job, profile.experienceYears),
    education: () => scoreEducation(job, profile),
    location: () => scoreLocation(job, profile, company),
    contract: () => scoreContract(job, profile),
    availability: () => scoreAvailability(job, profile),
    other: () => scoreOther(profile),
  };

  const details = {};
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const result = criteria[key]();
    const known = Boolean(result.known);
    details[key] = { known, score: known ? result.score : null, label: result.label || null };
    if ('matched' in result) {
      details[key].matched = result.matched;
      details[key].missing = result.missing;
    }
    if (known) {
      weightedSum += result.score * weight;
      weightTotal += weight;
    }
  }

  const score = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;
  const level = levelFor(score);

  return {
    score,
    matchScore: score,
    level: level.key,
    levelLabel: level.label,
    details,
    applicationId: context.applicationId ?? null,
  };
}

// ── Cache de match (L1 mémoire + L2 Redis) ─────────────────

function redisMatchKey(key) {
  return `${MATCH_REDIS_PREFIX}${key}`;
}

function cacheLocalGet(key) {
  return matchCache.get(key);
}

function cacheLocalSet(key, value) {
  if (matchCache.size >= CACHE_MAX) {
    const oldest = matchCache.keys().next().value;
    matchCache.delete(oldest);
  }
  matchCache.set(key, value);
}

/**
 * L1 (mémoire locale) puis L2 (Redis) si disponible. Un échec Redis est
 * silencieux : le cache local reste fonctionnel et le calcul reprend.
 */
async function cacheGet(key) {
  const local = cacheLocalGet(key);
  if (local) return local;

  if (!isRedisAvailable()) return null;
  try {
    const raw = await getRedis().get(redisMatchKey(key));
    if (raw) {
      const value = JSON.parse(raw);
      cacheLocalSet(key, value);
      return value;
    }
  } catch (_) {
    // Redis intermittent : on calcule.
  }
  return null;
}

/**
 * Écrit en L1 et propage vers Redis en fire-and-forget (ne bloque pas le
 * calcul) : les autres instances récupèrent le match déjà calculé.
 */
function cacheSet(key, value) {
  cacheLocalSet(key, value);

  if (!isRedisAvailable()) return;
  try {
    getRedis()
      .set(redisMatchKey(key), JSON.stringify(value), 'EX', MATCH_REDIS_TTL_SECONDS)
      .catch(() => {});
  } catch (_) {
    // Redis intermittent : l'écriture L1 suffit.
  }
}

/** Match mis en cache ; la clé inclut updatedAt → invalidation auto. */
async function matchFor(job, profile, application, company) {
  const key = `${job.id}|${profile.id}|${new Date(job.updatedAt).getTime()}|${new Date(profile.updatedAt).getTime()}`;
  const cached = await cacheGet(key);
  if (cached) return cached;
  const computed = computeMatch(job, profile, { applicationId: application?.id ?? null, company });
  cacheSet(key, computed);
  return computed;
}

/** Format « recommandation » consommé par le dashboard entreprise. */
async function toRecommendation(job, profile, application, company) {
  const match = await matchFor(job, profile, application, company);
  return {
    id: application ? application.id : `${job.id}-${profile.id}`,
    applicationId: application ? application.id : null,
    jobId: job.id,
    jobTitle: job.title,
    candidateName: `${profile.firstName} ${profile.lastName}`.trim(),
    avatar: profile.avatarUrl || null,
    location: [profile.city, profile.country].filter(Boolean).join(', ') || null,
    skills: candidateSkillTokens(profile.skills).slice(0, 6),
    status: application?.status || null,
    contractType: job.contractType || job.jobType || null,
    ...match,
  };
}

function passesFilters(recommendation, filters = {}) {
  const minScore = Number.parseInt(filters.minScore, 10);
  if (!Number.isNaN(minScore) && recommendation.score < minScore) return false;
  if (filters.skill) {
    const needle = canonicalSkill(filters.skill);
    const haystack = candidateSkillTokens(recommendation.skills.join(','));
    if (!haystack.some((token) => token.includes(needle))) return false;
  }
  if (filters.location) {
    const needle = normalize(filters.location);
    if (!(recommendation.location || '').toLowerCase().includes(needle)) return false;
  }
  if (filters.contractType) {
    if (contractGroup(recommendation.contractType || '') !== contractGroup(filters.contractType)) return false;
  }
  return true;
}

const POOL_CACHE_TTL = 30000; // 30 s : fenêtre courte, résultats frais à moindre coût.

async function loadPool(companyId) {
  const cacheKey = `matching:pool:${companyId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Confidentialité : seuls les candidats ayant postulé aux offres de
  // l'entreprise entrent dans le pool de recommandations — mêmes règles
  // de visibilité que la liste des candidats existante.
  const jobs = await prisma.job.findMany({
    where: {
      companyId,
      isOpen: true,
      OR: [{ deadline: null }, { deadline: { gte: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // Plafond de sécurité : borne le pire cas d'un pool très actif.
  });
  if (jobs.length === 0) return { jobs: [], applications: [] };

  const applications = await prisma.application.findMany({
    where: { jobId: { in: jobs.map((job) => job.id) } },
    include: { candidate: true },
    take: 500,
  });
  const pool = { jobs, applications };
  setCache(cacheKey, pool, POOL_CACHE_TTL);
  return pool;
}

/**
 * Recommandations entreprise, toutes offres ouvertes confondues.
 * Filtres supportés : minScore, jobId, skill, location, contractType.
 */
async function getCompanyMatches(companyId, filters = {}, company = null) {
  const { jobs, applications } = await loadPool(companyId);
  const recommendations = [];
  const seen = new Set();

  for (const job of jobs) {
    if (filters.jobId && job.id !== filters.jobId) continue;
    for (const application of applications) {
      if (application.jobId !== job.id) continue;
      const profile = application.candidate;
      if (!profile || seen.has(`${job.id}:${profile.id}`)) continue;
      seen.add(`${job.id}:${profile.id}`);
      // eslint-disable-next-line no-await-in-loop -- le cache L1 rend ce coût négligeable
      const recommendation = await toRecommendation(job, profile, application, company);
      if (passesFilters(recommendation, filters)) recommendations.push(recommendation);
    }
  }

  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, 50);
}

/** Recommandations pour une offre précise (après contrôle de propriété). */
async function getJobMatches(companyId, jobId, filters = {}, company = null) {
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId } });
  if (!job) return null;
  const applications = await prisma.application.findMany({
    where: { jobId: job.id },
    include: { candidate: true },
    orderBy: { createdAt: 'desc' },
  });
  const recommendations = [];
  for (const application of applications) {
    if (!application.candidate) continue;
    // eslint-disable-next-line no-await-in-loop -- le cache L1 rend ce coût négligeable
    const recommendation = await toRecommendation(job, application.candidate, application, company);
    if (passesFilters(recommendation, filters)) recommendations.push(recommendation);
  }
  recommendations.sort((a, b) => b.score - a.score);
  return recommendations;
}

/**
 * Rétrocompatibilité : anciens appels getMatches(companyId).
 * Retourne les recommandations triées par score décroissant.
 */
async function getMatches(companyId, filters = {}, company = null) {
  return getCompanyMatches(companyId, filters, company);
}

module.exports = {
  getMatches,
  getCompanyMatches,
  getJobMatches,
  computeMatch,
};