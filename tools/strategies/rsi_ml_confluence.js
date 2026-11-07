'use strict';

// RSI Reversal x ONNX ML — confluence check.
//
// Two independent reads of "what should this asset do next":
//   1. rsi_reversal_signal  — a documented, backtested RSI zone-crossover edge
//      (notebooks/signal_library.json), library-validated per asset/timeframe/condition.
//   2. ml_signal            — a real trained ONNX model's directional read
//      (xgboost_v1 / logistic_v1 / regime_classifier — see storage/models/).
//
// Neither is strong alone (RSI reversal trust tiers top out at HIGH on a handful of
// pairs; the ONNX models beat baseline by only ~3pp — see ML_SECTION_PLAN). The idea
// here isn't to combine them into something provably better (that would need its own
// backtest), it's the standard "two weak independent signals agreeing raises confidence,
// disagreeing is a reason to stand down" filter — cheap to apply, costs nothing when
// either side has no read, and turns two marginal edges into one higher-conviction one
// only when they actually point the same way.
//
// 'buy' (RSI bounce-long) agrees with ML label 'up'; 'sell' (RSI fade-short) agrees with
// 'down'. ML 'flat' or a missing read neither confirms nor denies (agreement = null).

const { getRsiReversalSignal } = require('./rsi_reversal_signal');
const { getMlPrediction } = require('./ml_signal');

const EXPECTED_ML_LABEL = { buy: 'up', sell: 'down' };

/**
 * @param {object} opts  same shape as getRsiReversalSignal, plus:
 * @param {string} [opts.model]  ONNX model to read for confluence (default 'xgboost_v1')
 *
 * Returns { ok:false, error } if the RSI side has no actionable library entry, otherwise:
 *   { ok:true, fired, confluent, agreement, rsi, ml }
 * - fired      : the RSI setup occurred on the latest bar (same as getRsiReversalSignal.fired)
 * - agreement  : true (ML agrees with RSI side) | false (ML disagrees) | null (no ML read)
 * - confluent  : fired && agreement === true — the case worth acting on
 */
function getConfluenceSignal({ asset, timeframe, condition, entry = 'crossover', model = 'xgboost_v1' }) {
  const rsiSignal = getRsiReversalSignal({ asset, timeframe, condition, entry });
  if (!rsiSignal.ok) {
    return { ok: false, error: rsiSignal.error, rsi: rsiSignal };
  }

  const ml = getMlPrediction({ symbol: rsiSignal.cache_symbol, model });
  const expected = EXPECTED_ML_LABEL[rsiSignal.side];
  let agreement = null;
  if (ml.ok && ml.label !== 'flat') {
    agreement = ml.label === expected;
  }

  return {
    ok: true,
    fired: rsiSignal.fired,
    agreement,
    confluent: rsiSignal.fired && agreement === true,
    expected_ml_label: expected,
    rsi: rsiSignal,
    ml: ml.ok
      ? { ok: true, model, label: ml.label, as_of: ml.as_of, predicted_class: ml.predicted_class, backend: ml.backend }
      : { ok: false, model, error: ml.error },
  };
}

module.exports = { getConfluenceSignal };
