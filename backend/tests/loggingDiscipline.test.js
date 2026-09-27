// BUG VERROUILLE — `console.*` hors du logger.
//
// Le commit de correction avait cree `utils/logger.js` comme norme de
// journalisation, puis n avait utilise que sur 4 appels : 124 `console.error`
// subsistaient dans 23 fichiers. Trois consequences concretes :
//
//   1. `LOG_LEVEL` ne gouvernait QUE le logger. Un `LOG_LEVEL=error` en
//      production laissait passer les warnings de degradation — l inverse exact
//      de l effet recherche d un niveau de log.
//   2. `console.error('msg', err)` sort la PILE au complet, en texte libre, sur
//      stdout : unaggregateur voit du texte non structure au milieu du JSON, et
//      l information de pile que `logger.exception` masque en production fuite
//      par la porte de Service.
//   3. Les degradations silencieuses — stockage ephemere, quotas par instance —
//      n etaient pas remontables, parce qu elles ne passaient pas par le canal
//      qui les aurait regroupees.
//
// Ce test rend la regression VISIBLE. Sans lui, la correction serait un simple
// commit que le prochain `console.log` annulerait.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function parcourir(repertoire, acc = []) {
  for (const e of fs.readdirSync(repertoire, { withFileTypes: true })) {
    const p = path.join(repertoire, e.name);
    if (e.isDirectory()) parcourir(p, acc);
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const APPELS = /(^|[^.\w])console\s*\.\s*(log|warn|error|info|debug)\s*\(/g;

test('aucun console.* dans backend/src, hormis le logger lui-meme', () => {
  const coupables = [];
  for (const f of parcourir(SRC)) {
    // `utils/logger.js` CITE `console.*` dans ses commentaires : c est cet
    // evenement que le module documente, pas un appel. On l exclut, sinon le
    // test se heurterait a lui-meme.
    if (path.basename(f) === 'logger.js') continue;
    const t = fs.readFileSync(f, 'utf8');
    const lignes = t.split('\n');
    lignes.forEach((l, i) => {
      // On ignore les lignes de commentaire : un `console.error` CITÉ dans une
      // explication n est pas un appel.
      const sansCommentaire = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      APPELS.lastIndex = 0;
      if (APPELS.test(sansCommentaire)) {
        coupables.push(`${path.relative(SRC, f)}:${i + 1}  ${l.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(
    coupables,
    [],
    `console.* reintroduit : passer par utils/logger\n  ${coupables.join('\n  ')}`
  );
});

test('tout fichier qui journalise importe bien le logger', () => {
  // Une conversion oubliee peut laisser `logger.exception` sans import : le
  // fichier se charge (syntaxe valide) mais leve `ReferenceError` a l execution,
  // donc en PRODUCTION et pas au build. Cette assertion le rattrape statiquement.
  const suspects = [];
  for (const f of parcourir(SRC)) {
    const t = fs.readFileSync(f, 'utf8');
    const utiliseLogger = /(^|[^.\w])logger\s*\.\s*(log|warn|error|info|debug|exception)\s*\(/.test(t);
    const aLImport = /require\(['"][^'"]*utils\/logger['"]\)/.test(t) || /require\(['"]\.\/logger['"]\)/.test(t);
    if (utiliseLogger && !aLImport) suspects.push(path.relative(SRC, f));
  }
  assert.deepEqual(suspects, [], `logger utilise sans import : ${suspects.join(', ')}`);
});

test('le logger expose bien les cinq formes utilisees dans src', () => {
  // Une API qui perdrait une methode casserait les 124 appels d un coup, et
  // seulement a l execution. On verifie l export statiquement.
  const src = fs.readFileSync(path.join(SRC, 'utils', 'logger.js'), 'utf8');
  for (const methode of ['info', 'warn', 'error', 'exception']) {
    assert.ok(
      new RegExp(`\\b${methode}\\s*\\(`).test(src),
      `utils/logger.js doit exposer ${methode}()`
    );
  }
});
