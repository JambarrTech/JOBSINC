// Diagnostic de connexion pour un compte donné.
//
// Sert à vérifier qu'un compte existe, quel rôle lui est attribué, et si son
// hash correspond à un mot de passe SAISI INTERACTIVEMENT. Le mot de passe
// n'est plus écrit en dur : il était previously `Admin123!`, en clair dans le
// dépôt, etallowait de s'authentifier en admin sur la production dès qu'on
// avait cloné le projet.
//
// Usage :
//   LOGIN_EMAIL=... node scripts/test-login.js
//   (puis saisir le mot de passe à l'invite ; rien n'est journalisé)

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const readline = require('node:readline');

const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!NEW_URL) throw new Error('NEW_DATABASE_URL ou DATABASE_URL doit être défini.');

const email = (process.env.LOGIN_EMAIL || '').trim();
if (!email) throw new Error('LOGIN_EMAIL doit être défini.');

function askPassword() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    // La saisie n'est pas masquée par défaut : `readline` n'a pas de
    // "mode secret" portable. Le mot de passe reste en mémoire locale et
    // n'est jamais journalisé.
    rl.question('Mot de passe : ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const p = new PrismaClient({ datasources: { db: { url: NEW_URL } } });

(async () => {
  await p.$connect();
  const user = await p.user.findUnique({
    where: { email },
    include: { candidate: true, company: true },
  });

  if (!user) {
    console.log(`Aucun compte pour ${email}.`);
    return;
  }

  console.log('user:', {
    id: user.id,
    email: user.email,
    role: user.role,
    hasHash: Boolean(user.passwordHash),
    hasCompany: Boolean(user.company),
    hasCandidate: Boolean(user.candidate),
  });

  const password = await askPassword();
  if (password) {
    const ok = await bcrypt.compare(password, user.passwordHash);
    console.log('Mot de passe correct :', ok);
  }
  await p.$disconnect();
})().catch((error) => {
  console.error(`test-login: ${error.message}`);
  process.exitCode = 1;
});
