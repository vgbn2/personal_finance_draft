'use strict';

// Shared fake-TTY harness for Ink-based dashboard tests. Extracted from
// sovereign_dashboard.test.js so other test files (e.g. hang-safety tests)
// can reuse the same fake stdin/stdout shape and key-sending helper without
// duplicating them. Pure extraction -- no behavior change from the
// file-local versions this replaced.

const { PassThrough, Writable } = require('node:stream');
const { setTimeout: delay } = require('node:timers/promises');

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const SYNC_FRAME_START = '\x1b[?2026h';

function stripAnsi(input) {
  return String(input).replace(ANSI_RE, '');
}

// Ink wraps each repaint in a synchronized-update marker pair; isolating the
// tail after the LAST start marker gives the current frame instead of the
// whole accumulated transcript (needed for doesNotMatch assertions — content
// from an earlier frame stays in the raw buffer forever otherwise).
function lastFrame(raw) {
  const idx = raw.lastIndexOf(SYNC_FRAME_START);
  return idx === -1 ? raw : raw.slice(idx);
}

// Ink's App component pulls input via the readable-stream `.read()`/'readable'
// protocol (not bare 'data' events), so the fake stdin must be a real Readable
// (a PassThrough satisfies that) with TTY-only bits (isTTY/setRawMode/ref/unref)
// stubbed on top — the same shape ink-testing-library uses under the hood.
function makeFakeStdin() {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  return stdin;
}

function makeFakeStdout(options = {}) {
  let buf = '';
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString('utf8');
      cb();
    },
  });
  stdout.isTTY = true;
  stdout.columns = options.columns || 120;
  stdout.rows = options.rows || 40;
  stdout.snapshot = () => stripAnsi(lastFrame(buf));
  return stdout;
}

const keys = {
  up: '[A',
  down: '[B',
  right: '[C',
  left: '[D',
  enter: '\r',
  tab: '\t',
  pageUp: '\x1b[5~',
  pageDown: '\x1b[6~',
  home: '\x1b[H',
  end: '\x1b[F',
  backspace: '\x7f',
  delete: '\x1b[3~',
  escape: '',
};

async function send(stdin, instance, sequence, gapMs = 25) {
  for (const key of sequence) {
    stdin.write(key);
    await delay(gapMs);
  }
  await instance.waitUntilRenderFlush();
}

// Small reusable Promise.race-against-a-deadline helper. Resolves once either
// the given promise settles or `ms` elapses, whichever comes first -- never
// rejects on timeout, so callers don't need a try/catch just to detect a
// hang. `label` is carried through unchanged so callers can identify which
// case timed out when running this over a batch of cases.
async function withTimeout(promise, ms, label) {
  let timedOut = false;
  const timeout = new Promise((resolve) => {
    setTimeout(() => { timedOut = true; resolve(undefined); }, ms);
  });
  const result = await Promise.race([promise, timeout]);
  return { result, hung: timedOut, label };
}

module.exports = {
  ANSI_RE,
  SYNC_FRAME_START,
  stripAnsi,
  lastFrame,
  makeFakeStdin,
  makeFakeStdout,
  keys,
  send,
  withTimeout,
};
