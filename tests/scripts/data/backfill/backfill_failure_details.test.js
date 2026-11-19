'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repo = path.resolve(__dirname, '../../../..');

if (process.argv.includes('--fixture-worker')) {
  const root = process.argv[process.argv.indexOf('--fixture-worker') + 1];
  const requests = [];
  global.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'api.binance.com');
    assert.ok(['BNBUSDT', 'NEARUSDT'].includes(url.searchParams.get('symbol')));
    requests.push(url.searchParams.get('symbol'));
    throw new Error('fixture provider failure api_key=SYNTHETIC_PRIVATE_VALUE\nsecond line');
  };
  global.suppressLogs = true;
  const { makeRealExecutor } = require(path.join(root, 'frontend/cli-tui/commands/data/backfill_daemon.js'));
  const execute = makeRealExecutor();
  Promise.all(['incremental', 'deep'].flatMap((mode) => (
    ['BNBUSDT', 'NEARUSDT'].map(async (symbol) => ({
      mode,
      symbol,
      result: await execute({ symbol, family: 'crypto', baseTf: '1m' }, mode, 7),
    }))
  ))).then(async (results) => {
    const { commandCryptoDeepBackfill } = require(path.join(root, 'frontend/cli-tui/commands/data/data_deep_backfill.js'));
    const failureDetails = [];
    const failureCode = await commandCryptoDeepBackfill([
      '--symbol', 'BNBUSDT', '--days', '7', '--json',
    ], { failureDetails });
    // Empty provider response traverses real parser/ingestion and remains a
    // failed crypto command, rather than inventing a successful fill of data.
    global.fetch = async () => new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const emptyCode = await commandCryptoDeepBackfill([
      '--symbol', 'NEARUSDT', '--days', '7', '--json',
    ]);
    global.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, 'api.binance.com');
      const timestamp = Date.now() - 120000;
      return new Response(JSON.stringify([
        [timestamp, '100', '102', '99', '101', '10'],
      ]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const successDetails = [];
    const successCode = await commandCryptoDeepBackfill([
      '--symbol', 'BNBUSDT', '--days', '7', '--json',
    ], { failureDetails: successDetails });
    const successResult = await execute({
      symbol: 'BNBUSDT',
      family: 'crypto',
      baseTf: '1m',
    }, 'incremental', 7);
    const bin = path.join(root, 'storage/data/ts/BNBUSDT_1m.bin');
    const successBytes = fs.existsSync(bin) ? fs.statSync(bin).size : 0;
    process.stdout.write(JSON.stringify({
      results,
      requests,
      failureCode,
      emptyCode,
      failureDetails,
      successCode,
      successDetails,
      successResult,
      successBytes,
    }));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  test('crypto failure collector redacts before bounding and limits retained details', () => {
    const { retainCryptoFailure } = require('../../../../frontend/cli-tui/commands/data/data_deep_backfill.js');
    const details = [];
    for (let i = 0; i < 5; i += 1) {
      retainCryptoFailure(details, 'failure https://user:SYNTH_URL@example.invalid/path?token=SYNTH_QUERY Bearer SYNTH_BEARER api_key=SYNTH_KEY\n' + '😀'.repeat(300));
    }
    assert.equal(details.length, 3);
    for (const detail of details) {
      assert.equal(Array.from(detail).length, 256);
      assert.ok(!/SYNTH_|[\r\n]/.test(detail));
      assert.match(detail, /redacted/);
    }
  });

  test('crypto failure collector redacts structured credentials and entire authorization payloads', () => {
    const { retainCryptoFailure } = require('../../../../frontend/cli-tui/commands/data/data_deep_backfill.js');
    for (const message of [
      '{"api_key":"SYNTH_JSON_KEY","token": "SYNTH_JSON_TOKEN"}',
      '{"password":"SYNTH_JSON_PASSWORD","authorization":"Basic SYNTH_JSON_AUTH"}',
      'Authorization: Basic SYNTH_BASIC',
      'aUtHoRiZaTiOn: bEaReR SYNTH_HEADER_BEARER',
      "{'secret': 'SYNTH_SINGLE_QUOTED'}",
    ]) {
      const details = [];
      retainCryptoFailure(details, message);
      assert.equal(details.length, 1);
      assert.ok(!details[0].includes('SYNTH_'), 'structured or header credential survived redaction');
    }
  });

  test('real crypto executor retains bounded redacted failure details while quiet', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-details-'));
    try {
      for (const directory of ['frontend/cli-tui', 'backend', 'shared', 'configs', 'tools']) {
        fs.cpSync(path.join(repo, directory), path.join(scratch, directory), {
          recursive: true,
          filter: (source) => !source.split(path.sep).some((part) => ['node_modules', 'dist', 'build'].includes(part)),
        });
      }
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(scratch, 'node_modules'), 'dir');
      fs.copyFileSync(path.join(repo, 'package.json'), path.join(scratch, 'package.json'));
      const child = spawnSync(process.execPath, [__filename, '--fixture-worker', scratch], {
        encoding: 'utf8',
        timeout: 30000,
        env: {
          PATH: process.env.PATH,
          HOME: scratch,
          TMPDIR: scratch,
          SOVEREIGN_ENABLE_RAW_HTTP_DISK_CACHE: 'false',
        },
      });
      assert.equal(child.status, 0, child.stderr);
      const {
        results, requests, failureCode, emptyCode, failureDetails,
        successCode, successDetails, successResult, successBytes,
      } = JSON.parse(child.stdout);
      assert.ok(requests.length > 0, 'must reach real provider transport');
      assert.equal(failureCode, 1, 'direct command preserves numeric failure return');
      assert.equal(emptyCode, 1, 'empty response preserves numeric failure return');
      assert.ok(failureDetails.length > 0, 'direct command collects details without changing return type');
      assert.equal(successCode, 0, 'successful direct command retains numeric zero');
      assert.deepEqual(successDetails, [], 'new successful invocation has no stale failure detail');
      assert.equal(successResult.ok, true);
      assert.equal(successResult.error, undefined, 'successful executor does not reuse prior failure');
      assert.ok(successBytes > 0, 'real ingestion must write successful bars to isolated storage');
      assert.equal(results.length, 4);
      for (const { result, mode, symbol } of results) {
        assert.equal(result.ok, false);
        // snapshot_fetchers.js replaces individual transport errors with this
        // aggregate error. This boundary must retain the diagnosis it receives.
        assert.ok(result.error.includes(`Failed to fetch crypto data for ${symbol} via binance or fallbacks`), `${mode} retains its symbol diagnosis`);
        const other = symbol === 'BNBUSDT' ? 'NEARUSDT' : 'BNBUSDT';
        assert.ok(!result.error.includes(other), 'concurrent jobs must not exchange diagnoses');
        assert.ok(!result.error.includes('SYNTHETIC_PRIVATE_VALUE'), 'synthetic credential must be redacted');
        assert.ok(!/[\r\n]/.test(result.error), 'one log record per failure');
        assert.ok(Array.from(result.error).length <= 1024, 'rendered failure detail is bounded');
      }
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
}
