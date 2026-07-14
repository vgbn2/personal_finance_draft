'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const MODEL_PATH = path.resolve(__dirname, '../../../storage/models/logistic_v1.onnx');
const MODEL_AVAILABLE = fs.existsSync(MODEL_PATH);

// All tests skip gracefully when onnxruntime-node or model files are absent (CI without assets).
function requireOnnx() {
  try { return require('../../../shared/lib/ml/onnx_runner.js'); } catch { return null; }
}

test('predict() returns valid direction and confidence (all-median features)', { skip: !MODEL_AVAILABLE }, async () => {
  const runner = requireOnnx();
  if (!runner) return;
  const result = await runner.predict('logistic_v1', {});
  assert.ok(['up', 'flat', 'down'].includes(result.direction), `unexpected direction: ${result.direction}`);
  assert.ok(result.confidence >= 0 && result.confidence <= 1, `confidence out of range: ${result.confidence}`);
  assert.ok(Array.isArray(result.class_probs) && result.class_probs.length === 3);
});

test('predict() with partial features (only rsi+close) still returns valid output', { skip: !MODEL_AVAILABLE }, async () => {
  const runner = requireOnnx();
  if (!runner) return;
  const result = await runner.predict('logistic_v1', { rsi: 65, close: 50000 });
  assert.ok(['up', 'flat', 'down'].includes(result.direction));
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
});

test('precomputeForFeatures() attaches _onnxPred to each row', { skip: !MODEL_AVAILABLE }, async () => {
  const runner = requireOnnx();
  if (!runner) return;
  const features = [
    { symbol: 'BTCUSDT', as_of: '2026-01-01', rsi: 40, close: 50000 },
    { symbol: 'BTCUSDT', as_of: '2026-01-02', rsi: 60, close: 52000 },
  ];
  await runner.precomputeForFeatures('logistic_v1', features);
  for (const f of features) {
    assert.ok(f._onnxPred, `_onnxPred not set on row ${f.as_of}`);
    assert.ok(['up', 'flat', 'down'].includes(f._onnxPred.direction));
    assert.ok(f._onnxPred.confidence >= 0 && f._onnxPred.confidence <= 1);
  }
});

test('precomputeForFeatures() handles empty array without error', { skip: !MODEL_AVAILABLE }, async () => {
  const runner = requireOnnx();
  if (!runner) return;
  await assert.doesNotReject(() => runner.precomputeForFeatures('logistic_v1', []));
});
