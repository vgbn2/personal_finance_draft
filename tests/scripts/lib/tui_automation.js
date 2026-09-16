const { spawn } = require('node:child_process');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { VirtualTerminalScreen } = require('./virtual_terminal_screen');

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const CTRL_RE = /[\u0000-\u001f\u007f]/g;

const keys = {
  up: '\u001b[A',
  down: '\u001b[B',
  right: '\u001b[C',
  left: '\u001b[D',
  enter: '\r',
  esc: '\u001b',
  ctrlC: '\u0003',
};

// Pipe-driven sessions are enough for menu and prompt automation, but they do
// not emulate every real TTY signal path. Keep signal-specific assertions in
// dedicated process-level tests unless we add a true PTY harness later.

function stripAnsi(input) {
  return String(input).replace(ANSI_RE, '');
}

function normalizeTranscript(input) {
  return stripAnsi(input)
    .replace(/\r/g, '')
    .replace(/\u0008 \u0008/g, '')
    .replace(CTRL_RE, (match) => {
      if (match === '\n' || match === '\t') return match;
      return '';
    });
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toMatcher(pattern) {
  if (pattern instanceof RegExp) {
    const flags = pattern.flags.replace(/g/g, '');
    return new RegExp(pattern.source, flags);
  }
  return new RegExp(escapeRegex(pattern));
}

function createTuiSession(options = {}) {
  const cliPath = options.cliPath || path.join(__dirname, '../../../backend/cli/sovereign_cli.js');
  const env = {
    ...process.env,
    CI: 'false',
    FORCE_COLOR: '0',
    SOVEREIGN_FORCE_TUI: 'true',
    ...options.env,
  };
  const child = spawn('node', [cliPath, ...(options.args || [])], {
    cwd: options.cwd || path.join(__dirname, '../../../'),
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const virtualScreen = new VirtualTerminalScreen({
    cols: options.cols || 80,
    rows: options.rows || 30,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    const str = chunk.toString('utf8');
    stdout += str;
    virtualScreen.write(str);
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  const closed = new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  async function send(sequence, gapMs = 35) {
    for (const key of sequence) {
      child.stdin.write(key);
      if (gapMs > 0) {
        await delay(gapMs);
      }
    }
  }

  async function waitFor(pattern, timeoutMs = 5000) {
    const matcher = toMatcher(pattern);
    const deadline = Date.now() + timeoutMs;
    let last = '';

    while (Date.now() < deadline) {
      last = normalizeTranscript(stdout + stderr);
      if (matcher.test(last)) {
        return last;
      }
      await delay(50);
    }

    const tail = last.slice(-4000);
    throw new Error(`Timed out waiting for ${pattern}\n--- transcript tail ---\n${tail}`);
  }

  async function waitForVisual(pattern, timeoutMs = 5000) {
    const matcher = toMatcher(pattern);
    const deadline = Date.now() + timeoutMs;
    let last = '';

    while (Date.now() < deadline) {
      last = virtualScreen.getVisualScreen();
      if (matcher.test(last)) {
        return last;
      }
      await delay(50);
    }

    const tail = last.slice(-4000);
    throw new Error(`Timed out waiting for visual pattern ${pattern}\n--- visual screen ---\n${tail}`);
  }

  async function waitForExit(timeoutMs = 5000) {
    return await Promise.race([
      closed,
      delay(timeoutMs).then(() => {
        throw new Error(`Timed out waiting for TUI process exit after ${timeoutMs} ms`);
      }),
    ]);
  }

  function snapshot() {
    return normalizeTranscript(stdout + stderr);
  }

  function getVisualScreen() {
    return virtualScreen.getVisualScreen();
  }

  function getVisualLine(row) {
    return virtualScreen.getVisualLine(row);
  }

  function kill(signal = 'SIGTERM') {
    if (!child.killed) {
      child.kill(signal);
    }
  }

  return {
    child,
    screen: virtualScreen,
    send,
    waitFor,
    waitForVisual,
    waitForExit,
    snapshot,
    getVisualScreen,
    getVisualLine,
    kill,
    get stdout() {
      return normalizeTranscript(stdout);
    },
    get stderr() {
      return normalizeTranscript(stderr);
    },
    get rawStdout() {
      return stdout;
    },
    get rawStderr() {
      return stderr;
    },
    get syncFrames() {
      return virtualScreen.syncFrames;
    },
  };
}

module.exports = {
  createTuiSession,
  keys,
  normalizeTranscript,
  stripAnsi,
};
