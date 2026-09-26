'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CLI_PATH = path.resolve(__dirname, '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');
const { commands, categories } = require('../../../backend/cli/tui/manifest.js');

/**
 * Builds CLI argument list from a manifest command definition and flag values.
 */
function buildArgvFromManifest(cmd, flagValues = {}) {
  const argv = [];
  if (Array.isArray(cmd.prefix) && cmd.prefix.length > 0) {
    argv.push(...cmd.prefix);
  }
  const idParts = String(cmd.id || '').trim().split(/\s+/).filter(Boolean);
  argv.push(...idParts);

  const mergedFlags = { ...(cmd.flags || {}) };
  for (const [flagKey, val] of Object.entries(flagValues)) {
    if (!mergedFlags[flagKey]) {
      mergedFlags[flagKey] = { type: typeof val === 'boolean' ? 'confirm' : 'text' };
    }
  }

  for (const [flagKey, meta] of Object.entries(mergedFlags)) {
    const val = flagValues[flagKey] !== undefined ? flagValues[flagKey] : meta.default;
    if (meta.type === 'confirm' || meta.t === 'yn') {
      if (val === true || val === 'true') {
        argv.push(flagKey);
      }
    } else if (val !== undefined && val !== null && String(val).trim() !== '') {
      argv.push(flagKey, String(val).trim());
    }
  }

  return argv;
}

function getOptionsList(meta) {
  if (!meta || meta.type !== 'select') return [];
  const raw = typeof meta.options === 'function' ? meta.options() : meta.options;
  return Array.isArray(raw) ? raw : [];
}

/**
 * Generates flag variations to test:
 * 1. Default values
 * 2. Alternate select options
 * 3. Boolean toggles
 * 4. Sample non-empty string arguments
 */
function generateFlagPermutations(cmd) {
  const permutations = [];
  const baseFlags = {};
  const flagsMeta = cmd.flags || {};

  for (const [key, meta] of Object.entries(flagsMeta)) {
    const opts = getOptionsList(meta);
    if (meta.default !== undefined) {
      baseFlags[key] = meta.default;
    } else if (opts.length > 0) {
      const first = opts[0];
      baseFlags[key] = first.value !== undefined ? first.value : first;
    } else {
      baseFlags[key] = '';
    }
  }

  // Safety caps for fast headless testing
  if (cmd.id === 'bt') {
    baseFlags['--days'] = '0';
    baseFlags['--allow-degraded'] = true;
    if (!baseFlags['--strategy']) baseFlags['--strategy'] = 'config/strategies/curated/forex_trend_breakout.yaml';
    if (!baseFlags['--timeframe']) baseFlags['--timeframe'] = '1d';
  }
  if (cmd.id === 'mass-bt') {
    baseFlags['--days'] = '0';
    baseFlags['--timeframes'] = '1d';
    baseFlags['--allow-degraded'] = true;
  }
  if (cmd.id === 'optimize') {
    if (!baseFlags['--strategy']) baseFlags['--strategy'] = 'config/strategies/curated/forex_trend_breakout.yaml';
    if (!baseFlags['--timeframe']) baseFlags['--timeframe'] = '1d';
  }
  if (cmd.id === 'sweep') {
    baseFlags['--symbols'] = 'EURUSD';
    baseFlags['--timeframes'] = '1d';
    baseFlags['--top-k'] = '2';
  }
  if (cmd.id === 'bias') baseFlags['--no-backfill'] = true;
  if (cmd.id === 'scorecard') {
    baseFlags['--no-backfill'] = true;
    baseFlags['--allow-degraded'] = true;
  }
  if (cmd.id === 'ingest') {
    baseFlags['--family'] = 'crypto';
    baseFlags['--symbol'] = 'BTCUSDT';
    baseFlags['--history-days'] = '1';
  }
  if (cmd.id === 'backfill-daemon') {
    baseFlags['--families'] = 'crypto';
    baseFlags['--symbols'] = 'BTCUSDT';
    baseFlags['--once'] = true;
  }
  if (cmd.id === 'watch') {
    baseFlags['--once'] = true;
  }

  permutations.push({ label: 'default', flags: { ...baseFlags } });

  // Generate an alternate permutation if there are select options or confirm flags
  const altFlags = { ...baseFlags };
  let hasAlt = false;

  for (const [key, meta] of Object.entries(flagsMeta)) {
    const opts = getOptionsList(meta);
    if (opts.length > 1) {
      const currentVal = baseFlags[key];
      const altOpt = opts.find(opt => (opt.value !== undefined ? opt.value : opt) !== currentVal);
      if (altOpt) {
        altFlags[key] = altOpt.value !== undefined ? altOpt.value : altOpt;
        hasAlt = true;
      }
    } else if (meta.type === 'confirm' || meta.t === 'yn') {
      // Keep safety guards locked in tests (prevent unbounded daemon loops)
      if (key === '--once') {
        altFlags[key] = true;
      } else if (key === '--deep-all') {
        altFlags[key] = false;
      } else if (key === '--no-backfill') {
        altFlags[key] = true;
      } else {
        altFlags[key] = !meta.default;
        hasAlt = true;
      }
    } else if (meta.type === 'text' && !meta.default) {
      if (key.includes('symbol')) altFlags[key] = 'EURUSD';
      else if (key.includes('timeframe')) altFlags[key] = '1d';
      else if (key.includes('days')) altFlags[key] = '5';
      else if (key.includes('notional')) altFlags[key] = '100';
      hasAlt = true;
    }
  }

  if (hasAlt) {
    if (cmd.id === 'bt') {
      altFlags['--days'] = '0';
      altFlags['--allow-degraded'] = true;
      if (!altFlags['--strategy']) altFlags['--strategy'] = 'config/strategies/curated/forex_trend_breakout.yaml';
      if (!altFlags['--timeframe']) altFlags['--timeframe'] = '1d';
    }
    if (cmd.id === 'mass-bt') {
      altFlags['--days'] = '0';
      altFlags['--timeframes'] = '1d';
      altFlags['--allow-degraded'] = true;
    }
    if (cmd.id === 'optimize') {
      if (!altFlags['--strategy']) altFlags['--strategy'] = 'config/strategies/curated/forex_trend_breakout.yaml';
      if (!altFlags['--timeframe']) altFlags['--timeframe'] = '1d';
    }
    if (cmd.id === 'sweep') {
      altFlags['--symbols'] = 'EURUSD';
      altFlags['--timeframes'] = '1d';
      altFlags['--top-k'] = '2';
    }
    if (cmd.id === 'bias') altFlags['--no-backfill'] = true;
    if (cmd.id === 'scorecard') {
      altFlags['--no-backfill'] = true;
      altFlags['--allow-degraded'] = true;
    }
    if (cmd.id === 'ingest') {
      altFlags['--family'] = 'crypto';
      altFlags['--symbol'] = 'BTCUSDT';
      altFlags['--history-days'] = '1';
    }
    if (cmd.id === 'backfill-daemon') {
      altFlags['--families'] = 'crypto';
      altFlags['--symbols'] = 'BTCUSDT';
      altFlags['--once'] = true;
    }
    if (cmd.id === 'watch') {
      altFlags['--once'] = true;
    }
    permutations.push({ label: 'alternate_matrix', flags: altFlags });
  }

  return permutations;
}

/**
 * Execute command headlessly under SOVEREIGN_NONINTERACTIVE=1
 */
function runCommandHeadless(argv, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const env = {
      ...process.env,
      SOVEREIGN_NONINTERACTIVE: 'true',
      FORCE_COLOR: '0',
      NODE_ENV: 'test',
    };

    const child = spawn(process.execPath, [CLI_PATH, ...argv], {
      env,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });

    child.on('close', (status, signal) => {
      resolve({
        status,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut: signal === 'SIGTERM' || signal === 'SIGKILL',
      });
    });

    child.on('error', (error) => {
      resolve({
        status: -1,
        signal: null,
        stdout,
        stderr: stderr + '\n' + (error?.message || ''),
        error,
        durationMs: Date.now() - start,
        timedOut: error?.code === 'ETIMEDOUT',
      });
    });
  });
}

test('TUI Manifest Command Surface Coverage Suite', { concurrency: 2 }, async (t) => {
  const results = [];
  let totalCommands = 0;
  let totalPermutations = 0;

  const categoryTasks = Object.entries(commands).map(([categoryKey, cmdList]) =>
    t.test(`Category [${categoryKey}] coverage`, { concurrency: 2 }, async (catTest) => {
      const tests = [];
      for (const cmd of cmdList) {
        totalCommands++;
        const permutations = generateFlagPermutations(cmd);

        for (const perm of permutations) {
          totalPermutations++;
          const argv = buildArgvFromManifest(cmd, perm.flags);

          tests.push(catTest.test(`${cmd.id} (${perm.label}): sovereign ${argv.join(' ')}`, async () => {
            const out = await runCommandHeadless(argv);

            results.push({
              category: categoryKey,
              id: cmd.id,
              permutation: perm.label,
              argv: argv.join(' '),
              exitCode: out.status,
              durationMs: out.durationMs,
              timedOut: out.timedOut,
            });

            // Assertions for headless safety
            assert.equal(out.timedOut, false, `Command timed out: sovereign ${argv.join(' ')}`);
            assert.notEqual(out.signal, 'SIGSEGV', `Segmentation fault: sovereign ${argv.join(' ')}`);

            // Check for unhandled exceptions in stderr
            const hasFatalCrash = /ERR_UNHANDLED_ERROR|UnhandledPromiseRejection|SyntaxError:/.test(out.stderr);
            assert.equal(hasFatalCrash, false, `Fatal uncaught error in stderr: ${out.stderr}`);

            // In non-interactive mode, process must return an integer exit code
            assert.ok(
              Number.isInteger(out.status),
              `Process did not exit with integer code. Signal: ${out.signal}, Error: ${out.error?.message}`
            );
          }));
        }
      }
      await Promise.all(tests);
    })
  );

  await Promise.all(categoryTasks);

  // Clean up any process locks created during test execution
  t.after(() => {
    const lockPath = path.resolve(__dirname, '..', '..', '..', 'backfill_daemon');
    const fs = require('node:fs');
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  });

  // Summary Metrics Assertion
  assert.ok(totalCommands >= 50, `Expected at least 50 commands in manifest, got ${totalCommands}`);
  assert.ok(totalPermutations >= totalCommands, `Permutation count must be >= total command count`);
});
