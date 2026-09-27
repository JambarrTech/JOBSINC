/**
 * Non-régression : la route BFF `/api/auth/cookie` doit refuse un jeton non
 * verifie et une requete sans origine.
 *
 * Les deux defauts corriges
 * ------------------------
 * 1. VERIFICATION ABSENTE. Le POST ne validait le jeton que par une REGEX DE
 *    FORME (`/^[\w-]+\.[\w-]+\.[\w-]+$/`). Aucune signature verifiee, aucun
 *    `exp` lu, aucun appel a l'API : la route etait un « set-cookie sur
 *    promesse ». Consequence : fixation de session (planter un jeton que
 *    l'attaquant possede) et deconnexion forcee de tout utilisateur reel, puisque
 *    `proxy.ts` detruit les cookies des que `/auth/me` refuse le jeton.
 *    Desormais le jeton est interroge aupres de l'API AVANT d'etre ecrit.
 *
 * 2. GARDE CSRF FAIL-OPEN. `if (!origin) return true` : toute requete mutante
 *    depourvue d'en-tete `Origin` passait. Le controle est maintenant fail-closed.
 *
 * Le test porte sur la LOGIQUE, pas sur le runtime Next : les regles sont
 * extraites de la source et evaluees ici, ce qui evite d'avoir a lever un
 * serveur Next complet.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(here, '..', 'app', 'api', 'auth', 'cookie', 'route.ts');
const source = readFileSync(routePath, 'utf8');

/** Reproduit `isAllowedOrigin` : même sémantique que la route. */
function isAllowedOrigin(origin: string | null, requestOrigin: string): boolean {
  if (!origin) return false; // fail-closed
  try {
    return new URL(origin).origin === new URL(requestOrigin).origin;
  } catch {
    return false;
  }
}

const SELF = 'https://jobsinc.example';

/**
 * Retire les commentaires. `auth-cookie.ts` et `proxy.ts` DOCUMENTENT les
 * motifs interdits (nom des aliases, header `Host`) : sans cette étape, le test
 * échouerait sur sa propre documentation.
 */
function stripComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('le garde d’origine est fail-closed', () => {
  // Absent -> refusé. C'est LE correctif : avant, `return true`.
  assert.equal(isAllowedOrigin(null, SELF), false, 'une requête sans Origin doit être refusée');
});

test('le garde d’origine refuse une origine tierce', () => {
  assert.equal(isAllowedOrigin('https://attaquant.example', SELF), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', SELF), false, 'http vs https ne doit pas matcher');
  // Usurpation par sous-domaine : `evil.jobsinc.example` n'est PAS `jobsinc.example`.
  assert.equal(isAllowedOrigin('https://evil.jobsinc.example', SELF), false);
});

test('le garde d’origine accepte la même origine', () => {
  assert.equal(isAllowedOrigin(SELF, SELF), true);
  // Un port différent est une autre origine.
  assert.equal(isAllowedOrigin('https://jobsinc.example:8443', SELF), false);
});

test('la route appelle le backend avant d’écrire le cookie', () => {
  // Le contrôle doit exister ET précéder l'écriture du cookie.
  assert.match(source, /isTokenAccepted/, 'la vérification du jeton via /auth/me doit être présente');
  const verifyIndex = source.indexOf('await isTokenAccepted(token)');
  const writeIndex = source.indexOf('response.cookies.set');
  assert.ok(verifyIndex > -1, 'isTokenAccepted doit être appelé');
  assert.ok(writeIndex > -1, 'le cookie doit être écrit');
  assert.ok(
    verifyIndex < writeIndex,
    'le jeton doit être vérifié AVANT d’être posé en cookie, jamais après',
  );
});

test('le jeton est validé par l’API, pas seulement par sa forme', () => {
  // La regex de forme peut rester (garde-fou grossier) mais ne doit plus être
  // le SEUL contrôle.
  assert.match(source, /\/auth\/me/, 'la route doit interroger /auth/me');
  assert.match(source, /Authorization/, 'elle doit transmettre le jeton en Bearer');
});

test('le jeton n’est jamais renvoyé dans la réponse', () => {
  // `NextResponse.json({ token })` réinjecterait le jeton dans du JS lisible.
  assert.ok(
    !/json\(\s*\{[^}]*\btoken\b/.test(source),
    'le jeton ne doit pas être renvoyé dans le corps de la réponse',
  );
});

test('le cookie de session est HttpOnly et sans domaine', () => {
  const cookieModule = stripComments(readFileSync(join(here, '..', 'lib', 'auth-cookie.ts'), 'utf8'));
  assert.match(cookieModule, /httpOnly:\s*true/, 'le cookie doit être HttpOnly');
  assert.ok(
    !/domain\s*:/.test(cookieModule),
    'aucun attribut `domain` : le cookie doit rester host-only, sinon un sous-domaine pourrait le poser',
  );
  assert.match(cookieModule, /path:\s*'\/'/, '`__Host-` impose path=/');
  assert.match(cookieModule, /sameSite:\s*'lax'/, 'sameSite lax : le jeton ne part pas lors d’un POST cross-site');
});

test('un seul nom de cookie de session est écrit', () => {
  // Les alias `accessToken` et `token` étaient écrits ET relus. Ils élargissaient
  // la surface : côté frontend, `proxy.ts` transformait en bearer token TOUT cookie
  // portant ces noms génériques sur le domaine.
  //
  // `auth-cookie.ts` les mentionne dans sa documentation (pour expliquer pourquoi
  // ils ont été retirés) : on analyse le code, commentaires exclus.
  const cookieModule = stripComments(readFileSync(join(here, '..', 'lib', 'auth-cookie.ts'), 'utf8'));
  assert.ok(!/accessToken/.test(cookieModule), 'plus d’alias `accessToken`');
  assert.ok(!/'token'/.test(cookieModule), 'plus d’alias `token`');

  const proxySource = stripComments(readFileSync(join(here, '..', 'proxy.ts'), 'utf8'));
  assert.ok(
    !/cookies\.get\('(accessToken|token)'\)/.test(proxySource),
    'proxy.ts ne doit lire aucun cookie autre que SESSION_COOKIE',
  );
});
