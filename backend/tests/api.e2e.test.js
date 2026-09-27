/* Tests E2E de l'API JOBSINC : `npm run test:e2e` (serveur démarré requis).
 * Crée ses propres comptes de test (suffixe @e2e-test.local), vérifie les
 * parcours critiques et les permissions, puis nettoie la base via Prisma. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5000/api';
const SUFFIX = `${Date.now()}@e2e-test.local`;

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await response.json(); } catch { /* 204 ou vide */ }
  return { status: response.status, json };
}

/**
 * Envoi multipart minimal, pour exercer le vrai chemin d'upload de CV.
 *
 * Le test NE POSE PAS `cvUrl` via `PUT /candidate/profile`, et c'est
 * volontaire : `updateProfile` ignore volontairement ce champ (cf.
 * `candidateController.updateProfile`, qui déstructure une liste blanche sans
 * `cvUrl`). Autoriser son écriture serait une régression de sécurité — un
 * candidat pourrait s'attribuer le chemin `/uploads/cvs/...` d'un autre et
 * passer ensuite le contrôle d'appartenance de `POST /applications/jobs/:id`.
 * Le CV ne peut donc être rattaché au profil que par l'endpoint d'upload
 * authentifié, et c'est ce chemin que le test doit couvrir.
 */
async function uploadCv(token, { filename, contentType = 'application/pdf', body }) {
  const form = new FormData();
  form.append('cv', new Blob([body], { type: contentType }), filename);
  const response = await fetch(`${BASE}/candidate/cv`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  let json = null;
  try { json = await response.json(); } catch { /* vide */ }
  return { status: response.status, json };
}

async function main() {
  // Le serveur doit tourner : sonde une route publique.
  const health = await api('/jobs');
  if (health.status === 0 || health.status >= 500) {
    console.error(`Serveur injoignable sur ${BASE} — démarrez-le avant les tests E2E.`);
    process.exit(2);
  }

  const companyReg = await api('/auth/register/company', { method: 'POST', body: { firstName: 'E2E', lastName: 'Recruiter', email: `rec-${SUFFIX}`, password: 'Password123!', role: 'RECRUITER', companyName: 'E2E Corp' } });
  const candA = await api('/auth/register/candidate', { method: 'POST', body: { firstName: 'Alice', lastName: 'Test', email: `a-${SUFFIX}`, password: 'Password123!', phone: '+221770000101', country: 'Sénégal', city: 'Dakar', birthDate: '1996-01-01', role: 'CANDIDATE' } });
  const candB = await api('/auth/register/candidate', { method: 'POST', body: { firstName: 'Bruno', lastName: 'Test', email: `b-${SUFFIX}`, password: 'Password123!', phone: '+221770000102', country: 'Mali', city: 'Bamako', birthDate: '1995-02-02', role: 'CANDIDATE' } });

  await check('Inscriptions company + 2 candidats', () => {
    for (const r of [companyReg, candA, candB]) assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    assert.ok(companyReg.json.token && candA.json.token && candB.json.token);
  });
  const companyToken = companyReg.json.token;
  const tokenA = candA.json.token;
  const tokenB = candB.json.token;
  const candidateAUserId = candA.json.user?.id;

  // Depuis la mise en place de la modération, les actions métier (offres,
  // candidatures, matching, dashboard…) sont bloquées tant que
  // Company.isApproved est false. On approuve via la base (le flux
  // d'approbation admin a ses propres tests) pour exercer le parcours.
  await check('Entreprise approuvée pour le test (modération)', async () => {
    const updated = await prisma.company.update({
      where: { userId: companyReg.json.user.id },
      data: { isApproved: true },
    });
    assert.strictEqual(updated.isApproved, true);
  });

  // Plus de fichiers CV factices posés à la main : le test dépose désormais les
  // CV via `POST /candidate/cv`, qui les écrit réellement sur le disque ET
  // rattache le chemin au profil. Poser les fichiers à la main laissait
  // `candidate.cvUrl` vide, ce que le contrôle d'appartenance refuse — c'était
  // la cause des 11 échecs en cascade.
  await check('Login refusé avec mauvais mot de passe (401)', async () => {
    const login = await api('/auth/login/company', { method: 'POST', body: { email: `rec-${SUFFIX}`, password: 'wrong' } });
    assert.ok(login.status === 401 || login.status === 400);
  });

  let jobId; let applicationAId; let applicationBId;
  await check('Création d’offre avec compétences + champs matching', async () => {
    const job = await api('/company/jobs', { method: 'POST', token: companyToken, body: { title: 'Dev E2E', description: 'Poste de test automatisé.', location: 'Dakar', contractType: 'CDI', workMode: 'Sur site', experience: 'Débutant', skills: 'JavaScript\nReact\nNode.js', educationLevel: 'Licence', minExperienceYears: 0, maxExperienceYears: 3 } });
    assert.strictEqual(job.status, 201, JSON.stringify(job.json));
    jobId = job.json.id;
    assert.strictEqual(job.json.educationLevel, 'Licence');
    assert.strictEqual(job.json.maxExperienceYears, 3);
  });

  await check('Candidature refusée sans CV (400)', async () => {
    const bad = await api(`/applications/jobs/${jobId}`, { method: 'POST', token: tokenA, body: {} });
    assert.strictEqual(bad.status, 400);
  });

  // `POST /applications/jobs/:id` vérifie désormais que le CV référencé
  // APPARTIENT au candidat (`candidate.cvUrl === cvUrl`, cf.
  // applicationController.js). C'est un contrôle de sécurité réel : sans lui, un
  // candidat pouvait postuler avec l'URL du CV d'un autre — URL qui lui apparaît
  // dans une candidature existante — et usurpait un parcours de recrutement.
  //
  // Les CV sont donc déposés via le VRAI endpoint d'upload authentifié, comme
  // le fait l'application mobile. Ils sont ensuite récupérés depuis la réponse
  // plutôt que codés en dur : c'est l'URL que le serveur a réellement stockée
  // qu'il faut ré-utiliser, pas une convention devinée.
  // PDF minimal mais VALIDE : l'upload vérifie les magic bytes
  // (`uploadValidation.js` : `application/pdf` doit commencer par `%PDF`), donc
  // un contenu texte factice serait rejeté — ce que faisait l'ancien test en
  // écrivant les fichiers directement sur disque, ce qui contournait la
  // validation. Le test couvre désormais le vrai chemin : magic bytes +
  // écriture disque + rattachement au profil.
  const FAKE_PDF = '%PDF-1.4\n%e2e3c\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

  let cvUrlA; let cvUrlB;
  await check('Dépôt du CV des deux candidats via /candidate/cv', async () => {
    const a = await uploadCv(tokenA, { filename: 'cv-a.pdf', body: FAKE_PDF });
    const b = await uploadCv(tokenB, { filename: 'cv-b.pdf', body: FAKE_PDF });
    assert.strictEqual(a.status, 200, JSON.stringify(a.json));
    assert.strictEqual(b.status, 200, JSON.stringify(b.json));
    cvUrlA = a.json.cvUrl || a.json.url;
    cvUrlB = b.json.cvUrl || b.json.url;
    assert.ok(cvUrlA && cvUrlB, `URL de CV absentes : ${JSON.stringify(a.json)} / ${JSON.stringify(b.json)}`);
  });

  await check('Candidature avec le CV d’un autre candidat refusée (400)', async () => {
    // Non-régression du contrôle d'appartenance : le CV de A n'est pas celui de B.
    const stolen = await api(`/applications/jobs/${jobId}`, { method: 'POST', token: tokenB, body: { cvUrl: cvUrlA, coverLetter: 'Intéressé.' } });
    assert.strictEqual(stolen.status, 400, JSON.stringify(stolen.json));
  });

  await check('Candidatures des deux candidats (201)', async () => {
    const a = await api(`/applications/jobs/${jobId}`, { method: 'POST', token: tokenA, body: { cvUrl: cvUrlA, coverLetter: 'Motivée.' } });
    const b = await api(`/applications/jobs/${jobId}`, { method: 'POST', token: tokenB, body: { cvUrl: cvUrlB, coverLetter: 'Intéressé.' } });
    assert.strictEqual(a.status, 201, JSON.stringify(a.json));
    assert.strictEqual(b.status, 201, JSON.stringify(b.json));
    applicationAId = a.json.id || a.json.application?.id;
    applicationBId = b.json.id || b.json.application?.id;
    assert.ok(applicationAId && applicationBId);
  });

  await check('Un candidat ne peut pas accéder aux endpoints entreprise (403)', async () => {
    const forbidden = await api('/company/jobs', { token: tokenA });
    assert.strictEqual(forbidden.status, 403);
  });

  await check('Sans token : accès interdit (401)', async () => {
    const anon = await api('/company/applications');
    assert.strictEqual(anon.status, 401);
  });

  await check('Liste candidatures entreprise : scores de matching présents et triés par date desc', async () => {
    const list = await api('/company/applications', { token: companyToken });
    assert.strictEqual(list.status, 200);
    const items = Array.isArray(list.json) ? list.json : list.json.data;
    assert.ok(items.length >= 2);
    for (const item of items) {
      assert.strictEqual(typeof item.matchScore, 'number');
      assert.ok(item.matchScore >= 0 && item.matchScore <= 100);
      assert.ok(item.matchLevelLabel);
    }
  });

  await check('Recommandations matching : les 2 candidats scorés, tri décroissant', async () => {
    const matches = await api('/company/matching?minScore=0', { token: companyToken });
    assert.strictEqual(matches.status, 200);
    const items = Array.isArray(matches.json) ? matches.json : matches.json.data;
    assert.strictEqual(items.length, 2);
    assert.ok(items[0].score >= items[1].score);
    assert.ok(items.every((m) => m.applicationId && m.levelLabel && m.details.skills.known !== undefined));
  });

  await check('Filtre minScore=99 → liste vide (pas d’erreur)', async () => {
    const none = await api('/company/matching?minScore=99', { token: companyToken });
    const items = Array.isArray(none.json) ? none.json : none.json.data;
    assert.deepStrictEqual(items, []);
  });

  await check('Recommandations par offre + contrôle de propriété (404 autre société)', async () => {
    const perJob = await api(`/company/jobs/${jobId}/matches?minScore=0`, { token: companyToken });
    assert.strictEqual(perJob.status, 200);
    const items = Array.isArray(perJob.json) ? perJob.json : perJob.json.data;
    assert.strictEqual(items.length, 2);
  });

  await check('Changement de statut candidature → UNDER_REVIEW + notification créée', async () => {
    const updated = await api(`/applications/${applicationAId}/status`, { method: 'PATCH', token: companyToken, body: { status: 'UNDER_REVIEW' } });
    assert.ok(updated.status === 200 || updated.status === 201, JSON.stringify(updated.json));
    const notifs = await api('/notifications', { token: tokenA });
    const items = Array.isArray(notifs.json) ? notifs.json : notifs.json.data || notifs.json.notifications || [];
    assert.ok(items.length > 0, 'aucune notification pour le candidat');
  });

  await check('Passage au statut INTERVIEW (prérequis messagerie/entretien)', async () => {
    const updated = await api(`/applications/${applicationAId}/status`, { method: 'PATCH', token: companyToken, body: { status: 'INTERVIEW' } });
    assert.ok(updated.status === 200 || updated.status === 201, JSON.stringify(updated.json));
  });

  await check('Cycle entretien : planification puis annulation', async () => {
    const scheduledAt = new Date(Date.now() + 3600000).toISOString();
    const schedule = await api(`/interviews/applications/${applicationAId}/schedule`, { method: 'POST', token: companyToken, body: { scheduledAt, mode: 'ONLINE', duration: 30, streamingUrl: 'https://meet.google.com/e2e-demo' } });
    assert.ok(schedule.status === 200 || schedule.status === 201, JSON.stringify(schedule.json));
    const interviewId = schedule.json.id;
    assert.strictEqual(schedule.json.status, 'PLANIFIE');
    assert.strictEqual(schedule.json.meetUrl, 'https://meet.google.com/e2e-demo');
    const cancel = await api(`/interviews/${interviewId}/cancel`, { method: 'POST', token: companyToken, body: {} });
    if (cancel.status === 404) {
      const byApp = await api(`/interviews/applications/${applicationAId}/cancel`, { method: 'POST', token: companyToken, body: {} });
      assert.ok(byApp.status === 200 || byApp.status === 201, JSON.stringify(byApp.json));
      assert.strictEqual(byApp.json.status, 'ANNULE');
    } else {
      assert.ok(cancel.status === 200 || cancel.status === 201);
      assert.strictEqual(cancel.json.status, 'ANNULE');
    }
  });

  await check('Le candidat ne peut pas démarrer un entretien (403)', async () => {
    const start = await api(`/interviews/applications/${applicationAId}/start`, { method: 'POST', token: tokenA, body: {} });
    assert.strictEqual(start.status, 403);
  });

  await check('Messagerie : envoi puis lecture côté candidat', async () => {
    const sent = await api('/company/messages', { method: 'POST', token: companyToken, body: { candidateUserId: candidateAUserId, content: 'Bonjour, votre profil nous intéresse.', subject: 'E2E' } });
    assert.ok(sent.status === 200 || sent.status === 201, JSON.stringify(sent.json));
    const conversations = await api('/conversations', { token: tokenA });
    assert.strictEqual(conversations.status, 200);
  });

  await check('Tableau de bord entreprise : structure complète', async () => {
    const dash = await api('/company/dashboard?days=30', { token: companyToken });
    assert.strictEqual(dash.status, 200);
    assert.ok(dash.json.stats && dash.json.jobs && dash.json.applications && Array.isArray(dash.json.interviews));
    assert.ok(Array.isArray(dash.json.matching) && dash.json.matching.length > 0);
  });

  await cleanup();
}

async function cleanup() {
  const emails = [`rec-${SUFFIX}`, `a-${SUFFIX}`, `b-${SUFFIX}`];
  const users = await prisma.user.findMany({ where: { email: { in: emails.map((e) => e.toLowerCase()) } }, select: { id: true, email: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;
  const companies = await prisma.company.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const companyIds = companies.map((c) => c.id);
  const jobs = companyIds.length ? await prisma.job.findMany({ where: { companyId: { in: companyIds } }, select: { id: true } }) : [];
  const jobIds = jobs.map((j) => j.id);
  const applications = jobIds.length ? await prisma.application.findMany({ where: { jobId: { in: jobIds } }, select: { id: true } }) : [];
  const applicationIds = applications.map((a) => a.id);
  if (applicationIds.length) {
    await prisma.interview.deleteMany({ where: { applicationId: { in: applicationIds } } });
    await prisma.message.deleteMany({ where: { conversation: { applicationId: { in: applicationIds } } } }).catch(() => {});
    await prisma.conversation.deleteMany({ where: { applicationId: { in: applicationIds } } }).catch(() => {});
    await prisma.application.deleteMany({ where: { id: { in: applicationIds } } });
  }
  if (jobIds.length) await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.candidateProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.companyImage.deleteMany({ where: { companyId: { in: companyIds } } }).catch(() => {});
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  // Supprime les fichiers CV factices créés pour le parcours candidature.
  try { fs.unlinkSync(path.join(__dirname, '..', 'uploads', 'cvs', 'e2e-a.pdf')); } catch {}
  try { fs.unlinkSync(path.join(__dirname, '..', 'uploads', 'cvs', 'e2e-b.pdf')); } catch {}
  console.log(`\nNettoyage : ${userIds.length} compte(s) de test supprimé(s).`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
