'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveModel, ONNX_MODEL_NAMES, MODEL_ALIASES } = require('../../../shared/lib/ml/models.js');

test('resolveModel returns an onnx_model entry for xgboost_v1', () => {
  const m = resolveModel('xgboost_v1');
  assert.equal(m.name, 'xgboost_v1');
  assert.equal(m.status, 'onnx_model');
  assert.equal(m.family, 'onnx');
});

test('resolveModel returns an onnx_model entry for logistic_v1', () => {
  const m = resolveModel('logistic_v1');
  assert.equal(m.name, 'logistic_v1');
  assert.equal(m.status, 'onnx_model');
});

test('MODEL_ALIASES.xgboost now points to xgboost_v1 (not the old ranker stub)', () => {
  assert.equal(MODEL_ALIASES.xgboost, 'xgboost_v1');
});

test('MODEL_ALIASES.lr now points to logistic_v1 (trained model)', () => {
  assert.equal(MODEL_ALIASES.lr, 'logistic_v1');
});

test('ONNX_MODEL_NAMES contains all three trained models', () => {
  assert.ok(ONNX_MODEL_NAMES.has('xgboost_v1'));
  assert.ok(ONNX_MODEL_NAMES.has('logistic_v1'));
  assert.ok(ONNX_MODEL_NAMES.has('regime_classifier'));
});

test('onnx model predict() with _onnxPred set returns long for up direction', () => {
  const m = resolveModel('xgboost_v1');
  const feature = { _onnxPred: { direction: 'up', confidence: 0.72 } };
  const result = m.predict(feature);
  assert.equal(result.direction, 'long');
  assert.equal(result.confidence, 0.72);
});

test('onnx model predict() with _onnxPred down returns flat (no short support in current backtest)', () => {
  const m = resolveModel('logistic_v1');
  const feature = { _onnxPred: { direction: 'down', confidence: 0.65 } };
  const result = m.predict(feature);
  assert.equal(result.direction, 'flat');
});

test('onnx model predict() without _onnxPred returns flat (not precomputed — safe default)', () => {
  const m = resolveModel('xgboost_v1');
  const result = m.predict({});
  assert.equal(result.direction, 'flat');
  assert.equal(result.confidence, 0);
});
