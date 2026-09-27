import { test } from 'node:test';
import assert from 'node:assert/strict';

// L'origine de production est PINSEE avant tout import : `api-url.ts` calcule
// `API_ORIGIN` au chargement du module, et les imports ESM sont hoistes au-
// dessus de toute instruction. Sans cette ligne, le test dependrait de
// l'environnement local — or le REPLI de `api-url.ts` est
// `https://jobsinc.onrender.com`, ce qui rendrait « Render » une origine de
// confiance en test et non en production. C'est exactement la confusion qui
// produit des tests qui passent et un site qui affiche des images cassees.
process.env.NEXT_PUBLIC_API_URL = 'https://api.jobsinc.com/api';

const { assetUrl, cvHref } = await import('../lib/assets.ts');
const { API_ORIGIN } = await import('../lib/api-url.ts');

assert.equal(API_ORIGIN, 'https://api.jobsinc.com', 'origine de production pinsee');

const BUCKET = 'jobsinc-media';
const HOTE_RENDER = 'https://jobsinc-backend.onrender.com';

/**
 * BUG VERROUILLE — « les CV ne s'ouvrent pas et les photos ne s'affichent pas ».
 *
 * Deux defauts distincts, memes symptomes cote entreprise :
 *
 *  1. `assetUrl` / `cvHref` renvoyaient `null` pour TOUTE URL absolue dont
 *     l'origine n'etait pas exactement `API_ORIGIN`. Or le backend produisait
 *     des URL absolues sur l'hote qu'il croyait etre le sien : sans `APP_URL`
 *     (absente du Blueprint `render.yaml`), `absoluteUrl` retombe sur
 *     l'en-tete `Host`, c'est-a-dire l'hote Render. L'API annonait donc les
 *     images sur `…onrender.com`, que le web `entreprise` rejetait. Le mobile,
 *     dont `resolveUrl` renvoie les URL absolues telles quelles, les affichait
 *     encore — d'ou une asymetrie inexpliquee.
 *
 *  2. Un `cvUrl` en URL absolue non fiable rendait `null`, et le rendu fait
 *     `{resolvedCvHref && (<a …>Ouvrir le CV</a>)}` : le BLOC ENTIER ne sortait
 *     pas. Le bouton n'existait pas — on ne pouvait donc meme pas constater
 *     l'erreur.
 *
 * Le correctif re-pointe ces URL vers `API_ORIGIN` au lieu de les refuser : on
 * ne charge TOUJOURS pas depuis l'hote tiers, on exige `/uploads/`, donc la
 * protection anti-exfiltration est intacte.
 */

test('un chemin relatif /uploads/ est complete par API_ORIGIN', () => {
  assert.equal(assetUrl('/uploads/candidates/a.jpg'), `${API_ORIGIN}/uploads/candidates/a.jpg`);
  assert.equal(cvHref('/uploads/cvs/a.pdf'), `${API_ORIGIN}/uploads/cvs/a.pdf`);
});

test('une URL absolue deja sur API_ORIGIN est conservee telle quelle', () => {
  const u = `${API_ORIGIN}/uploads/candidates/a.jpg`;
  assert.equal(assetUrl(u), u);
});

test('une URL absolue /uploads/ sur un hote tiers est re-pointee (defaut 1)', () => {
  // Ces URL absolues ont un chemin `/uploads/...` : c'est la signature de
  // `absoluteUrl` qui transformait un chemin applicatif en URL absolue sur
  // l'hote que le backend croyait etre le sien. Sans `APP_URL` (absente du
  // Blueprint `render.yaml`), cet hote etait celui de Render. Elles donnaient
  // toutes `null` avant le correctif.
  const heritees = [
    `${HOTE_RENDER}/uploads/candidates/a.jpg`,
    'https://api.ancien-domaine.test/uploads/candidates/a.jpg',
  ];
  for (const u of heritees) {
    assert.equal(
      assetUrl(u),
      `${API_ORIGIN}/uploads/candidates/a.jpg`,
      `attendu : ${u} doit finir sur API_ORIGIN`
    );
  }
});

test('un CV herite redevient cliquable, donc le bouton existe (defaut 2)', () => {
  // Le point critique : AVANT, ceci valait `null` et le bloc du bouton etait
  // omis du rendu. Aucune erreur visible, juste un bouton absent.
  const u = `${HOTE_RENDER}/uploads/cvs/a.pdf`;
  const href = cvHref(u);
  assert.ok(href, 'cvHref ne doit plus rendre null pour un CV herite');
  assert.equal(href, `${API_ORIGIN}/uploads/cvs/a.pdf`);
});

test('une URL S3 sans /uploads/ dans le chemin est REFUSEE ici, pas reconstruite', () => {
  // Limite VOLONTAIRE, et non oubli : une URL S3 virtuelle-host porte un
  // chemin `/candidates/a.jpg`, sans le prefixe `/uploads/`. Deviner la cle
  // S3 supposerait de faire confiance a la structure de chemins d'un hote
  // arbitraire — precisement le canal d'exfiltration que la protection
  // anti-exfiltration ferme. Le frontend refuse donc.
  //
  // Ces enregistrements la sont corriges par le SERVEUR : `canonicalUploadPath`
  // (backend/src/services/storageService.js) s'appuie sur `s3KeyFromStoredUrl`,
  // qui, lui, connait le bucket, et renvoie `/uploads/<cle>`. Le client
  // recoit alors un chemin relatif et n'a plus rien a deviner.
  const s3 = [
    `https://${BUCKET}.s3.eu-west-1.amazonaws.com/candidates/a.jpg`,
    `https://s3.eu-west-1.amazonaws.com/${BUCKET}/cvs/a.pdf`,
  ];
  for (const u of s3) {
    assert.equal(assetUrl(u), null);
    assert.equal(cvHref(u), null);
  }
});

test('la protection anti-exfiltration est INTACTE', () => {
  // Un logo hostile stocke en base doit rester non charge. C'est la raison pour
  // laquelle on ne peut pas simplement accepter toute URL absolue.
  // Ces chemins ne designent PAS un fichier d'upload : rien a re-pointer vers
  // notre backend, donc refus.
  const hostiles = [
    'https://pixels-tracker.example.com/logo.png',
    'https://evil.test/anything',
    'https://evil.test/logo.png?steal=1',
    'https://evil.test/images/logo.png',
  ];
  for (const u of hostiles) {
    assert.equal(assetUrl(u), null, `${u} ne doit jamais etre charge tel quel`);
  }
  // Un CV sur un hote tiers n'est PAS refuse : il est re-pointe vers notre
  // backend. L'origine tierce n'est jamais contactee, et le fichier passe donc
  // par `uploadAuth` — ce qui est plus strict, pas moins.
  const cv = cvHref('https://evil.test/uploads/cvs/a.pdf');
  assert.ok(cv, 'doit produire une URL');
  assert.equal(new URL(cv as string).origin, API_ORIGIN);
  assert.ok(!(cv as string).includes('evil.test'));
});

test('une URL /uploads/ sur un hote tiers est re-pointee, JAMAIS chargee depuis lui', () => {
  // Point de surete central du re-pointage : on peut reecrire l'hote parce
  // qu'on n'atteint JAMAIS l'hote tiers. Un logo « pirate » stocke en base ne
  // devient donc pas un pixel de suivi : le navigateur demande le fichier a
  // NOTRE backend, et obtient notre fichier (ou un 403 de `uploadAuth`).
  const u = 'https://pixels-tracker.example.com/uploads/candidates/a.jpg';
  const r = assetUrl(u);
  assert.ok(r, 'doit produire une URL, pas null');
  assert.ok(
    r.startsWith(`${API_ORIGIN}/`),
    `doit pointer vers API_ORIGIN, obtenu ${r}`
  );
  assert.ok(!r.includes('pixels-tracker'), 'ne doit jamais mentionner l hote tiers');
  assert.equal(new URL(r).origin, API_ORIGIN);
});

test('les traversees de repertoire restent refusees', () => {
  for (const u of [
    '/uploads/cvs/../../etc/passwd',
    'https://api.jobsinc.com/uploads/../secret',
  ]) {
    assert.equal(assetUrl(u), null);
    assert.equal(cvHref(u), null);
  }
});

test('les valeurs vides ou hors perimetre restent nulles', () => {
  for (const v of [null, undefined, '', '/images/publiques/x.png', '/uploads']) {
    assert.equal(assetUrl(v as string | null), null);
  }
  // `cvHref` exige le prefixe /uploads/cvs/ : une photo n'est pas un CV.
  assert.equal(cvHref('/uploads/candidates/a.jpg'), null);
});
