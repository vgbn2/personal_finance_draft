'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeCppSource,
  analyzeJsSource,
  isProductionSource,
} = require('../../../../../scripts/dev/audit_control_flow.js');

test('control-flow audit counts nested JS branches and loops', () => {
  const result = analyzeJsSource(`
    function evaluate(rows) {
      for (const row of rows) {
        if (row.active) {
          while (row.pending) {
            try {
              consume(row);
            } catch (error) {
              reject(error);
            }
          }
        }
      }
    }
  `);
  assert.equal(result.maxDepth, 5);
});

test('control-flow audit treats else-if as one branch level', () => {
  const result = analyzeJsSource(`
    function classify(value) {
      if (value > 1) return 'high';
      else if (value > 0) return 'low';
      else if (value === 0) return 'zero';
      return 'negative';
    }
  `);
  assert.equal(result.maxDepth, 1);
});

test('control-flow audit resets depth at focused helper functions', () => {
  const result = analyzeJsSource(`
    function outer(rows) {
      if (rows.length) {
        const apply = (row) => {
          if (row.active) {
            for (const value of row.values) consume(value);
          }
        };
        rows.forEach(apply);
      }
    }
  `);
  assert.equal(result.maxDepth, 2);
});

test('control-flow audit counts nested C++ control blocks and ignores literals', () => {
  const result = analyzeCppSource(`
    // if (commented) { for (;;) {} }
    const char* text = "while (string_only)";
    for (const auto& row : rows) {
      if (row.active) {
        for (const auto value : row.values) {
          if (value > 0) consume(value);
        }
      }
    }
  `);
  assert.equal(result.maxDepth, 4);
});

test('control-flow audit excludes tests and generated roots from production', () => {
  assert.equal(isProductionSource('backend/core/src/main.cpp'), true);
  assert.equal(isProductionSource('shared/lib/market/coverage.js'), true);
  assert.equal(isProductionSource('backend/core/test/stats_test.cpp'), false);
  assert.equal(isProductionSource('tests/scripts/foo.test.js'), false);
  assert.equal(isProductionSource('Frontend/dashboard/dist/app.js'), false);
});
