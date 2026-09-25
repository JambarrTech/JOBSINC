const assert = require('assert');
const { normalizeJobInput, parseBooleanLike } = require('../src/controllers/companyController');

const tests = [
  {
    name: 'skills optionnel ne casse pas la création',
    fn: () => {
      const result = normalizeJobInput({ title: '  Dev  ', skills: undefined, isOpen: 'true' });
      assert.strictEqual(result.title, 'Dev');
      assert.strictEqual(result.skills, undefined);
      assert.strictEqual(result.isOpen, true);
    },
  },
  {
    name: 'isOpen accepte les valeurs booléennes et string',
    fn: () => {
      assert.strictEqual(parseBooleanLike(true), true);
      assert.strictEqual(parseBooleanLike('false'), false);
      assert.strictEqual(parseBooleanLike(undefined), undefined);
    },
  },
];

for (const test of tests) {
  try {
    test.fn();
    console.log(`ok ${test.name}`);
  } catch (error) {
    console.error(`FAIL ${test.name}`);
    console.error(error.stack);
    process.exitCode = 1;
  }
}
