'use strict';

// Contract tests for backend/cli/tui/progress.js  (W5 — Progress bar)
//
// Conventions mirror tui_search_contract.test.js:
//   node:test  +  node:assert/strict
//
// Tests use the internal _stream injection point so we never need to replace
// process.stdout.write (which would swallow the TAP reporter's own output).

const test   = require('node:test');
const assert = require('node:assert/strict');

const { createProgress } = require('../../backend/cli/tui/progress');

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeStream() {
  const chunks = [];
  return {
    write(chunk) { chunks.push(String(chunk)); return true; },
    get text() { return chunks.join(''); },
    chunks,
  };
}

function withEnv(overrides, fn) {
  const origIsTTY = process.stdout.isTTY;
  const origArgv  = process.argv;
  if ('isTTY' in overrides) Object.defineProperty(process.stdout, 'isTTY', { value: overrides.isTTY, configurable: true, writable: true });
  if ('argv'  in overrides) process.argv = overrides.argv;
  try { return fn(); }
  finally {
    Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true, writable: true });
    process.argv = origArgv;
  }
}

// ─── tests ───────────────────────────────────────────────────────────────────

test('progress non-TTY: prints milestone lines at 25/50/75/100%', () => {
  const stream = makeStream();
  withEnv({ isTTY: false, argv: ['node', 'test'] }, () => {
    const p = createProgress('Ingesting', 4, { _stream: stream });
    p.tick(1);  // 25%
    p.tick(1);  // 50%
    p.tick(1);  // 75%
    p.done();   // 100%
  });

  assert.match(stream.text, /25%/);
  assert.match(stream.text, /50%/);
  assert.match(stream.text, /75%/);
  assert.match(stream.text, /100%/);
  assert.doesNotMatch(stream.text, /\x1b\[/, 'non-TTY output must be ANSI-free');

  console.log(JSON.stringify({
    type: 'tui_progress_contract', case: 'non_tty_milestones',
    output: stream.text.trim(),
  }));
});

test('progress non-TTY --json: milestone lines, zero ANSI bytes', () => {
  const stream = makeStream();
  withEnv({ isTTY: true, argv: ['node', 'test', '--json'] }, () => {
    const p = createProgress('Backtest', 4, { _stream: stream });
    p.tick(2);  // 50%
    p.done();   // 100%
  });

  assert.match(stream.text, /50%/);
  assert.match(stream.text, /100%/);
  assert.doesNotMatch(stream.text, /\x1b\[/, 'no ANSI when --json is in argv');
});

test('progress non-TTY: each milestone fires exactly once even with coarse ticks', () => {
  const stream = makeStream();
  withEnv({ isTTY: false, argv: ['node', 'test'] }, () => {
    const p = createProgress('Work', 100, { _stream: stream });
    p.tick(50); // 50% — fires 25% and 50%
    p.tick(30); // 80% — fires 75%
    p.done();   // 100%
  });

  const count = (text, re) => (text.match(re) || []).length;
  assert.equal(count(stream.text, /25%/g),  1, '25% fires once');
  assert.equal(count(stream.text, /50%/g),  1, '50% fires once');
  assert.equal(count(stream.text, /75%/g),  1, '75% fires once');
  assert.equal(count(stream.text, /100%/g), 1, '100% fires once');
});

test('progress TTY: renders \\r-based single line with bar and percent', () => {
  const stream = makeStream();
  const origIsTTY = process.stdout.isTTY;
  const origArgv  = process.argv;
  const origCI    = process.env.CI;

  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true, writable: true });
  process.argv = ['node', 'test'];
  process.env.CI = '1'; // isRichTerminal() → false → ASCII bar chars

  const p = createProgress('Loading', 10, { _stream: stream });
  p.tick(5);  // 50% — immediate paint (note not provided but force=false; throttle starts from 0)
  p.done();   // 100% — forced paint

  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true, writable: true });
  process.argv = origArgv;
  if (origCI === undefined) delete process.env.CI; else process.env.CI = origCI;

  assert.match(stream.text, /\[/, 'bar open bracket present');
  assert.match(stream.text, /%/, 'percent symbol present');
  assert.doesNotMatch(stream.text, /\x1b\[s|\x1b\[u/, 'no CUR_SAVE/CUR_RESTORE');
  assert.ok(stream.text.endsWith('\n'), 'done() must end with newline');

  // Each TTY chunk must start with \r
  for (const chunk of stream.chunks.filter(c => c.startsWith('\r'))) {
    assert.match(chunk, /^\r/, 'TTY render chunks must start with \\r');
  }

  console.log(JSON.stringify({
    type: 'tui_progress_contract', case: 'tty_bar_render',
    snippet: stream.text.replace(/\r/g, '<CR>').replace(/\x1b/g, '<ESC>').slice(0, 100),
  }));
});

test('progress TTY: 50% shows exactly half the bar filled (ASCII mode)', () => {
  const stream = makeStream();
  const origIsTTY = process.stdout.isTTY;
  const origArgv  = process.argv;
  const origCI    = process.env.CI;

  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true, writable: true });
  process.argv = ['node', 'test'];
  process.env.CI = '1'; // ASCII bar chars

  const p = createProgress('Test', 10, { _stream: stream });
  p.tick(5, 'halfway'); // note forces immediate repaint

  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true, writable: true });
  process.argv = origArgv;
  if (origCI === undefined) delete process.env.CI; else process.env.CI = origCI;

  // Bar is 20 chars wide; 50% → 10 '#' + 10 '.'
  assert.match(stream.text, /#{10}\.{10}/, '50% bar: 10 fill + 10 empty ASCII chars');
  assert.match(stream.text, / 50%/, '50% label present');
});

test('progress TTY: note text appears in the rendered line', () => {
  const stream = makeStream();
  const origIsTTY = process.stdout.isTTY;
  const origArgv  = process.argv;
  const origCI    = process.env.CI;

  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true, writable: true });
  process.argv = ['node', 'test'];
  process.env.CI = '1';

  const p = createProgress('Crunching', 4, { _stream: stream });
  p.tick(2, 'BTCUSDT'); // note forces immediate repaint

  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true, writable: true });
  process.argv = origArgv;
  if (origCI === undefined) delete process.env.CI; else process.env.CI = origCI;

  assert.match(stream.text, /BTCUSDT/, 'note text must appear in TTY render');
});

test('progress: done() is idempotent — calling twice fires 100% milestone once', () => {
  const stream = makeStream();
  withEnv({ isTTY: false, argv: ['node', 'test'] }, () => {
    const p = createProgress('Once', 2, { _stream: stream });
    p.done();
    p.done(); // second call must be a no-op
  });

  const count100 = (stream.text.match(/100%/g) || []).length;
  assert.equal(count100, 1, 'done() fires 100% exactly once even if called twice');
});
