const assert = require('node:assert/strict');

const controller = require('../src/controllers/companyController');

assert.equal(typeof controller.dashboard, 'function');
assert.equal(typeof controller.profile, 'function');
assert.equal(typeof controller.jobMatches, 'function');
assert.equal(typeof controller.jobs, 'function');

require('../src/routes/companyRoutes');

console.log('company controller exports OK');
