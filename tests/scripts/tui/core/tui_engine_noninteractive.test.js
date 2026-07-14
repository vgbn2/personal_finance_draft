'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '../../../..');
const ENGINE_PATH = path.join(REPO_ROOT, 'backend/cli/tui/engine/engine.js');

// Each assertion runs in a REAL child process with the dashboard's exact
// spawn() stdio shape (default ['pipe','pipe','pipe'] -- open, never written,
// never closed) rather than in-process. The hang this guards against only
// reproduces against a genuinely open-but-silent pipe; calling these prompt
// functions in-process against the test runner's own stdin doesn't reproduce
// it faithfully (that stdin is typically already at EOF under a test
// runner, which readline resolves/ends differently than a live, open,
// unwritten pipe).
function runInChild(code, { nonInteractive = true, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (nonInteractive) env.SOVEREIGN_NONINTERACTIVE = 'true';
    else delete env.SOVEREIGN_NONINTERACTIVE;
    const child = spawn(process.execPath, ['-e', code], { cwd: REPO_ROOT, env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`child hung past ${timeoutMs}ms (this is the bug Fix 1 prevents) -- partial output: ${JSON.stringify(out)}`));
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

test('promptText resolves instantly with its default under SOVEREIGN_NONINTERACTIVE (does not block on a piped, unwritten stdin)', async () => {
  const code = `
    require(${JSON.stringify(ENGINE_PATH)}).promptText('Q?', 'fallback-value')
      .then((v) => { console.log('RESOLVED:' + JSON.stringify(v)); process.exit(0); });
  `;
  const { code: exitCode, out } = await runInChild(code, { nonInteractive: true, timeoutMs: 3000 });
  assert.equal(exitCode, 0);
  assert.match(out, /RESOLVED:"fallback-value"/);
});

test('promptText hangs without SOVEREIGN_NONINTERACTIVE against a piped, unwritten stdin (proves this suite would catch a regression)', async () => {
  const code = `
    require(${JSON.stringify(ENGINE_PATH)}).promptText('Q?', '')
      .then((v) => { console.log('RESOLVED:' + JSON.stringify(v)); process.exit(0); });
  `;
  await assert.rejects(
    runInChild(code, { nonInteractive: false, timeoutMs: 900 }),
    /hung past/,
  );
});

test('promptSelect resolves with the first option under SOVEREIGN_NONINTERACTIVE', async () => {
  const code = `
    require(${JSON.stringify(ENGINE_PATH)}).promptSelect('Pick:', [{label:'A',value:'a'},{label:'B',value:'b'}])
      .then((v) => { console.log('RESOLVED:' + JSON.stringify(v)); process.exit(0); });
  `;
  const { code: exitCode, out } = await runInChild(code, { nonInteractive: true, timeoutMs: 3000 });
  assert.equal(exitCode, 0);
  assert.match(out, /RESOLVED:"a"/);
});

test('promptConfirm resolves false (safe default) under SOVEREIGN_NONINTERACTIVE, not promptSelect generic first-option rule', async () => {
  const code = `
    require(${JSON.stringify(ENGINE_PATH)}).promptConfirm('Are you sure?')
      .then((v) => { console.log('RESOLVED:' + JSON.stringify(v)); process.exit(0); });
  `;
  const { code: exitCode, out } = await runInChild(code, { nonInteractive: true, timeoutMs: 3000 });
  assert.equal(exitCode, 0);
  // promptConfirm's options are [Yes, No] in that order -- promptSelect's own
  // non-interactive rule would pick the FIRST option ("Yes" -> true), which
  // would be an unsafe default for a confirm. promptConfirm has its own
  // explicit `false` short-circuit specifically to avoid inheriting that.
  assert.match(out, /RESOLVED:false/);
});

test('promptMultiSelect resolves with initialValues under SOVEREIGN_NONINTERACTIVE (also pre-empts the unconditional setRawMode(true) ENOTTY risk)', async () => {
  const code = `
    require(${JSON.stringify(ENGINE_PATH)}).promptMultiSelect('Pick many:', [{label:'A',value:'a'},{label:'B',value:'b'}], { initialValues: ['a'] })
      .then((v) => { console.log('RESOLVED:' + JSON.stringify(v)); process.exit(0); });
  `;
  const { code: exitCode, out } = await runInChild(code, { nonInteractive: true, timeoutMs: 3000 });
  assert.equal(exitCode, 0);
  assert.match(out, /RESOLVED:\["a"\]/);
});
