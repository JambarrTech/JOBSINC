// Non-régression : défauts de sécurité corrigés dans le même lot que ce test.
//
// Chaque bloc verrouille un bug RÉEL, pas une intention. Le motif de détection
// est celui déjà en usage dans ce dépôt : stub de `prisma` via `Module._load`
// (voir `uploadAuth.test.js`), puis mutation du code source pour vérifier que
// l'assertion échoue bien.
//
// ---------------------------------------------------------------------------
// Régression A — `absoluteUrl` existait en DEUX versions, dont une non gardée.
//   `jobController.js` avait sa propre copie, sans garde-fou, alors que
//   `companyController.js` avait la version gardée. Les deux coexistaient, et
//   celle qui servait la liste PUBLIQUE des offres — la seule réponse que reçoit
//   un visiteur non authentifié — était la version NON gardée.
//
//   La première correction a centralisé les deux autour d'un garde-fou de
//   FORME (`^[a-zA-Z0-9.-]+(?::\d+)?$`). Ce test a montré que c'était
//   INSUFFISANT : `evil.com` est une chaîne parfaitement conforme à cette
//   expression. Derrière le proxy Render, `TRUST_PROXY=1` laisse descendre
//   l'en-tête `Host` du client jusqu'à `req.get('host')`, donc un visiteur
//   anonyme pouvait obtenir des URL de logo et de photo pointant vers un domaine
//   qu'il contrôle. La forme était vérifiée, l'IDENTITÉ ne l'était pas.
//   Corrigé en faisant de `APP_URL` l'autorité (déjà lue par `emailService.js`).
//
// Régression B — `socketService` autorisait les rooms sur le rôle du JWT.
//   Le rôle pouvait être périmé pendant toute la durée de vie du token d'accès
//   (15 min) : `socket.data.role` alimentait `membershipFieldFor()`, qui choisit
//   la colonne d'appartenance d'une room. Un recruteur rétrogradé en base
//   rejoignait donc encore les rooms entreprise, alors que le middleware HTTP
//   le rejetait déjà. Le rôle est désormais relu en base, comme le fait
//   `middlewares/authMiddleware.js`.
//
// Régression C — le lien de réinitialisation de mot de passe était journalisé
//   EN CLAIR. C'est un accès complet au compte pendant 1 h, sans second
//   facteur ; écrit dans l'agrégateur de logs, il devenait du matériel de prise
//   de compte, avec une rétention bien plus longue que celle de la base.
//
// Régression D — Prisma SUPPRIME silencieusement un critère `where` dont la
//   valeur est `undefined` (le générateur n'active pas
//   `strictUndefinedChecks`). `ensureForCandidate` passait
//   `candidateProfileId: candidateUser.candidate?.id` : pour un compte sans
//   profil candidat, le filtre DISPARAISSAIT et la requête retournait la
//   candidature autorisée la plus récente de l'ENTREPRISE, quel que soit le
//   candidat. La garde `if (!authorizedApplication)` ne protégeait plus rien.
// ---------------------------------------------------------------------------

const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`  ECHEC ${name}\n       ${error.message}`);
  }
}

/** Recharge `request` avec des modules stubés, puis rend la main. */
function withStubs(request, stubs, fn) {
  const original = Module._load;
  const target = require.resolve(request);
  Module._load = function patched(mod) {
    if (mod in stubs) return stubs[mod];
    return original.apply(this, arguments);
  };
  delete require.cache[target];
  try {
    return fn(require(request));
  } finally {
    delete require.cache[target];
    Module._load = original;
  }
}

// `APP_URL` pilote `requestOrigin` ; on l'isole pour ne pas dépendre de
// l'environnement du poste de développement.
const ORIGINAL_APP_URL = process.env.APP_URL;
function setAppUrl(value) {
  if (value === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = value;
}
process.on('exit', () => setAppUrl(ORIGINAL_APP_URL));

(async () => {
  // =========================================================================
  // A. Construction d'URL — une seule implémentation, gardée par identité
  // =========================================================================
  console.log("— A. Construction d'URL (injection d'en-tête Host) —");
  const { absoluteUrl, requestOrigin, declaredOrigin } = require('../src/utils/urls');
  const reqWith = (host) => ({ get: () => host, protocol: 'https' });

  await test('APP_URL configurée : l\'en-tête Host est IGNORÉ (le vrai correctif)', () => {
    setAppUrl('https://api.jobsinc.com');
    // `evil.com` est syntaxiquement valide : c'est précisément pour cela que le
    // garde-fou de forme ne suffisait pas. Avec `APP_URL`, l'identité vient de
    // la configuration du déploiement et non de la requête.
    assert.equal(requestOrigin(reqWith('evil.com')), 'https://api.jobsinc.com');
    assert.equal(requestOrigin(reqWith('jobsinc.com')), 'https://api.jobsinc.com');
    assert.equal(
      absoluteUrl(reqWith('evil.com'), '/uploads/logo.png'),
      'https://api.jobsinc.com/uploads/logo.png'
    );
  });

  await test('APP_URL avec port et chemin : seul le port est retenu', () => {
    setAppUrl('https://api.jobsinc.com:8443/api');
    assert.equal(requestOrigin(reqWith('evil.com')), 'https://api.jobsinc.com:8443');
  });

  await test('APP_URL malformée : l\'API ne casse pas, on retombe sur Host', () => {
    setAppUrl('pas-une-url');
    assert.equal(declaredOrigin(), null);
    assert.equal(requestOrigin(reqWith('jobsinc.com')), 'https://jobsinc.com');
  });

  // Garde-fou de FORME, qui reste nécessaire et reste testé : ces valeurs
  // peuvent scinder un en-tête de réponse ou polluer un cache, indépendamment
  // de toute question d'identité.
  await test('sans APP_URL : un Host de forme invalide retombe sur le repli', () => {
    setAppUrl(undefined);
    for (const host of [
      'evil.com/path',
      'a b.com',
      'jobsinc.com@evil.com',
      'evil.com:notaport',
      'evil.com\r\nX-Injected: 1',
      'evil.com#fragment',
      '',
      undefined,
    ]) {
      assert.equal(
        requestOrigin(reqWith(host)),
        'https://localhost:5000',
        `Host ${JSON.stringify(host)} devait être rejeté`
      );
    }
  });

  await test('sans APP_URL : un Host de forme valide est accepté (dev)', () => {
    setAppUrl(undefined);
    assert.equal(requestOrigin(reqWith('jobsinc.com')), 'https://jobsinc.com');
    assert.equal(requestOrigin(reqWith('localhost:5000')), 'https://localhost:5000');
  });

  await test('valeur déjà absolue : conservée telle quelle', () => {
    setAppUrl('https://api.jobsinc.com');
    assert.equal(
      absoluteUrl(reqWith('evil.com'), 'https://cdn.example.com/x.png'),
      'https://cdn.example.com/x.png'
    );
  });

  await test('aucun contrôleur ne re-définit absoluteUrl, et sort les assets en chemin relatif', () => {
    // La divergence s était reproduction parce que chacun avait SA copie. On
    // vérifie qu'il n'en reste qu'une.
    //
    // L'assertion d'import a été RETARGETÉE, pas supprimée. Les deux
    // contrôleurs n'importent plus `absoluteUrl` : c'est le correctif. Passer
    // une URL d'upload dans `absoluteUrl` rendait la disponibilité d'une image
    // dépendante de `APP_URL` — absente du Blueprint, l'API annonçait alors les
    // images sur l'hôte Render, que le web `entreprise` refuse. Le même logo
    // s'affichait côté mobile et pas côté web.
    //
    // L'invariant réellement à protéger est désormais : les assets d'upload
    // sortent par `canonicalUploadPath`, et l'URL absolue ne peut pas revenir.
    const jobSource = fs.readFileSync(
      require.resolve('../src/controllers/jobController'), 'utf8'
    );
    const companySource = fs.readFileSync(
      require.resolve('../src/controllers/companyController'), 'utf8'
    );
    for (const [name, source] of [['jobController', jobSource], ['companyController', companySource]]) {
      assert.ok(
        !/function\s+absoluteUrl\s*\(/.test(source),
        `${name} ne doit plus définir sa propre absoluteUrl`
      );
      assert.ok(
        source.includes("require('../services/storageService')"),
        `${name} doit importer canonicalUploadPath depuis storageService`
      );
      // Piège de régression exact : réintroduire `absoluteUrl` sur un champ
      // d'upload ferait revenir les images cassées, et RIEN ne le signalerait
      // ailleurs — le build passe, les tests backend passent, seule la photo
      // manque à l'écran.
      const surAsset = /absoluteUrl\s*\(\s*req\s*,\s*[^)]*(logo|url|photo|avatar|cv)/i;
      assert.ok(
        !surAsset.test(source),
        `${name} ne doit plus passer un asset d'upload par absoluteUrl (regression du bug images/ CV)`
      );
    }
  });

  // =========================================================================
  // B. socketService — le rôle vient de la base, jamais du JWT
  // =========================================================================
  console.log('— B. Socket.IO : rôle relu en base —');

  // Le middleware refuse d'entrée si `JWT_SECRET` est absent (ligne 83 de
  // `socketService.js`) : sans cette variable, le test court-circuiterait avant
  // d'atteindre la logique de rôle — c'est-à-dire qu'il ne testerait rien.
  const savedJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'secret-de-test-role-socket-0123456789abcdef';

  /**
   * Charge `socketService`, puis `init` avec un faux serveur, et retourne le
   * middleware de connexion capturé via `io.use(...)`.
   */
  function loadSocketAuth(dbUser) {
    const captured = {};
    const fakeIo = {
      use(fn) { captured.auth = fn; },
      on() {},
      to() { return { emit() {} }; },
    };
    // `init` fait `io = new Server(httpServer, opts)`, donc le constructeur doit
    // RENVOYER le faux serveur.
    const ServerStub = function ServerStub() { return fakeIo; };

    withStubs(
      '../src/services/socketService',
      {
        'socket.io': { Server: ServerStub },
        '../config/prisma': { user: { findUnique: async () => dbUser } },
        jsonwebtoken: {
          // `jwtRole` est le rôle MIS DANS LE TOKEN, c'est-à-dire la valeur
          // périmée que la correction doit ignorer.
          verify: () => ({ userId: 'u1', role: captured.jwtRole, tokenVersion: 1 }),
        },
      },
      (mod) => mod.init({ on() {} }, ['https://jobsinc.com'])
    );

    if (!captured.auth) throw new Error('middleware de connexion non capturé');
    return captured;
  }

  function connect(dbUser, jwtRole) {
    const captured = loadSocketAuth(dbUser);
    captured.jwtRole = jwtRole; // lu au moment du `verify`
    const socket = { data: {}, handshake: { auth: { token: 'x' }, headers: {} } };
    return new Promise((resolve, reject) => {
      captured.auth(socket, (err) => (err ? reject(err) : resolve(socket.data)));
    });
  }

  await test('rôle en base = RECRUITER, rôle du JWT = CANDIDATE : la base gagne', async () => {
    const data = await connect({ tokenVersion: 1, role: 'RECRUITER' }, 'CANDIDATE');
    assert.equal(data.role, 'RECRUITER');
    assert.equal(data.userId, 'u1');
  });

  await test('rôle en base = CANDIDATE, rôle du JWT = ADMIN : la base gagne', async () => {
    // Le cas le plus grave : un ancien ADMIN rétrogradé ne doit pas conserver
    // les droits admin sur les rooms.
    const data = await connect({ tokenVersion: 1, role: 'CANDIDATE' }, 'ADMIN');
    assert.equal(data.role, 'CANDIDATE');
  });

  await test('tokenVersion périmé : connexion refusée', async () => {
    // L'utilisateur n'existe plus (retourné par la même requête) → refus.
    await assert.rejects(
      () => connect(null, 'CANDIDATE'),
      /session_revoked/
    );
  });

  if (savedJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedJwtSecret;

  // =========================================================================
  // C. Le jeton de réinitialisation n'est jamais journalisé en clair
  // =========================================================================
  console.log('— C. Email : jeton de réinitialisation redactionné —');
  const emailService = require('../src/services/emailService');

  await test('le lien de réinitialisation ne fuit pas le jeton en clair', async () => {
    // CAPTURE REORIENTEE.
    //
    // Ce test interceptait `console.warn`. Or `logDevLink` est désormais passé
    // par `utils/logger` — qui écrit sur `process.stdout` / `process.stderr`, et
    // jamais sur `console.*`. Le test continuait donc de passer au vide : il ne
    // capturait plus rien, et son `output.length > 0` le signalait... mais il a
    // echoue bruyamment a la conversion, ce qui vaut mieux qu'un faux vert.
    //
    // On intercepte donc les flux NATIFS, qui sont le vrai canal de sortie du
    // logger. Ce qui est verifie — l absence de jeton en clair — ne change pas :
    // c'est bien la sortie reelle du service qui est inspectee.
    const lines = [];
    const capture = (chunk) => { lines.push(String(chunk)); return true; };
    const origOut = process.stdout.write;
    const origErr = process.stderr.write;
    process.stdout.write = capture;
    process.stderr.write = capture;

    // SMTP absent → le mode développement journalise un aperçu du lien.
    const savedHost = process.env.SMTP_HOST;
    const savedPort = process.env.SMTP_PORT;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;

    const TOKEN = 'TOKEN-SECRET-AAAABBBBCCCCDDDDEEEEFFFF9999';
    try {
      await emailService.sendPasswordReset('cible@example.com', TOKEN);
    } finally {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
      if (savedHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = savedHost;
      if (savedPort === undefined) delete process.env.SMTP_PORT;
      else process.env.SMTP_PORT = savedPort;
    }

    const output = lines.join('\n');
    assert.ok(output.length > 0, 'un aperçu doit tout de même être journalisé');
    assert.ok(
      !output.includes(TOKEN),
      `le jeton en clair NE DOIT PAS apparaître dans les logs :\n${output}`
    );
    assert.ok(
      !/token=[A-Za-z0-9_-]{20,}/.test(output),
      `aucun paramètre token= non redacté :\n${output}`
    );
    // `URLSearchParams.set` encode le `:` en `%3A`, d'où les deux formes.
    assert.ok(
      /REDACTED(?::|%3A)[0-9a-f]{8}/.test(output),
      `le jeton doit être remplacé par une empreinte tronquée à 8 hexa :\n${output}`
    );
    // Le lien reste consultable : c'est le seul moyen de tester le flux sans SMTP.
    assert.ok(
      output.includes('/reset-password?token='),
      'la structure du lien doit être conservée pour le diagnostic'
    );
  });

  // =========================================================================
  // D. Prisma et les critères `where` à `undefined`
  // =========================================================================
  console.log('— D. Messagerie : profil candidat absent —');

  function loadConversationService(user) {
    const calls = { applicationFindFirst: [] };
    const conversationRow = {
      id: 'conv1',
      jobId: 'job1',
      candidateProfileId: 'cand-1',
      companyUserId: 'u-recruteur',
    };
    const stub = {
      company: { findUnique: async () => ({ id: 'co1' }) },
      user: { findUnique: async () => user },
      conversation: {
        findUnique: async () => null,
        upsert: async () => conversationRow,
        update: async () => conversationRow,
      },
      application: {
        findFirst: async (args) => {
          calls.applicationFindFirst.push(args);
          return { id: 'app1', job: { title: 'Dev' } };
        },
      },
    };
    const mod = withStubs('../src/services/conversationService', { '../config/prisma': stub }, (m) => m);
    return { mod, calls };
  }

  await test('compte SANS profil candidat : refus explicite, AUCUNE requête d\'autorisation', async () => {
    // `candidate: null` → `candidate?.id` vaut `undefined` → Prisma SUPPRIME le
    // filtre et retourne la candidature d'un AUTRE candidat. Le refus doit donc
    // PRÉCÉDER la requête, sinon la ligne de garde ne protège plus rien.
    const { mod, calls } = loadConversationService({ id: 'u-candidat', candidate: null });
    const result = await mod.ensureForCandidate({ userId: 'u-recruteur' }, 'u-candidat');
    assert.ok(result && result.error, 'une erreur doit être renvoyée');
    assert.equal(result.error.status, 403);
    assert.equal(
      calls.applicationFindFirst.length,
      0,
      'la requête d\'autorisation ne doit JAMAIS être émise sans profil candidat'
    );
  });

  await test('profil candidat présent : le filtre porte l\'id EXPLICITE du profil', async () => {
    const { mod, calls } = loadConversationService({ id: 'u-candidat', candidate: { id: 'cand-1' } });
    await mod.ensureForCandidate({ userId: 'u-recruteur' }, 'u-candidat');
    assert.equal(calls.applicationFindFirst.length, 1, 'la requête doit être émise');
    const where = calls.applicationFindFirst[0].where;
    assert.ok(
      where.candidateProfileId !== undefined,
      'un `undefined` ferait DISPARAÎTRE le filtre côté Prisma'
    );
    assert.equal(where.candidateProfileId, 'cand-1');
  });

  await test('candidat inconnu : refus avant toute logique d\'autorisation', async () => {
    const { mod, calls } = loadConversationService(null);
    const result = await mod.ensureForCandidate({ userId: 'u-recruteur' }, 'inconnu');
    assert.ok(result && result.error);
    assert.equal(result.error.status, 404);
    assert.equal(calls.applicationFindFirst.length, 0);
  });

  // =========================================================================
  // Bilan
  // =========================================================================
  console.log('');
  if (failures.length) {
    console.error(`${passed} test(s) passé(s), ${failures.length} échec(s).`);
    process.exitCode = 1;
  } else {
    console.log(`OK : ${passed} tests passés (securityRegressions).`);
  }
})();
