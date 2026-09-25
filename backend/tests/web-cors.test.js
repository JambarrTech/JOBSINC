const assert = require('node:assert/strict');
const { getCorsOrigins } = require('../src/config/corsOrigins');

const origins = getCorsOrigins({
  NODE_ENV: 'development',
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:5500,http://localhost:5505',
});

assert.ok(origins.includes('http://localhost:5500'), 'La version web locale doit être autorisée');
assert.ok(origins.includes('http://localhost:5505'), 'Le port web Flutter 5505 doit être autorisé');
assert.ok(origins.includes('http://localhost:3000'), 'Le frontend local classique doit rester autorisé');

console.log('web-cors OK');
