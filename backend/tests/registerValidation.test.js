// Non-régression — « Zod inscription : schémas alignés, pas affaiblis ».
//
// Les schémas supprimés divergeaient du code exécuté :
//   - `companyRegisterSchema` attendait `name`, l'API lit `companyName` ;
//   - `candidateRegisterSchema` déclarait `phone/country/city/birthDate`
//     OPTIONNELS, `createCandidate` les exige via `validateRequired`.
// Les brancher aurait cassé 100 % des inscriptions entreprise et affaibli la
// validation candidat. Les schémas réintroduits sont alignés champ à champ
// (`companyName`, requis stricts, bornes `validateLength`/`validateAge`) et
// branchés en GARDE DE FORME dans `authService` (Zod rejette tôt, les
// contrôles existants gardent le dernier mot).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { candidateRegisterSchema, companyRegisterSchema, validate } = require('../src/utils/zodSchemas');
const { ValidationError } = require('../src/utils/errors');

function validCandidate(overrides = {}) {
  return {
    email: 'aicha.diallo@example.com',
    password: 'Motdepasse1',
    firstName: 'Aïcha',
    lastName: 'Diallo',
    phone: '+221 77 000 00 00',
    country: 'Sénégal',
    city: 'Dakar',
    birthDate: '1995-06-15',
    ...overrides,
  };
}

function validCompany(overrides = {}) {
  return {
    email: 'contact@acme.sn',
    password: 'Motdepasse1',
    companyName: 'Acme SARL',
    ...overrides,
  };
}

test('candidat valide : accepté', () => {
  const parsed = candidateRegisterSchema.safeParse(validCandidate());
  assert.equal(parsed.success, true);
});

test('candidat : phone/country/city/birthDate requis (ancien optionnel rejeté)', () => {
  for (const field of ['phone', 'country', 'city', 'birthDate']) {
    const data = validCandidate();
    delete data[field];
    const parsed = candidateRegisterSchema.safeParse(data);
    assert.equal(parsed.success, false, `champ ${field} devrait être requis`);
  }
});

test('candidat : rejets métier (email, mot de passe, téléphone, âge, longueurs)', () => {
  assert.equal(candidateRegisterSchema.safeParse(validCandidate({ email: 'pas-un-email' })).success, false);
  assert.equal(candidateRegisterSchema.safeParse(validCandidate({ password: 'court' })).success, false);
  assert.equal(candidateRegisterSchema.safeParse(validCandidate({ phone: '123' })).success, false);
  assert.equal(candidateRegisterSchema.safeParse(validCandidate({ firstName: 'A' })).success, false);
  // Moins de 16 ans.
  assert.equal(candidateRegisterSchema.safeParse(validCandidate({ birthDate: '2020-01-01' })).success, false);
  // Date invalide.
  assert.equal(candidateRegisterSchema.safeParse(validCandidate({ birthDate: 'nimporte-quoi' })).success, false);
});

test('entreprise : companyName accepté, name seul rejeté (divergence historique)', () => {
  assert.equal(companyRegisterSchema.safeParse(validCompany()).success, true);
  const withNameOnly = { email: 'contact@acme.sn', password: 'Motdepasse1', name: 'Acme SARL' };
  assert.equal(companyRegisterSchema.safeParse(withNameOnly).success, false);
  assert.equal(companyRegisterSchema.safeParse(validCompany({ companyName: 'A' })).success, false);
  assert.equal(companyRegisterSchema.safeParse(validCompany({ email: 'pas-un-email' })).success, false);
});

test('validate() lève une ValidationError 400 VALIDATION_ERROR', () => {
  assert.throws(
    () => validate(candidateRegisterSchema, validCandidate({ phone: '123' })),
    (error) =>
      error instanceof ValidationError &&
      error.statusCode === 400 &&
      error.code === 'VALIDATION_ERROR',
  );
});

test('authService branche les schémas alignés en garde de forme (pattern de source)', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'authService.js'), 'utf8');
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.match(code, /require\(['"]\.\.\/utils\/zodSchemas['"]\)/);
  assert.match(code, /validate\(candidateRegisterSchema,\s*data\)/);
  assert.match(code, /validate\(companyRegisterSchema,\s*data\)/);
});
