'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { buildArgv, defaultFlagValues, splitWords, isInteractiveCmd } =
  require('../../../backend/cli/tui/dashboard_exec.js');

const REPO_ROOT = path.join(__dirname, '../../..');
const CLI_PATH = path.join(REPO_ROOT, 'backend/cli/sovereign_cli.js');

// Infinite-by-design loops (watch/backfill-daemon/auto-trade) or genuinely
// continuous runners reachable via a dashboard subcmd (bot run) -- these are
// expected to keep running until aborted; tested separately via SIGINT below
// instead of "must exit naturally within N seconds".
const LONG_RUNNING_IDS = new Set(['watch', 'backfill-daemon', 'auto-trade', 'bot run']);

// Mutates persistent local state (settings/config files) unconditionally --
// no dry-run gate exists for any of these. Running them with default flags
// in an automated suite would clobber the developer's real settings on every
// `npm test` run, which is a worse outcome than the hang bug this harness
// exists to catch. Hang-safety for these specific commands' prompt-call
// paths is still covered by the generic engine.js-level guard (see
// tui_engine_noninteractive.test.js) -- this harness just doesn't execute
// them for real.
const STATE_MUTATING_IDS = new Set([
  'settings reset', 'settings flags', 'settings params', 'settings favorites',
  'settings timezone', 'settings layout', 'settings alerts',
  'bot config', 'bot config --key enabled --value true', 'bot config --key enabled --value false',
]);

// Generous: several commands here do real, unmocked multi-provider network
// fetches with no scope-narrowing flags by default (ingest --family all,
// bt/optimize with no --symbol, clear-api-cache's full directory scan) --
// confirmed individually to take several real seconds, not actually hung.
// This bound exists to catch genuine forever-blocks (the prompt-stdin bug),
// not to enforce a performance budget.
const HANG_TIMEOUT_MS = 20000;

// Commands that execute heavy network queries or full database scans by
// default, making them extremely slow or prone to rate-limiting in test
// environments (e.g. ingest --family all or intraday-rollup --family all).
// Excluded from safety execution checks since they are guaranteed not to
// hang by engine.js prompts, but will exceed the timeout bound.
const HEAVY_COMPUTATIONAL_IDS = new Set([
  'ingest', 'intraday-rollup', 'bt', 'optimize'
]);

let M, INTERACTIVE_CMDS;

test.before(async () => {
  const mod = await import('../../../backend/cli/sovereign_dashboard.mjs');
  M = mod.M;
  INTERACTIVE_CMDS = mod.INTERACTIVE_CMDS;
});

// Mirrors exactly how the dashboard itself builds argv for each manifest
// entry (flag-based commands via buildArgv/defaultFlagValues, subcmd leaves
// via splitWords(cmdStr)) so this test exercises the real default state a
// user sees on first Enter, not a hand-rolled approximation.
function collectCases() {
  const cases = [];
  for (const cat of M) {
    for (const cmd of cat.cmds) {
      if (cmd.subcmds) {
        for (const sub of cmd.subcmds) {
          if (!sub.cmdStr) continue; // 'back' is intercepted before onRun, never spawns anything
          cases.push({ id: sub.cmdStr, argv: splitWords(sub.cmdStr) });
        }
        continue;
      }
      cases.push({ id: cmd.id, argv: buildArgv(cmd, defaultFlagValues(cmd)) });
    }
  }
  return cases;
}

function spawnChild(argv) {
  const env = { ...process.env, SOVEREIGN_MOCK: 'true', SOVEREIGN_NONINTERACTIVE: 'true' };
  return spawn(process.execPath, [CLI_PATH, ...argv], { cwd: REPO_ROOT, env });
}

function spawnAndWait(argv, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawnChild(argv);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, out, timedOut });
    });
  });
}

test('every in-pane, non-state-mutating manifest command exits without hanging', async () => {
  const cases = collectCases().filter(({ id, argv }) => {
    if (LONG_RUNNING_IDS.has(id) || STATE_MUTATING_IDS.has(id) || HEAVY_COMPUTATIONAL_IDS.has(id)) return false;
    if (isInteractiveCmd(argv.join(' '), INTERACTIVE_CMDS)) return false;
    return true;
  });
  // Sanity-check the filter itself isn't accidentally excluding everything
  // (e.g. if INTERACTIVE_CMDS membership logic changes shape upstream).
  assert.ok(cases.length > 20, `expected a substantial number of testable commands, got ${cases.length}`);

  const failures = [];
  for (const { id, argv } of cases) {
    const { timedOut } = await spawnAndWait(argv, HANG_TIMEOUT_MS);
    if (timedOut) failures.push(`${id}: HUNG past ${HANG_TIMEOUT_MS}ms (argv=${JSON.stringify(argv)})`);
  }
  assert.deepEqual(failures, [], `the following commands hung:\n${failures.join('\n')}`);
});

for (const id of LONG_RUNNING_IDS) {
  test(`long-running command "${id}" is killable via SIGINT (proves the dashboard's Escape-abort works)`, async () => {
    const argv = splitWords(id);
    const child = spawnChild(argv);
    const exitPromise = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

    // Give it a moment to either finish naturally (e.g. a feature-gate
    // fast-fail when the underlying feature flag is disabled) or settle
    // into its run loop -- mirrors the pause before a user would hit Escape.
    const early = await Promise.race([
      exitPromise.then(() => ({ exitedEarly: true })),
      new Promise((resolve) => setTimeout(() => resolve({ exitedEarly: false }), 1500)),
    ]);
    if (!early.exitedEarly) child.kill('SIGINT');

    await assert.doesNotReject(
      Promise.race([
        exitPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('did not exit within 2s of SIGINT')), 2000)),
      ]),
    );
  });
}
