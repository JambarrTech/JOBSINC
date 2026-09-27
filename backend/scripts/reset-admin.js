// Réinitialisation du mot de passe d'un compte administrateur.
//
// Avertissement : ce script contourne la vérification de mot de passe et
// promeut un compte en ADMIN. Il n'est jamais appelé par l'application.
//
// Historiquement, le mot de passe (`Admin123!`), l'adresse e-mail de l'admin et
// le coût bcrypt (10, contre 12 partout ailleurs) étaient ÉCRITS EN DUR dans le
// dépôt. anyone@yhad de l'accès au dépôt pouvait donc s'attribuer un compte
// ADMIN sur la base de production avec un mot de passe trivial. Le mot de passe
// et l'e-mail viennent désormais de l'environnement, et le coût est aligné sur
// celui de l'application.
//
// Usage :
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/reset-admin.js
//
// Le mot de passe doit contenir au moins 12 caractères. Il n'est jamais
// journalisé en clair : seul un préfixe de confirmation l'est.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
const OLD_URL = process.env.OLD_DATABASE_URL;

// Coute identique a `authService.hashPassword` : un hash a cout 10 serait
// notablement plus rapide a casser.
const BCRYPT_COST = 12;

const email = (process.env.ADMIN_EMAIL || '').trim();
const password = process.env.ADMIN_PASSWORD || '';

if (!NEW_URL) throw new Error('NEW_DATABASE_URL ou DATABASE_URL doit être défini.');
if (!email) throw new Error('ADMIN_EMAIL doit être défini (ex. ADMIN_EMAIL=admin@jobsinc.com).');
if (!password) throw new Error('ADMIN_PASSWORD doit être défini.');
if (password.length < 12) {
  throw new Error(`ADMIN_PASSWORD doit faire au moins 12 caractères (recu : ${password.length}).`);
}
if (!OLD_URL) {
  console.warn('OLD_DATABASE_URL absent : seule la base principale sera modifiée.');
}

async function set(url, label) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    await p.$connect();
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await p.user.update({
      where: { email },
      // `tokenVersion` est incrémenté, comme le fait `authService.logout` et
      // `authService.resetPassword`.
      //
      // SANS cet incrément, changer le mot de passe d'un administrateur laissait
      // ses ANCIENS access tokens valides pendant toute leur durée de vie (15 min)
      // : un jeton capturé avant la réinitialisation continuait d'ouvrir une
      // session ADMIN. Révoquer les sessions fait partie de la réinitialisation
      // d'un compte privilégié — sans cela, la procédure était incomplète.
      data: { passwordHash: hash, role: 'ADMIN', tokenVersion: { increment: 1 } },
    });
    console.log(`${label} → ${user.email} (${user.role}) mot de passe réinitialisé (cøst ${BCRYPT_COST}).`);
  } finally {
    await p.$disconnect();
  }
}

(async () => {
  await set(NEW_URL, 'NEW ep-small-poetry');
  if (OLD_URL) await set(OLD_URL, 'OLD ep-curly-fog');
})().catch((error) => {
  console.error(`reset-admin: ${error.message}`);
  process.exitCode = 1;
});
