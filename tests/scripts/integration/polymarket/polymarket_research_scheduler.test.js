'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  pruneOrderbookLiteFile,
  runPolymarketResearchCycle,
  runPolymarketResearchScheduler,
  selectScopedActiveTokens,
} = require('../../../../backend/scripts/data_ops/polymarket_research_scheduler.js');
const { commandPolymarket } = require('../../../../backend/cli/commands/trade/trade_polymarket.js');
const { tokenOrderbookLitePath } = require('../../../../shared/lib/market/polymarket_history.js');

const NOW = Date.parse('2026-07-10T00:00:00.000Z');

async function captureCliOutput(settingsFile, callback) {
  const previousPath = process.env.SOVEREIGN_USER_SETTINGS_PATH;
  const previousLog = console.log;
  const output = [];
  process.env.SOVEREIGN_USER_SETTINGS_PATH = settingsFile;
  console.log = (...values) => output.push(values.join(' '));
  try {
    return { status: await callback(), output: output.join('\n') };
  } finally {
    console.log = previousLog;
    if (previousPath === undefined) delete process.env.SOVEREIGN_USER_SETTINGS_PATH;
    else process.env.SOVEREIGN_USER_SETTINGS_PATH = previousPath;
  }
}

function scope() {
  return {
    token_ids: ['yes-active', 'yes-closed', 'not-allowlisted'],
    markets: [
      { id: 'active', active: true, closed: false, endDate: '2026-08-01T00:00:00Z', tokens: [{ token_id: 'yes-active' }, { token_id: 'no-active' }] },
      { id: 'closed', active: false, closed: true, tokens: [{ token_id: 'yes-closed' }] },
      { id: 'unlisted', active: true, closed: false, tokens: [{ token_id: 'other-token' }] },
    ],
  };
}

test('active token selection requires an explicit allowlist and excludes closed markets', () => {
  const selected = selectScopedActiveTokens(scope(), { nowMs: NOW, maxTokens: 10 });
  assert.deepEqual(selected.map((item) => item.tokenId), ['yes-active']);
  assert.throws(() => selectScopedActiveTokens({ markets: scope().markets }, { nowMs: NOW }), /explicitly list token_ids/);
});

test('cycle defaults to a read-only plan without invoking fetch dependencies', async () => {
  let calls = 0;
  const result = await runPolymarketResearchCycle({ scope: scope(), nowMs: NOW }, {
    fetchHistory: async () => { calls += 1; return { ok: true, data: [] }; },
    captureOrderbook: async () => { calls += 1; return { ok: true, rows: [] }; },
  });
  assert.equal(result.mode, 'dry_run_plan');
  assert.equal(result.selected_tokens.length, 1);
  assert.equal(calls, 0);
});

test('executed cycle captures only scoped token and enforces row retention', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-scheduler-'));
  try {
    const captured = [];
    const result = await runPolymarketResearchCycle({
      scope: scope(), archiveRoot: root, nowMs: NOW, execute: true,
      retentionDays: 2, maxRowsPerToken: 2, maxArchiveBytes: 1024 * 1024,
    }, {
      fetchHistory: async (tokenId) => ({ ok: true, source: 'fixture', data: [{ t: NOW / 1000, p: 0.42, tokenId }] }),
      captureOrderbook: async (market, tokenId, opts) => {
        captured.push(tokenId);
        const file = tokenOrderbookLitePath(tokenId, opts.root);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const rows = [
          { token_id: tokenId, snapshot_ts: (NOW - 4 * 86400000) / 1000 },
          { token_id: tokenId, snapshot_ts: (NOW - 1000) / 1000 },
          { token_id: tokenId, snapshot_ts: NOW / 1000 },
        ];
        fs.writeFileSync(file, `${rows.map(JSON.stringify).join('\n')}\n`);
        return { ok: true, rows };
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(captured, ['yes-active']);
    assert.equal(result.prices_written, 1);
    assert.equal(result.snapshots_written, 3);
    assert.equal(result.rows_pruned, 1);
    assert.equal(fs.readFileSync(tokenOrderbookLitePath('yes-active', root), 'utf8').trim().split('\n').length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scheduler rejects unsafe fast polling', async () => {
  await assert.rejects(
    runPolymarketResearchScheduler({ scope: scope(), pollSeconds: 5, once: true }),
    /at least 60/,
  );
});

test('execute mode rejects configurations with no enabled capture lane', async () => {
  await assert.rejects(
    runPolymarketResearchScheduler({
      scope: scope(),
      nowMs: NOW,
      execute: true,
      once: true,
      capturePrices: false,
      captureOrderbooks: false,
    }),
    /requires at least one capture lane/,
  );
});

test('execute mode rejects a scope with no active allowlisted token', async () => {
  await assert.rejects(
    runPolymarketResearchScheduler({
      scope: {
        token_ids: ['closed-token'],
        markets: [{ id: 'closed', active: false, tokens: [{ token_id: 'closed-token' }] }],
      },
      execute: true,
      once: true,
    }),
    /requires at least one active allowlisted token/,
  );
});

test('execute mode fails visibly when selected work captures zero records', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-zero-capture-'));
  try {
    const result = await runPolymarketResearchCycle({
      scope: scope(),
      archiveRoot: root,
      nowMs: NOW,
      execute: true,
    }, {
      fetchHistory: async () => ({ ok: true, source: 'fixture', data: [] }),
      captureOrderbook: async () => ({ ok: true, rows: [] }),
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [{ stage: 'capture', error: 'no_records_captured' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('execute mode fails visibly when the archive limit skips all selected work', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-full-archive-'));
  try {
    fs.writeFileSync(path.join(root, 'existing.bin'), 'full');
    const result = await runPolymarketResearchCycle({
      scope: scope(),
      archiveRoot: root,
      nowMs: NOW,
      execute: true,
      captureOrderbooks: false,
      maxArchiveBytes: 1,
    }, {
      fetchHistory: async () => ({ ok: true, data: [{ t: NOW / 1000, p: 0.5 }] }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.skipped_storage_limit, 1);
    assert.deepEqual(result.errors, [{ stage: 'capture', error: 'no_records_captured_archive_limit' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI feature prerequisite fails visibly with a nonzero status', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-scheduler-cli-feature-'));
  try {
    const settingsFile = path.join(root, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ feature_flags: { polymarket: false } }));
    const run = await captureCliOutput(settingsFile, () => (
      commandPolymarket(['history', 'schedule', '--json'])
    ));

    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /"type":\s*"feature_gate"/);
    assert.match(run.output, /Polymarket is disabled in user settings/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI execute scope prerequisite fails visibly with a nonzero status', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-scheduler-cli-scope-'));
  try {
    const settingsFile = path.join(root, 'settings.json');
    const scopeFile = path.join(root, 'scope.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ feature_flags: { polymarket: true } }));
    fs.writeFileSync(scopeFile, JSON.stringify({
      token_ids: ['closed-token'],
      markets: [{ id: 'closed', active: false, tokens: [{ token_id: 'closed-token' }] }],
    }));
    const run = await captureCliOutput(settingsFile, () => commandPolymarket([
      'history', 'schedule',
      '--scope-file', scopeFile,
      '--execute', '--once', '--json',
    ]));

    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /"mode":\s*"research_scheduler"/);
    assert.match(run.output, /requires at least one active allowlisted token/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pruner caps valid recent rows per token', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-prune-'));
  const file = path.join(root, 'book.jsonl');
  try {
    const rows = [0, 1, 2].map((offset) => ({ snapshot_ts: (NOW - offset * 1000) / 1000 }));
    fs.writeFileSync(file, `${rows.map(JSON.stringify).join('\n')}\n`);
    const result = pruneOrderbookLiteFile(file, { nowMs: NOW, retentionDays: 1, maxRows: 2 });
    assert.deepEqual(result, { before: 3, after: 2, removed: 1 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scheduler initializes default empty scope when scope file is missing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-missing-scope-'));
  const scopeFile = path.join(root, 'nested', 'scope.json');
  try {
    await assert.rejects(
      runPolymarketResearchScheduler({
        scopeFile,
        nowMs: NOW,
        once: true,
      }, {
        fetchHistory: async () => ({ ok: true, data: [] }),
        captureOrderbook: async () => ({ ok: true, rows: [] }),
      }),
      /Scope must explicitly list token_ids/,
    );
    assert.equal(fs.existsSync(scopeFile), true);
    const content = JSON.parse(fs.readFileSync(scopeFile, 'utf8'));
    assert.deepEqual(content, { markets: [], token_ids: [] });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
