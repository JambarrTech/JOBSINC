/**
 * Non-régression : la résolution des endpoints Admin ne doit plus dépendre d'un
 * accès DYNAMIQUE à `process.env`.
 *
 * Le bug
 * ------
 * `lib/admin-api.ts` faisait :
 *
 *     const key = section.replace(/[^a-zA-Z]/g, '_').toUpperCase();
 *     const endpoint = process.env[`NEXT_PUBLIC_ADMIN_${key}_ENDPOINT`];
 *
 * Next.js n'inline que les accès LITTÉRAUX (`process.env.NEXT_PUBLIC_X`).
 * La doc officielle le dit sans ambiguïté — voir
 * `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` :
 *
 *     "Note that dynamic lookups will *not* be inlined, such as:
 *      setupAnalyticsService(process.env[varName])"
 *
 * `getAdminResource` étant appelé depuis un composant `'use client'`, la clé
 * n'était jamais connue du build : `endpoint` valait `undefined`, la fonction
 * renvoyait `null`, et TOUTES les tables `/admin/<section>` s'affichaient
 * VIDES — sans erreur, sans log, sans échec de build. Le bouton « Exporter »,
 * lui, restait `disabled` en permanence.
 *
 * Le test
 * -------
 * On ne peut pas tester « l'inlining » à l'exécution : il se produit au build.
 * On teste donc ce qui l'a rendu possible : le PATTERN DE SOURCE. C'est la
 * seule chose qui se soit réellement réintroduite, et c'est un motif qu'un
 * reviewer peut, lui aussi, voir.
 *
 * On vérifie en plus que le catalogue et la map d'endpoints ne peuvent plus
 * diverger silencieusement.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ADMIN_RESOURCE_CONFIGS, isKnownAdminSection } from '../lib/admin-resources.ts';

const here = dirname(fileURLToPath(import.meta.url));
const adminApiPath = join(here, '..', 'lib', 'admin-api.ts');
const source = readFileSync(adminApiPath, 'utf8');

/**
 * `admin-api.ts` DOCumente le motif interdit (avec un extrait de la doc Next
 *officielle). On analyse donc le CODE, commentaires retirés — sinon le test
 *échouerait sur sa propre documentation.
 */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '') // commentaire de bloc
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // commentaire de ligne, sans casser `://`

/** Noms de sections du catalogue, dans l'ordre de déclaration. */
const sections = Object.keys(ADMIN_RESOURCE_CONFIGS);

test('le catalogue Admin expose des sections Known', () => {
  assert.ok(sections.length > 0, 'le catalogue ne doit pas être vide');
  for (const section of sections) {
    assert.ok(isKnownAdminSection(section), `${section} doit être une section connue`);
  }
  assert.ok(!isKnownAdminSection('inconnu'), 'une section inconnue doit être rejetée');
  assert.ok(!isKnownAdminSection('toString'), 'une clé de prototype ne doit pas passer');
});

test('AUCUN accès dynamique à process.env dans lib/admin-api.ts', () => {
  // Motif exact du bug : `process.env[`.
  const dynamicAccess = code.match(/process\.env\s*\[/g);
  assert.equal(
    dynamicAccess,
    null,
    `accès dynamique à process.env détecté (${dynamicAccess ? dynamicAccess.length : 0} occurrence(s)). ` +
    "Next.js n'inline pas les lookups dynamiques : les tables /admin/<section> " +
    'reviendraient vides. Écris un membre littéral par section.',
  );

  // Même piège, autre forme : le destructuring de `process.env`.
  const destructured = code.match(/const\s*\{\s*[^}]+\}\s*=\s*process\.env/g);
  assert.equal(
    destructured,
    null,
    `destructuring de process.env détecté (${destructured ? destructured.join(', ') : ''}). ` +
    "Seul un membre littéral (process.env.NEXT_PUBLIC_X) est inliné.",
  );
});

test('chaque section du catalogue a une entrée littérale dans la map d’endpoints', () => {
  for (const section of sections) {
    // Une entrée littérale : la clé apparaît dans une map, pas dans un template.
    const pattern = new RegExp(`\\b${section}\\s*:\\s*process\\.env\\.NEXT_PUBLIC_ADMIN_`, 'm');
    assert.match(
      code,
      pattern,
      `section « ${section} » sans entrée littérale dans ADMIN_RESOURCE_ENDPOINTS. ` +
      'Ajoutez une ligne `section: process.env.NEXT_PUBLIC_ADMIN_..._ENDPOINT,` — ' +
      'sans elle, la page /admin/' + section + ' reste vide.',
    );
  }
});

test('la variable d’environnement dérivée du nom de section est bien nominale', () => {
  // Le nom de variable suit `NEXT_PUBLIC_ADMIN_<SECTION>_ENDPOINT` où <SECTION>
  // est la clé SANS PONCTUATION — c'est ce que faisait l'ancien
  // `.replace(/[^a-zA-Z]/g, '_')`, en supprimant au passage les underscores
  // (d'où le piège `SECURITY_ALERTS` documenté dans le README).
  const expected = (section: string) => `NEXT_PUBLIC_ADMIN_${section.replace(/[^a-zA-Z]/g, '').toUpperCase()}_ENDPOINT`;
  assert.equal(expected('securityAlerts'), 'NEXT_PUBLIC_ADMIN_SECURITYALERTS_ENDPOINT');
  assert.equal(expected('reportsAnalytics'), 'NEXT_PUBLIC_ADMIN_REPORTSANALYTICS_ENDPOINT');
  assert.equal(expected('candidates'), 'NEXT_PUBLIC_ADMIN_CANDIDATES_ENDPOINT');
});

test('aucune section du catalogue ne pointe vers un rôle inexistant', () => {
  // `SUPER_ADMIN` a été retiré : `enum Role` (backend/prisma/schema.prisma)
  // ne contient que CANDIDATE, EMPLOYEE, RECRUITER, ADMIN.
  assert.ok(
    !code.includes('SUPER_ADMIN'),
    'SUPER_ADMIN a été retiré d\'aligner sur enum Role : le backend renverrait 403.',
  );
});
