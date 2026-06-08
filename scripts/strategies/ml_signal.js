'use strict';

// Shared helper for the ML smoke-test strategies (ml_smoke_alpaca.js / ml_smoke_polymarket.js).
//
// Runs one of our REAL trained ONNX models (storage/models/*.onnx — xgboost_v1, logistic_v1,
// regime_classifier; NOT the heuristic `modelCandidates` adapters in shared/lib/models.js)
// over the latest cached feature row for a symbol, via the C++ backend's `ml predict`
// (genuine onnx_runtime inference — see backend/core/src/main.cpp printMl). Returns the
// model's predicted direction (down|flat|up) so a strategy can act on a real prediction.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { REPO_ROOT } = require('../../backend/cli/lib/utils.js');
const { runBackendCommand } = require('../../backend/cli/commands/tools/backend.js');

const MODELS_DIR = path.join(REPO_ROOT, 'storage', 'models');
const MANIFEST_PATH = path.join(MODELS_DIR, 'serving_manifest.txt');
const METADATA_PATH = path.join(MODELS_DIR, 'metadata.json');
const FRAME_PATH = path.join(REPO_ROOT, 'storage', 'data', 'ml', 'feature_frame.csv');
const DEFAULT_LABELS = { '0': 'down', '1': 'flat', '2': 'up' };

function loadLabelClasses() {
  try {
    const meta = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    return meta.label_classes || DEFAULT_LABELS;
  } catch {
    return DEFAULT_LABELS;
  }
}

// Feature frame is a flat multi-symbol CSV (symbol, as_of, <features...>); pick the
// most recent cached row for `symbol` by lexicographic max on the ISO `as_of` column.
function latestRowForSymbol(framePath, symbol) {
  const lines = fs.readFileSync(framePath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0];
  const cols = header.split(',');
  const symbolIdx = cols.indexOf('symbol');
  const asOfIdx = cols.indexOf('as_of');
  if (symbolIdx === -1 || asOfIdx === -1) return null;

  let best = null;
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',');
    if (cells[symbolIdx] !== symbol) continue;
    if (!best || cells[asOfIdx] > best.cells[asOfIdx]) best = { line: lines[i], cells };
  }
  if (!best) return null;
  return { header, line: best.line, asOf: best.cells[asOfIdx] };
}

/**
 * Returns { ok, symbol, model, as_of, predicted_class, label, backend } for the latest
 * cached row of `symbol`, scored by the real ONNX `model` (e.g. 'xgboost_v1').
 * label is one of 'down' | 'flat' | 'up' (per storage/models/metadata.json label_classes).
 */
function getMlPrediction({ symbol, model }) {
  const row = latestRowForSymbol(FRAME_PATH, symbol);
  if (!row) {
    return { ok: false, error: `no cached feature rows for symbol '${symbol}' in ${FRAME_PATH}` };
  }

  // `ml predict` scores whatever rows are in the frame; hand it a single-row CSV so
  // class_counts collapses to exactly one entry — that entry's key IS this row's prediction.
  const tmpPath = path.join(REPO_ROOT, 'storage', 'data', 'ml', `.tmp_signal_${crypto.randomBytes(4).toString('hex')}.csv`);
  fs.writeFileSync(tmpPath, `${row.header}\n${row.line}\n`, 'utf8');

  let result;
  try {
    result = runBackendCommand([
      'ml', 'predict',
      '--frame', tmpPath,
      '--manifest', MANIFEST_PATH,
      '--models-dir', MODELS_DIR,
      '--model', model,
      '--limit', '1',
    ]);
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }

  if (!result || result.ok === false || !Array.isArray(result.results) || result.results.length === 0) {
    return { ok: false, error: 'ml predict failed', detail: result };
  }

  const modelResult = result.results.find((r) => r.model === model) || result.results[0];
  const classCounts = modelResult.class_counts || {};
  const predictedClass = Object.keys(classCounts)[0];
  const labels = loadLabelClasses();

  return {
    ok: true,
    symbol,
    model,
    as_of: row.asOf,
    backend: modelResult.backend,
    predicted_class: predictedClass !== undefined ? Number(predictedClass) : null,
    label: predictedClass !== undefined ? (labels[predictedClass] || 'unknown') : 'unknown',
  };
}

module.exports = { getMlPrediction };
