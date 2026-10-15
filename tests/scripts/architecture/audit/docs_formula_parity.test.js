'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { runRepoWideAudit } = require('../../../../scripts/dev/verify_docs_formula_parity');

test('Repo-wide source <-> docs parity audit verifies formulas and symbol references', () => {
  // Executes dynamic repo-wide scan and mathematical formula suite
  assert.doesNotThrow(() => {
    runRepoWideAudit();
  }, 'All documented formulas, paths, and symbols must execute with zero divergence');
});
