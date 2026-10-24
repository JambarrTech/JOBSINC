/**
 * Non-régression a11y : Échap + restitution du focus.
 *
 * Pannes corrigées :
 * - `useEscapeToClose` capturait `document.activeElement` AU MOMENT d'Échap
 *   (donc DANS le menu, retiré du DOM par `onClose`) puis testait
 *   `document.contains(trigger)` : toujours faux, focus sur `<body>`.
 *   Le déclencheur est désormais mémorisé À L'OUVERTURE.
 * - `PipelineOverview` (panneau « Déplacer ») et `AdminGlobalSearch`
 *   n'avaient ni Échap ni restitution : le focus restait sur un bouton/lien
 *   supprimé du DOM.
 *
 * On teste le PATTERN DE SOURCE (commentaires retirés), comme
 * `adminEndpoints.test.ts` : JSDOM n'est pas disponible et le bug était un
 * motif de source, pas un comportement mockable sans DOM.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
function codeOf(...segments: string[]): string {
  const source = readFileSync(join(here, ...segments), 'utf8');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const focusHook = codeOf('..', 'components', 'ui', 'useDialogFocus.ts');
const pipeline = codeOf('..', 'components', 'dashboard', 'PipelineOverview.tsx');
const search = codeOf('..', 'components', 'admin', 'layout', 'AdminGlobalSearch.tsx');

test('useEscapeToClose mémorise le déclencheur à l’ouverture', () => {
  const fnStart = focusHook.indexOf('useEscapeToClose');
  assert.notEqual(fnStart, -1, 'useEscapeToClose introuvable');
  const fnBody = focusHook.slice(fnStart);
  const openCapture = fnBody.indexOf('triggerAtOpen');
  assert.notEqual(openCapture, -1, 'triggerAtOpen introuvable');
  // Capturé dans l'effet, AVANT le handler keydown.
  assert.ok(
    openCapture < fnBody.indexOf('const onKeyDown'),
    'le déclencheur doit être capturé avant le handler Échap',
  );
  // Plus aucune capture dans le handler (l’ancien bug).
  const handlerBody = fnBody.slice(fnBody.indexOf('const onKeyDown'));
  assert.ok(
    !handlerBody.includes('document.activeElement'),
    'le handler Échap ne doit plus capturer activeElement',
  );
  assert.ok(
    fnBody.includes('button[aria-expanded]'),
    'repli sur le bouton déclencheur attendu',
  );
});

test('pipeline : Échap + restitution au déclencheur Déplacer', () => {
  assert.ok(pipeline.includes('triggerRefs'), 'refs des déclencheurs attendues');
  assert.ok(pipeline.includes("'Escape'") || pipeline.includes('"Escape"'), 'Échap attendu');
  assert.ok(pipeline.includes('movePanelFor'), 'panneau suivi attendu');
  assert.ok(pipeline.includes('aria-expanded'), 'aria-expanded attendu');
  assert.ok(pipeline.includes('aria-controls'), 'aria-controls attendu');
  assert.ok(pipeline.includes('.focus()'), 'restitution du focus attendue');
});

test('recherche globale : Échap + aria-expanded/controls', () => {
  assert.ok(search.includes('useEscapeToClose'), 'hook Échap attendu');
  assert.ok(search.includes('aria-expanded'), 'aria-expanded attendu');
  assert.ok(search.includes('aria-controls'), 'aria-controls attendu');
  assert.ok(search.includes('.focus()') || search.includes('inputRef'), 'focus input attendu');
});
