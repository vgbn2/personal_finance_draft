'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { signalStatus } = require('../../../../backend/api/server/services/cli_executor.js');
const promoteRoute = require('../../../../backend/api/server/routes/market/signal_promote.js');

const NOW = Date.parse('2026-07-11T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function modelReport(generatedAt) {
  return {
    generated_at: generatedAt,
    source_mode: 'live',
    threshold: 0.55,
    data_quality_ok: true,
    per_symbol_winners: [{
      symbol: 'BTCUSDT',
      winner: 'test_model',
      candidates: [{
        symbol: 'BTCUSDT',
        model: 'test_model',
        family: 'baseline',
        status: 'validated_model',
        trained: true,
        decision_ready: true,
        hit_rate: 0.8,
        expectancy: 0.02,
        sharpe_like: 0.5,
        total_return: 0.2,
        trades: 100,
      }],
    }],
  };
}

test('signal status expires old model reports and prevents active-signal claims', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-freshness-'));
  try {
    const backtestPath = path.join(dir, 'backtest.json');
    const freshPath = path.join(dir, 'fresh.json');
    const stalePath = path.join(dir, 'stale.json');
    fs.writeFileSync(backtestPath, JSON.stringify({ generated_at: new Date(NOW).toISOString(), data_quality_ok: true }));
    fs.writeFileSync(freshPath, JSON.stringify(modelReport(new Date(NOW - 60 * 60 * 1000).toISOString())));
    fs.writeFileSync(stalePath, JSON.stringify(modelReport(new Date(NOW - 25 * 60 * 60 * 1000).toISOString())));

    const runtime = { now: NOW, reportMaxAgeMs: DAY_MS };
    const fresh = signalStatus({ model_report: freshPath, backtest_report: backtestPath }, runtime);
    const stale = signalStatus({ model_report: stalePath, backtest_report: backtestPath }, runtime);

    assert.equal(fresh.schema_version, 2);
    assert.equal(fresh.source_report.fresh, true);
    assert.equal(fresh.active_signals, 1);
    assert.equal(fresh.signals[0].expired, false);
    assert.equal(fresh.signals[0].reason, 'candidate_above_threshold_not_promoted');

    assert.equal(stale.source_report.fresh, false);
    assert.equal(stale.source_report.age_ms, 25 * 60 * 60 * 1000);
    assert.equal(stale.active_signals, 0);
    assert.equal(stale.signals[0].expired, true);
    assert.equal(stale.signals[0].active, false);
    assert.equal(stale.signals[0].reason, 'source_report_expired');
    assert.equal(stale.quality.report_fresh, false);

    console.log(JSON.stringify({
      type: 'signal_freshness_contract',
      fresh_active: fresh.active_signals,
      stale_active: stale.active_signals,
      stale_age_h: stale.source_report.age_ms / (60 * 60 * 1000),
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('signal reason precedence remains freshness, readiness, quality, then threshold review', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signal-reasons-'));
  try {
    const backtestPath = path.join(dir, 'backtest.json');
    const modelPath = path.join(dir, 'model.json');
    const report = modelReport(new Date(NOW).toISOString());
    const candidate = report.per_symbol_winners[0].candidates[0];
    fs.writeFileSync(backtestPath, JSON.stringify({
      generated_at: new Date(NOW).toISOString(),
      data_quality_ok: false,
    }));

    candidate.decision_ready = false;
    fs.writeFileSync(modelPath, JSON.stringify(report));
    const notReady = signalStatus({ model_report: modelPath, backtest_report: backtestPath }, {
      now: NOW,
      reportMaxAgeMs: DAY_MS,
    });
    assert.equal(notReady.signals[0].reason, 'model_not_decision_ready');

    candidate.decision_ready = true;
    fs.writeFileSync(modelPath, JSON.stringify(report));
    const badQuality = signalStatus({ model_report: modelPath, backtest_report: backtestPath }, {
      now: NOW + 1,
      reportMaxAgeMs: DAY_MS,
    });
    assert.equal(badQuality.signals[0].reason, 'data_quality_not_approved');

    fs.writeFileSync(backtestPath, JSON.stringify({
      generated_at: new Date(NOW).toISOString(),
      data_quality_ok: true,
    }));
    candidate.expectancy = -0.01;
    fs.writeFileSync(modelPath, JSON.stringify(report));
    const belowThreshold = signalStatus({ model_report: modelPath, backtest_report: backtestPath }, {
      now: NOW + 2,
      reportMaxAgeMs: DAY_MS,
    });
    assert.equal(belowThreshold.signals[0].reason, 'candidate_for_review_not_promoted');
    assert.equal(belowThreshold.signals[0].active, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('signal review route rejects IDs that are not currently fresh and active', async () => {
  const payload = await promoteRoute.handle(
    { signalIds: ['definitely-not-an-active-signal'] },
    { req: { method: 'POST', headers: {} } },
  );
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'stale_or_inactive_signals');
  assert.deepEqual(payload.rejected_signal_ids, ['definitely-not-an-active-signal']);
  assert.equal(promoteRoute.status(payload), 400);
});

test('signal review route rejects malformed IDs instead of rewriting them', async () => {
  const payload = await promoteRoute.handle(
    { signalIds: ['active-signal!'] },
    { req: { method: 'POST', headers: {} } },
  );
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'invalid_signal_ids');
  assert.deepEqual(payload.rejected_signal_ids, ['active-signal!']);
  assert.equal(promoteRoute.status(payload), 400);
});
