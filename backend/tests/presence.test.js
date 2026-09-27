// Non-regression : presence et decision d'envoi du push.
//
// Regression — le push etait supprime sur mobile des que l'app passait en
//   arriere-plan. `conversationService` testait `!isUserConnected(userId)`,
//   c'est-a-dire « aucun WebSocket ouvert ». Or le socket mobile SURVIT au
//   passage en arriere-plan (le processus Flutter reste vivant et le
//   WebSocket est maintenu). `isUserConnected` renvoyait donc toujours
//   `true`, aucun push n'etait envoye, et l'utilisateur ne recevait rien.
//   Le garde-fou avait ete concu pour le web, ou un onglet ouvert implique un
//   ecran visible — ce qui est faux sur mobile.
//
// Le predicat correct est `isUserActive` : au moins un socket au PREMIER PLAN.
// Ce test verifie la machine a etats, sans Socket.IO ni base.

const assert = require('node:assert/strict');
const Module = require('node:module');
const EventEmitter = require('node:events');

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  ECHEC ${name}\n       ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Faux Socket.IO : seules les APIs utilisees par socketService sont implementees.
// ---------------------------------------------------------------------------
function makeServer() {
  const rooms = new Map(); // roomName -> Set<socketId>
  return {
    sockets: {
      adapter: {
        rooms: {
          get(name) {
            return rooms.get(name);
          },
        },
      },
    },
    _rooms: rooms,
  };
}
function loadSocketService() {
  const target = require.resolve('../src/services/socketService');
  const original = Module._load;

  // Faux serveur Socket.IO complet, construit AVANT init() : `init` appelle
  // `io.use` puis `io.on('connection', ...)`.
  const server = makeServer();
  const fakeIo = Object.assign(server, {
    use: () => fakeIo,
    on: (event, handler) => {
      if (event === 'connection') fakeIo.__onConnection = handler;
      return fakeIo;
    },
    to: () => ({ emit: () => {} }),
  });

  Module._load = function patched(request) {
    if (request === 'socket.io') {
      return { Server: function ServerStub() { return fakeIo; } };
    }
    if (request === '../config/prisma') {
      return { user: { findUnique: async () => ({ tokenVersion: 0 }) } };
    }
    if (request === 'jsonwebtoken') {
      return {
        verify: () => ({ userId: 'u1', role: 'RECRUITER', tokenVersion: 0 }),
        sign: () => 'token',
      };
    }
    return original.apply(this, arguments);
  };
  try {
    delete require.cache[target];
    const service = require('../src/services/socketService');
    return { service, fakeIo };
  } finally {
    Module._load = original;
    delete require.cache[target];
  }
}

/** Simule une connexion et renvoie le socket. */
function connect(fakeIo, userId, { role = 'RECRUITER' } = {}) {
  const handler = fakeIo.__onConnection;
  const socket = new EventEmitter();
  socket.id = `sock-${userId}-${Math.random().toString(36).slice(2, 8)}`;
  socket.data = { userId, role };
  socket.join = (room) => {
    let set = fakeIo._rooms.get(room);
    if (!set) { set = new Set(); fakeIo._rooms.set(room, set); }
    set.add(socket.id);
  };
  socket.leave = (room) => {
    const set = fakeIo._rooms.get(room);
    if (set) set.delete(socket.id);
  };
  socket.to = () => ({ emit: () => {} });
  // Le vrai Socket.IO retire le socket de ses rooms a la deconnexion ; le
  // faux doit le faire aussi, sinon `isUserConnected` resterait vrai.
  socket.on('disconnect', () => {
    for (const [room, set] of fakeIo._rooms) {
      set.delete(socket.id);
      if (set.size === 0) fakeIo._rooms.delete(room);
    }
  });
  handler(socket);
  return socket;
}

(async () => {
  console.log('-- Presence : connecte != a l\'ecran --');

  const { service, fakeIo } = loadSocketService();
  const fakeHttp = new EventEmitter();
  service.init(fakeHttp, ['http://localhost:3000']);
  assert.ok(typeof fakeIo.__onConnection === 'function', 'init doit enregistrer le gestionnaire de connexion');

  await test('un socket seul et visible est actif', () => {
    const socket = connect(fakeIo, 'u-actif');
    assert.equal(service.isUserConnected('u-actif'), true);
    assert.equal(service.isUserActive('u-actif'), true);
    socket.emit('disconnect');
  });

  await test('app en arriere-plan : connecte mais NON actif (le push doit partir)', () => {
    const socket = connect(fakeIo, 'u-background');
    assert.equal(service.isUserConnected('u-background'), true, 'le socket reste vivant');
    socket.emit('presence', { visible: false });
    assert.equal(service.isUserConnected('u-background'), true);
    assert.equal(
      service.isUserActive('u-background'),
      false,
      'sans ecran visible, le push doit etre envoye',
    );
    socket.emit('disconnect');
  });

  await test('retour au premier plan : actif a nouveau', () => {
    const socket = connect(fakeIo, 'u-retour');
    socket.emit('presence', { visible: false });
    assert.equal(service.isUserActive('u-retour'), false);
    socket.emit('presence', { visible: true });
    assert.equal(service.isUserActive('u-retour'), true);
    socket.emit('disconnect');
  });

  await test('web + mobile : un seul ecran visible suffit', () => {
    const web = connect(fakeIo, 'u-multi', { role: 'RECRUITER' });
    const mobile = connect(fakeIo, 'u-multi', { role: 'CANDIDATE' });
    web.emit('presence', { visible: true });
    mobile.emit('presence', { visible: false });
    assert.equal(
      service.isUserActive('u-multi'),
      true,
      'un onglet web visible rend l\'utilisateur actif',
    );
    web.emit('disconnect');
    assert.equal(
      service.isUserActive('u-multi'),
      false,
      'plus aucun ecran visible => push',
    );
    mobile.emit('disconnect');
  });

  await test('deconnexion : le socket disparait de la presence', () => {
    const socket = connect(fakeIo, 'u-deco');
    assert.equal(service.isUserConnected('u-deco'), true);
    socket.emit('disconnect');
    assert.equal(service.isUserConnected('u-deco'), false);
    assert.equal(service.isUserActive('u-deco'), false);
  });

  await test('repli : client qui n emet jamais presence reste actif (web)', () => {
    // Le client web n emet rien : on conserve la semantique historique
    // « connecte = actif » pour ne pas le degrader.
    const socket = connect(fakeIo, 'u-legacy');
    assert.equal(service.isUserActive('u-legacy'), true);
    socket.emit('disconnect');
  });

  await test('utilisateur inconnu : ni connecte ni actif', () => {
    assert.equal(service.isUserConnected('inconnu'), false);
    assert.equal(service.isUserActive('inconnu'), false);
  });

  await test('presence : false puis false ne plante pas', () => {
    const socket = connect(fakeIo, 'u-idem');
    socket.emit('presence', { visible: false });
    socket.emit('presence', { visible: false });
    socket.emit('presence', { visible: false });
    assert.equal(service.isUserActive('u-idem'), false);
    socket.emit('disconnect');
  });

  await test('presence : payload invalide ignore', () => {
    const socket = connect(fakeIo, 'u-payload');
    socket.emit('presence', null);
    socket.emit('presence', {});
    socket.emit('presence', { visible: 'oui' });
    // Boolean('oui') = true => actif. Le defaut "visible" est preserve.
    assert.equal(service.isUserActive('u-payload'), true);
    socket.emit('disconnect');
  });

  console.log(`\n${failures.length === 0 ? 'OK' : 'ECHEC'} : ${passed} tests passes, ${failures.length} echecs.`);
  if (failures.length > 0) process.exitCode = 1;
})();
