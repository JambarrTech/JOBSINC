/* Tests du moteur de matching : `npm test` (node tests/matching.test.js). */
const assert = require('assert');
const { computeMatch } = require('../src/services/matchingService');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

const baseJob = {
  id: 'job', title: 'Dev', updatedAt: new Date(),
  skills: 'React\nNode.js\nPostgreSQL\nGit',
  experience: null, minExperienceYears: null, maxExperienceYears: null,
  educationLevel: null, workMode: 'Sur site', location: 'Dakar',
  contractType: 'CDI', jobType: 'FULL_TIME',
};
const baseProfile = {
  id: 'p1', firstName: 'Test', lastName: 'User', updatedAt: new Date(),
  skills: 'React, Node.js, PostgreSQL, Git', city: 'Dakar', country: 'Sénégal',
  cvUrl: '/cv.pdf', experienceYears: null, educationLevel: null,
  educationField: null, desiredContracts: null, availableFrom: null,
};

// Offre et profil qui couvrent TOUS les critères du barème.
//
// `baseJob` ne spécifie ni fourchette d'expérience, ni niveau de formation,
// ni date de début : ces trois critères sont alors INCONNUS par construction
// (l'offre ne demande rien, donc il n'y a rien à comparer), et `baseProfile`
// ne renseigne que les compétences, la localisation et le CV — soit 0.55 de
// couverture. C'est volontaire : ces deux fixtures servent à tester le
// comportement sur un dossier PARTIEL.
//
// `fullJob` / `fullProfile` existent pour le cas inverse, qui doit rester
// possible : un dossier complet qui obtient 100. Sans eux, impossible de
// distinguer « la couverture n'a abaissé que les scores excessifs » de
// « la couverture a abaissé tous les scores, y compris les justes ».
const fullJob = {
  ...baseJob,
  minExperienceYears: 2,
  maxExperienceYears: 5,
  educationLevel: 'Master',
  startsAt: new Date('2026-09-01'),
};
const fullProfile = {
  ...baseProfile,
  experienceYears: 3,
  educationLevel: 'Master',
  educationField: 'Informatique',
  desiredContracts: 'CDI',
  availableFrom: new Date('2026-08-15'),
};

const scoreOf = (job, profile) => computeMatch(job, profile).score;

console.log('— Compétences —');
check('100 % des compétences obligatoires', () => {
  const m = computeMatch(baseJob, baseProfile);
  assert.strictEqual(m.details.skills.score, 100);
});
check('50 % des compétences (2/4)', () => {
  const m = computeMatch(baseJob, { ...baseProfile, skills: 'React, Git' });
  assert.strictEqual(m.details.skills.score, 75); // couverture 50 % × 0,5 + pertinence 100 % × 0,5
  assert.strictEqual(m.details.skills.missing.length, 2);
});
check('Aucune compétence → critère inconnu (renormalisé)', () => {
  const m = computeMatch(baseJob, { ...baseProfile, skills: '' });
  assert.strictEqual(m.details.skills.known, false);
});
check('Alias : JS=JavaScript, TS=TypeScript, Node=Node.js', () => {
  const m = computeMatch(
    { ...baseJob, skills: 'JavaScript\nTypeScript\nNode.js' },
    { ...baseProfile, skills: 'JS, TS, Node' },
  );
  assert.strictEqual(m.details.skills.score, 100);
});
check('Compétences souhaitées comptées à part (« Docker apprécié »)', () => {
  const m = computeMatch(
    { ...baseJob, skills: 'React\nNode.js\nDocker apprécié' },
    { ...baseProfile, skills: 'React, Node.js' },
  );
  assert.strictEqual(m.details.skills.score, 88); // couverture 75 (manque l'optionnelle) × 0,5 + pertinence 100 × 0,5
});

console.log('— Expérience —');
check('Expérience dans la fourchette (2-5 ans, candidat 3 ans)', () => {
  const m = computeMatch({ ...baseJob, experience: '2-5 ans' }, { ...baseProfile, experienceYears: 3 });
  assert.strictEqual(m.details.experience.score, 100);
});
check('Niveau texte « Confirmé » ↔ 5 ans d’expérience', () => {
  const m = computeMatch({ ...baseJob, experience: 'Confirmé' }, { ...baseProfile, experienceYears: 5 });
  assert.strictEqual(m.details.experience.score, 100);
});
check('Expérience insuffisante pénalisée mais non nulle', () => {
  const m = computeMatch({ ...baseJob, minExperienceYears: 5, maxExperienceYears: 8 }, { ...baseProfile, experienceYears: 2 });
  assert.ok(m.details.experience.score > 0 && m.details.experience.score < 100);
});
check('Expérience très supérieure : score plancher 20', () => {
  const m = computeMatch({ ...baseJob, experience: 'Débutant' }, { ...baseProfile, experienceYears: 12 });
  assert.strictEqual(m.details.experience.score, 20);
});

console.log('— Formation —');
check('Licence demandée, Licence candidate → 100', () => {
  const m = computeMatch({ ...baseJob, educationLevel: 'Licence', department: 'Informatique' }, { ...baseProfile, educationLevel: 'Licence', educationField: 'Informatique' });
  assert.strictEqual(m.details.education.score, 100);
});
check('Master demandé, Bac+2 candidat → pénalisé', () => {
  const m = computeMatch({ ...baseJob, educationLevel: 'Master' }, { ...baseProfile, educationLevel: 'BTS' });
  assert.ok(m.details.education.score < 70);
});
check('Un niveau en dessous de la demande → 60', () => {
  const m = computeMatch({ ...baseJob, educationLevel: 'Licence' }, { ...baseProfile, educationLevel: 'Bac+2' });
  assert.strictEqual(m.details.education.score, 60);
});
check('Candidat surqualifié (Master pour une Licence) → non pénalisé', () => {
  const m = computeMatch({ ...baseJob, educationLevel: 'Licence' }, { ...baseProfile, educationLevel: 'Master' });
  assert.strictEqual(m.details.education.score, 100);
});
check('Domaines proches (Génie logiciel ≈ Informatique)', () => {
  const m = computeMatch({ ...baseJob, department: 'Développement logiciel' }, { ...baseProfile, educationField: 'Génie logiciel informatique' });
  assert.ok(m.details.education.known && m.details.education.score >= 30);
});

console.log('— Localisation —');
check('Même ville → 100', () => {
  assert.strictEqual(computeMatch(baseJob, baseProfile).details.location.score, 100);
});
check('Même pays seulement (via entreprise) → 70', () => {
  const m = computeMatch(baseJob, { ...baseProfile, city: 'Thiès' }, { company: { country: 'Sénégal' } });
  assert.strictEqual(m.details.location.score, 70);
});
check('Télétravail : aucune pénalité géographique', () => {
  const m = computeMatch({ ...baseJob, workMode: 'Télétravail' }, { ...baseProfile, city: 'Saint-Louis' });
  assert.strictEqual(m.details.location.score, 100);
});
check('Autre région → score faible', () => {
  const m = computeMatch(baseJob, { ...baseProfile, city: 'Abidjan', country: 'Côte d’Ivoire' });
  assert.strictEqual(m.details.location.score, 20);
});

console.log('— Contrat & disponibilité —');
check('Contrat accepté → 100', () => {
  const m = computeMatch(baseJob, { ...baseProfile, desiredContracts: 'CDI, CDD' });
  assert.strictEqual(m.details.contract.score, 100);
});
check('Contrat refusé → 0', () => {
  const m = computeMatch({ ...baseJob, contractType: 'Stage', jobType: 'INTERNSHIP' }, { ...baseProfile, desiredContracts: 'CDI' });
  assert.strictEqual(m.details.contract.score, 0);
});
check('Stage ↔ INTERNSHIP équivalents', () => {
  const m = computeMatch({ ...baseJob, contractType: 'Stage', jobType: 'INTERNSHIP' }, { ...baseProfile, desiredContracts: 'Stage' });
  assert.strictEqual(m.details.contract.score, 100);
});
check('Disponibilité alignée sur la date de début → 100', () => {
  const soon = new Date(Date.now() + 86400000).toISOString();
  const m = computeMatch({ ...baseJob, startsAt: soon }, { ...baseProfile, availableFrom: new Date().toISOString() });
  assert.strictEqual(m.details.availability.score, 100);
});

console.log('— Agrégation & cas limites —');
// Ces trois tests verrouillent le contrat « score = renormalisé × couverture ».
// Ils ont été réécrits : ils assertaient l'ancien contrat (moyenne
// renormalisée seule), longtemps après que `computeMatch` a introduit la
// couverture. Cf. le commentaire de couverture dans `matchingService.js`
// (`computeMatch`) pour le défaut corrigé : un profil qui ne renseignait que
// 55 % du barème — et le faisait à 100 % sur ces critères — était présenté
// comme « Excellent match », devant un candidat complet et honnêtement en
// dessous. Un de ces tests doit échouer si la couverture est retirée.
check('Score final borné 0-100 = renormalisé × couverture', () => {
  const m = computeMatch(baseJob, baseProfile);
  assert.ok(m.score >= 0 && m.score <= 100);
  // Critères connus de `baseProfile` : skills(.40), location(.10), other(.05)
  // = 0.55 de couverture, tous à 100.
  assert.strictEqual(m.coverage, 0.55);
  // Renormalisé = 100, puis multiplié par la couverture : 55. L'ancien test
  // attendait 100, c'est-à-dire « compatibilité parfaite » pour un profil que
  // personne n'a evalué sur l'expérience, la formation, le contrat ni la
  // disponibilité.
  assert.strictEqual(m.score, Math.round(100 * 0.55));
  assert.strictEqual(m.score, 55);
});
check('Couverture complète : le score n’est PAS pénalisé', () => {
  // La contrepartie obligatoire de la couverture : un profil qui renseigne
  // TOUT le barème doit obtenir 100, sinon la correction aurait simplement
  // abaissé tous les scores. Aucune assertion ne verrouillait ce cas.
  const m = computeMatch(fullJob, fullProfile);
  assert.strictEqual(m.coverage, 1);
  assert.strictEqual(m.score, 100);
  assert.strictEqual(m.levelLabel, 'Excellent match');
  for (const [key, detail] of Object.entries(m.details)) {
    assert.strictEqual(detail.known, true, `le critère ${key} doit être connu`);
  }
});
check('Profil quasi vide → score plancher 0 mais calculable', () => {
  const empty = { ...baseProfile, skills: '', city: '', country: '', cvUrl: null };
  const m = computeMatch(baseJob, empty);
  assert.strictEqual(m.score, 0); // seul « autres » connu et vide
});
check('Niveaux de compatibilité corrects', () => {
  // « Excellent match » est réservé aux profils COMPLETS : c'est la garantie
  // produit du score. `baseProfile` n'en est pas un (couverture 0.55), donc
  // l'assertion porte sur `fullProfile`/`fullJob`.
  assert.strictEqual(computeMatch(fullJob, fullProfile).levelLabel, 'Excellent match');
  // Dossier complet mais compétences hors sujet : la couverture est là, donc
  // seul le score réel doit baisser — 60, soit « Match intéressant ».
  const mismatched = computeMatch(fullJob, { ...fullProfile, skills: 'Cuisine' });
  assert.strictEqual(mismatched.coverage, 1);
  assert.strictEqual(mismatched.score, 60);
  assert.strictEqual(mismatched.levelLabel, 'Match intéressant');
  // Profil quasi vide : plancher, pas « excellent ».
  const weak = computeMatch(baseJob, { ...baseProfile, skills: 'Cuisine' });
  assert.ok(['Faible compatibilité', 'Match faible', 'Match intéressant'].includes(weak.levelLabel));
  assert.notStrictEqual(weak.levelLabel, 'Excellent match');
});
check('Candidat sans CV signalé dans « autres »', () => {
  const m = computeMatch(baseJob, { ...baseProfile, cvUrl: null });
  assert.ok(m.details.other.label.includes('CV manquant'));
  assert.strictEqual(m.details.other.score, 50);
});

console.log(process.exitCode ? `\n${passed} test(s) passé(s), échecs ci-dessus.` : `\nOK : ${passed} tests passés.`);
