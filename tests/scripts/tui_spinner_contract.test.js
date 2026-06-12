'use strict';

// Contract tests for backend/cli/tui/spinner.js  (W1 — Spinner)
//
// Conventions mirror tui_search_contract.test.js:
//   node:test  +  node:assert/strict
//
// Tests use the internal _stream injection point so we never need to replace
// process.stdout.write (which would swallow the TAP reporter's own output).

const test   = require('node:test');
const assert = require('node:assert/strict');

const { startSpinner } = require('../../backend/cli/tui/spinner');

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Tiny in-memory write stream for capturing spinner output. */
function makeStream() {
  const chunks = [];
  return {
    write(chunk) { chunks.push(String(chunk)); return true; },
    get text() { return chunks.join(''); },
    chunks,
  };
}

/**
 * Temporarily override process.stdout.isTTY and process.argv, then restore.
 * Safe to call: does not touch process.stdout.write.
 */
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

test('spinner non-TTY: prints static label line once, no ANSI sequences', () => {
  const stream = makeStream();
  withEnv({ isTTY: false, argv: ['node', 'test'] }, () => {
    const handle = startSpinner('Loading data', { _stream: stream });
    handle.stop(); // inert — must not add extra output
  });

  assert.match(stream.text, /Loading data/);
  assert.doesNotMatch(stream.text, /\x1b\[/, 'non-TTY output must be ANSI-free');
  assert.match(stream.text, /\n$/, 'static line must end with newline');

  console.log(JSON.stringify({
    type: 'tui_spinner_contract', case: 'non_tty_static_line',
    output: stream.text.trim(), ansi_free: !stream.text.includes('\x1b'),
  }));
});

test('spinner non-TTY --json: static line, zero ANSI bytes', () => {
  const stream = makeStream();
  withEnv({ isTTY: true, argv: ['node', 'test', '--json'] }, () => {
    const handle = startSpinner('Running backtest', { _stream: stream });
    handle.stop();
  });

  assert.match(stream.text, /Running backtest/);
  assert.doesNotMatch(stream.text, /\x1b\[/, 'no ANSI when --json is in argv');
});

test('spinner non-TTY: stop(finalText) appends finalText line', () => {
  const stream = makeStream();
  withEnv({ isTTY: false, argv: ['node', 'test'] }, () => {
    const handle = startSpinner('Fetch', { _stream: stream });
    handle.stop('Done!');
  });

  assert.match(stream.text, /Fetch/);
  assert.match(stream.text, /Done!/);
});

test('spinner TTY ASCII: frame chars from ASCII set, no CUR_SAVE/CUR_RESTORE', () => {
  const stream = makeStream();
  const origIsTTY = process.stdout.isTTY;
  const origArgv  = process.argv;
  const origCI    = process.env.CI;

  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true, writable: true });
  process.argv = ['node', 'test'];
  process.env.CI = '1'; // isRichTerminal() → false → ASCII frames

  const handle = startSpinner('Load', { _stream: stream });
  handle.stop();

  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true, writable: true });
  process.argv = origArgv;
  if (origCI === undefined) delete process.env.CI; else process.env.CI = origCI;

  const ASCII_FRAMES = ['|', '/', '-', '\\'];
  assert.ok(
    ASCII_FRAMES.some(f => stream.text.includes(f)),
    `expected ASCII frame in output: "${stream.text.slice(0, 40)}"`
  );
  assert.doesNotMatch(stream.text, /\x1b\[s|\x1b\[u/, 'must not use CUR_SAVE/CUR_RESTORE');
  assert.match(stream.text, /^\r/, 'initial paint must start with \\r');
});

test('spinner TTY: timer-backed handle writes \\r frame output and clears on stop', async () => {
  const stream = makeStream();
  const origIsTTY = process.stdout.isTTY;
  const origArgv  = process.argv;

  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true, writable: true });
  process.argv = ['node', 'test'];

  const handle = startSpinner('Processing', { _stream: stream });

  // Wait two tick intervals then stop
  await new Promise(resolve => setTimeout(resolve, 260));
  handle.stop();

  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true, writable: true });
  process.argv = origArgv;

  const spinWrites = stream.chunks.filter(w => w.includes('Processing'));
  assert.ok(spinWrites.length >= 2, `expected ≥2 spinner frames, got ${spinWrites.length}`);
  for (const w of spinWrites) {
    assert.match(w, /^\r/, 'each spinner paint must start with \\r');
    assert.doesNotMatch(w, /\x1b\[s|\x1b\[u/, 'no CUR_SAVE/CUR_RESTORE');
  }

  // stop() clear-line write must start with \r
  const lastChunk = stream.chunks[stream.chunks.length - 1];
  assert.match(lastChunk, /^\r/, 'stop() must start with \\r');

  console.log(JSON.stringify({
    type: 'tui_spinner_contract', case: 'tty_frame_advance',
    frame_writes: spinWrites.length, no_cursor_save_restore: true,
  }));
});

test('spinner TTY: stop(finalText) writes finalText to the cleared line', async () => {
  const stream = makeStream();
  const origIsTTY = process.stdout.isTTY;
  const origArgv  = process.argv;

  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true, writable: true });
  process.argv = ['node', 'test'];

  const handle = startSpinner('Compute', { _stream: stream });
  await new Promise(resolve => setTimeout(resolve, 150));
  handle.stop('Compute done');

  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true, writable: true });
  process.argv = origArgv;

  const lastChunk = stream.chunks[stream.chunks.length - 1];
  assert.match(lastChunk, /Compute done/, 'finalText must appear in the last write');
  assert.match(lastChunk, /^\r/, 'stop(finalText) must start with \\r');

  console.log(JSON.stringify({
    type: 'tui_spinner_contract', case: 'stop_final_text',
    last_write: lastChunk.replace(/\x1b/g, '<ESC>').slice(0, 60),
  }));
});
