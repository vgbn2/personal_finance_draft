'use strict';

// ONNX inference runner for promoted models (xgboost_v1, logistic_v1, regime_classifier).
// Feature contract: feature_config.yaml — fill missing columns with medians before inference.
// Singletons per model name; lazy-loaded on first call.

const path = require('path');
const fs = require('fs');

const MODELS_DIR = path.resolve(__dirname, '../../../storage/models');

// Hardcoded from storage/models/feature_config.yaml — avoids a YAML dependency.
// feature_columns order MUST match what train.py used (alphabetical within each group).
const FEATURE_COLUMNS_ALL = [
  'atr','bollinger_lower','bollinger_middle','bollinger_upper','close','divergence_score','macd',
  'regime_AUDUSD_mom','regime_COPPER_mom','regime_CPI_mom','regime_EURUSD_mom','regime_GBPUSD_mom',
  'regime_GOLD_mom','regime_NATGAS_mom','regime_OIL_mom','regime_SILVER_mom','regime_US10Y_mom',
  'regime_USDCAD_mom','regime_USDJPY_mom','regime_USD_BROAD_mom',
  'return_fast','return_slow','rsi','smc_score','volatility',
  'xf_corr_AUDUSD','xf_corr_COPPER','xf_corr_CPI','xf_corr_EURUSD','xf_corr_GBPUSD',
  'xf_corr_GOLD','xf_corr_NATGAS','xf_corr_OIL','xf_corr_SILVER','xf_corr_US10Y',
  'xf_corr_USDCAD','xf_corr_USDJPY','xf_corr_USD_BROAD',
];

const FEATURE_COLUMNS_CROSS_FAMILY = [
  'regime_AUDUSD_mom','regime_COPPER_mom','regime_CPI_mom','regime_EURUSD_mom','regime_GBPUSD_mom',
  'regime_GOLD_mom','regime_NATGAS_mom','regime_OIL_mom','regime_SILVER_mom','regime_US10Y_mom',
  'regime_USDCAD_mom','regime_USDJPY_mom','regime_USD_BROAD_mom',
  'xf_corr_AUDUSD','xf_corr_COPPER','xf_corr_CPI','xf_corr_EURUSD','xf_corr_GBPUSD',
  'xf_corr_GOLD','xf_corr_NATGAS','xf_corr_OIL','xf_corr_SILVER','xf_corr_US10Y',
  'xf_corr_USDCAD','xf_corr_USDJPY','xf_corr_USD_BROAD',
];

const MEDIANS = {
  atr:0.002948214286,bollinger_lower:100.8696501,bollinger_middle:121.71875,bollinger_upper:131.106297,
  close:114.26,divergence_score:0,macd:0.003189549228,
  regime_AUDUSD_mom:-0.0002538033174,regime_COPPER_mom:0.006695975341,regime_CPI_mom:0.00213333673,
  regime_EURUSD_mom:0.0002748259436,regime_GBPUSD_mom:0.001232380806,regime_GOLD_mom:0.01075906139,
  regime_NATGAS_mom:0.0112752891,regime_OIL_mom:-0.007713561146,regime_SILVER_mom:0.01219463174,
  regime_US10Y_mom:0.002222222222,regime_USDCAD_mom:0.002293413603,regime_USDJPY_mom:0.008291527313,
  regime_USD_BROAD_mom:-0.0003989623861,
  return_fast:0,return_slow:0.001100513573,rsi:50.88221268,smc_score:0,volatility:0.01669328993,
  xf_corr_AUDUSD:0.1007710897,xf_corr_COPPER:0.1381453602,xf_corr_CPI:0,
  xf_corr_EURUSD:0.07082114668,xf_corr_GBPUSD:0.06394274498,xf_corr_GOLD:0.07821409787,
  xf_corr_NATGAS:0.03769577938,xf_corr_OIL:0.06442031543,xf_corr_SILVER:0.1197998303,
  xf_corr_US10Y:-0.03122693959,xf_corr_USDCAD:-0.09719380472,xf_corr_USDJPY:-0.007804893486,
  xf_corr_USD_BROAD:-0.1537964857,
};

// Model registry (from metadata.json)
const MODEL_META = {
  xgboost_v1:       { file: 'xgboost_v1.onnx',       columns: FEATURE_COLUMNS_ALL,          n: 38 },
  logistic_v1:      { file: 'logistic_v1.onnx',       columns: FEATURE_COLUMNS_ALL,          n: 38 },
  regime_classifier:{ file: 'regime_classifier.onnx', columns: FEATURE_COLUMNS_CROSS_FAMILY, n: 26 },
};

// Label classes: 0=down, 1=flat, 2=up
const LABEL_NAMES = ['down', 'flat', 'up'];

const sessions = {};

async function getSession(modelName) {
  if (sessions[modelName]) return sessions[modelName];
  let ort;
  try { ort = require('onnxruntime-node'); } catch {
    throw new Error('onnxruntime-node not installed — run: npm install onnxruntime-node');
  }
  const meta = MODEL_META[modelName];
  if (!meta) throw new Error(`Unknown ONNX model: ${modelName}`);
  const modelPath = path.join(MODELS_DIR, meta.file);
  if (!fs.existsSync(modelPath)) throw new Error(`Model file not found: ${modelPath}`);
  sessions[modelName] = await ort.InferenceSession.create(modelPath);
  return sessions[modelName];
}

function buildTensor(modelName, featureObj, ort) {
  const meta = MODEL_META[modelName];
  const cols = meta.columns;
  const data = new Float32Array(cols.length);
  for (let i = 0; i < cols.length; i++) {
    const v = featureObj[cols[i]];
    data[i] = (v != null && Number.isFinite(v)) ? v : (MEDIANS[cols[i]] ?? 0);
  }
  return new ort.Tensor('float32', data, [1, cols.length]);
}

// Returns { direction: 'up'|'flat'|'down', confidence: 0–1, class_probs: [p_down,p_flat,p_up] }
async function predict(modelName, featureObj) {
  let ort;
  try { ort = require('onnxruntime-node'); } catch {
    return { direction: 'flat', confidence: 0, class_probs: [0, 1, 0] };
  }
  const session = await getSession(modelName);
  const tensor = buildTensor(modelName, featureObj, ort);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: tensor });

  // Outputs vary by model type: probabilities tensor or label + probabilities
  const outputNames = session.outputNames;
  let probs;
  // Try to find a probabilities output (shape [1,3])
  for (const name of outputNames) {
    const t = results[name];
    if (t && t.dims && t.dims[t.dims.length - 1] === 3) {
      probs = Array.from(t.data);
      break;
    }
  }
  if (!probs) {
    // Fallback: use the label output to construct a hard prediction
    const labelTensor = results[outputNames[0]];
    const label = Number(Array.from(labelTensor.data)[0]);
    probs = [0, 0, 0];
    probs[label] = 1;
  }

  const predictedClass = probs.indexOf(Math.max(...probs));
  const direction = LABEL_NAMES[predictedClass];
  const confidence = probs[predictedClass];
  return { direction, confidence: +confidence.toFixed(4), class_probs: probs.map(p => +p.toFixed(4)) };
}

// Precompute predictions for all rows in a feature array, attaching _onnxPred to each.
// Call this BEFORE a sync runBacktestJs loop so the sync model.predict() can read _onnxPred.
async function precomputeForFeatures(modelName, features) {
  if (!features || features.length === 0) return;
  for (const f of features) {
    f._onnxPred = await predict(modelName, f);
  }
}

module.exports = { predict, precomputeForFeatures, MODEL_META, LABEL_NAMES };
