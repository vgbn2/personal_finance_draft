const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const readline = require('node:readline');
const crypto = require('node:crypto');
const { classifySupabaseError } = require('../../../shared/lib/supabase/errors');

const SESSION_DIR  = path.join(os.homedir(), '.sovereign');
const SESSION_PATH = path.join(SESSION_DIR, 'session.json');

const A = require('../../../shared/lib/ui/ansi');
const { RESET, RED, YELLOW, GREEN, CYAN, BOLD, GRAY } = A;

// ─── Non-TTY stdin queue ──────────────────────────────────────────────────────
// Single readline interface shared across all password/line reads in piped mode.
// Multiple createInterface calls on the same stdin interfere after rl.close().

let _nonTtyRl = null;
let _nonTtyQueue = [];
let _nonTtyWaiters = [];
let _nonTtyClosed = false;

// Set by callers (e.g. the Ink dashboard's in-pane child spawns) whose stdin
// is a piped, never-written, never-closed pipe -- without this, the non-TTY
// readline fallback below still blocks forever instead of erroring or
// returning. Also doubles as the AI-testability bypass: any test runner can
// set this to get guaranteed non-blocking prompt resolution. Mirrors
// tui/engine/engine.js's isNonInteractive().
function isNonInteractive() {
  return process.env.SOVEREIGN_NONINTERACTIVE === 'true';
}

function ensureNonTtyReader() {
  if (_nonTtyRl && !_nonTtyClosed) return;
  if (_nonTtyClosed) {
    _nonTtyRl = null;
    _nonTtyClosed = false;
  }
  _nonTtyRl = readline.createInterface({ input: process.stdin, output: null, terminal: false });
  process.stdin.resume();
  _nonTtyRl.on('line', (line) => {
    if (_nonTtyWaiters.length > 0) {
      _nonTtyWaiters.shift()(line);
    } else {
      _nonTtyQueue.push(line);
    }
  });
  _nonTtyRl.on('close', () => {
    _nonTtyClosed = true;
    while (_nonTtyWaiters.length > 0) _nonTtyWaiters.shift()('');
  });
}

function readNonTtyLine() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) ensureNonTtyReader();
    if (_nonTtyQueue.length > 0) { resolve(_nonTtyQueue.shift()); return; }
    if (_nonTtyClosed) { resolve(''); return; }
    _nonTtyWaiters.push(resolve);
  });
}

// ─── PIN hashing ──────────────────────────────────────────────────────────────

const PIN_SALT = 'sovereign-trade-pin-v1';

function hashPin(pin) {
  return crypto.createHmac('sha256', PIN_SALT).update(String(pin)).digest('hex');
}

function verifyPin(candidate, expected) {
  if (process.env.SOVEREIGN_MOCK === 'true') {
    return true;
  }
  if (!expected) return false;
  const hashA = Buffer.from(hashPin(candidate));
  const hashB = /^[0-9a-f]{64}$/.test(expected)
    ? Buffer.from(expected)
    : Buffer.from(hashPin(expected));
  return crypto.timingSafeEqual(hashA, hashB);
}

// ─── Password strength ────────────────────────────────────────────────────────

const STRENGTH_LEVELS = [
  { label: 'Very Weak',   color: RED    },
  { label: 'Weak',        color: RED    },
  { label: 'Fair',        color: YELLOW },
  { label: 'Good',        color: YELLOW },
  { label: 'Strong',      color: GREEN  },
  { label: 'Very Strong', color: CYAN   },
];

function evaluatePassword(pw) {
  const checks = {
    length8:  pw.length >= 8,
    length12: pw.length >= 12,
    upper:    /[A-Z]/.test(pw),
    lower:    /[a-z]/.test(pw),
    number:   /[0-9]/.test(pw),
    special:  /[^A-Za-z0-9\s]/.test(pw),
  };
  const score  = Object.values(checks).filter(Boolean).length;
  const level  = STRENGTH_LEVELS[Math.min(score, STRENGTH_LEVELS.length - 1)];
  const missing = [];
  if (!checks.length8)  missing.push('8+ chars');
  if (!checks.upper)    missing.push('uppercase');
  if (!checks.lower)    missing.push('lowercase');
  if (!checks.number)   missing.push('number');
  if (!checks.special)  missing.push('special char');
  return { score, level, checks, missing };
}

function renderStrengthBar(score) {
  const level = STRENGTH_LEVELS[Math.min(score, STRENGTH_LEVELS.length - 1)];
  const bar   = `${level.color}${'█'.repeat(score)}${GRAY}${'░'.repeat(6 - score)}${RESET}`;
  return `${bar} ${level.color}${BOLD}${level.label}${RESET}`;
}

// ─── Password prompt ──────────────────────────────────────────────────────────
// setRawMode(true) calls SetConsoleMode on Windows / tcsetattr on Unix to
// disable terminal-level echo. output:null and _writeToOutput hacks do NOT
// suppress ConPTY echo on Windows — raw mode is the only reliable gate.

function makeReadlineMasked(label) {
  // AI-testability / piped-pane bypass: resolve immediately without touching
  // process.stdin at all — test harnesses may have a stdin that doesn't
  // support raw mode, and child panes spawned by the dashboard have a piped
  // stdin that is never written to and never closed.
  if (isNonInteractive()) {
    return Promise.resolve('');
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(`  ${label}: `);

    // Non-TTY: piped input, CI — read via shared queue; avoids rl.close() stomping stdin.
    if (!process.stdin.isTTY) {
      readNonTtyLine().then((ans) => { process.stdout.write('\n'); resolve(ans); });
      return;
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    let input = '';

    const cleanup = (cb) => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      cb();
    };

    const CTRL_C = '\x03';
    const CTRL_D = '\x04';
    const CR     = '\r';
    const LF     = '\n';
    const BS     = '\x08';
    const DEL    = '\x7f';
    const ESC    = '\x1b';

    const onData = (ch) => {
      if (ch === CTRL_C) {
        cleanup(() => reject(new Error('interrupted')));
        return;
      }
      if (ch === CR || ch === LF || ch === CTRL_D) {
        cleanup(() => resolve(input));
        return;
      }
      if (ch === DEL || ch === BS) {
        if (input.length > 0) {
          const clusters = [...input];
          clusters.pop();
          input = clusters.join('');
          process.stdout.write('\b \b');
        }
        return;
      }
      // Skip ANSI escape sequences (arrow keys, function keys)
      if (ch.startsWith(ESC)) return;

      // Accept printable characters — spread handles multi-byte unicode clusters
      const printable = [...ch].filter(c => c >= ' ' && c !== DEL);
      if (printable.length > 0) {
        input += printable.join('');
        process.stdout.write('*'.repeat(printable.length));
      }
    };

    process.stdin.on('data', onData);
  });
}

async function promptPassword(label) {
  return makeReadlineMasked(label);
}

async function promptPasswordWithStrength(label) {
  const pw = await makeReadlineMasked(label);
  const { score, missing } = evaluatePassword(pw);
  const bar  = renderStrengthBar(score);
  const hint = missing.length > 0
    ? `${GRAY}  needs: ${missing.join(', ')}${RESET}`
    : `${GREEN}  ✓ All requirements met${RESET}`;
  process.stdout.write(`  Strength: ${bar}${hint}\n`);
  return pw;
}

async function promptLine(label) {
  // AI-testability / piped-pane bypass: return immediately without writing
  // to stdout or touching stdin (see makeReadlineMasked above).
  if (isNonInteractive()) {
    return '';
  }
  if (!process.stdin.isTTY) {
    process.stdout.write(`  ${label}: `);
    const ans = await readNonTtyLine();
    process.stdout.write('\n');
    return ans.trim();
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${label}: `, (ans) => { rl.close(); resolve(ans.trim()); });
  });
}

// ─── Supabase config ──────────────────────────────────────────────────────────

function getSupabaseConfig() {
  const url = process.env.SOVEREIGN_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SOVEREIGN_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  return { url, key };
}

function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

// ─── Session storage ──────────────────────────────────────────────────────────
// ~/.sovereign/session.json, mode 0o600 (owner read/write only).
// No IP binding — IPs change on DHCP/VPN. Token expiry handles it.

function loadSession() {
  try {
    if (!fs.existsSync(SESSION_PATH)) return null;
    return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
  } catch { return null; }
}

function saveSession(session) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function clearSession() {
  try { fs.unlinkSync(SESSION_PATH); } catch { /* already gone */ }
}

function isSessionValid(session) {
  if (!session?.access_token || !session?.expires_at) return false;
  return (Date.now() / 1000) < (session.expires_at - 60);
}

// ─── Supabase auth ────────────────────────────────────────────────────────────

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false } });
  try {
    const { data, error } = await client.auth.refreshSession({ refresh_token: session.refresh_token });
    if (error || !data.session) return null;
    const fresh = {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at:    data.session.expires_at,
      user: { id: data.session.user.id, email: data.session.user.email },
    };
    saveSession(fresh);
    return fresh;
  } catch (error) {
    throw new Error(classifySupabaseError(error, 'refresh the Supabase session'));
  }
}

async function loginWithCredentials(email, password) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('Supabase not configured');
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false } });
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const session = {
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at:    data.session.expires_at,
      user: { id: data.session.user.id, email: data.session.user.email },
    };
    saveSession(session);
    return session;
  } catch (error) {
    throw new Error(classifySupabaseError(error, 'sign in to Supabase'));
  }
}

async function registerWithCredentials(email, password) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('Supabase not configured');
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false } });
  try {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (data.session) {
      const session = {
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at:    data.session.expires_at,
        user: { id: data.session.user.id, email: data.session.user.email },
      };
      saveSession(session);
      return { session, needsConfirmation: false };
    }
    return { session: null, needsConfirmation: true, email: data.user?.email };
  } catch (error) {
    throw new Error(classifySupabaseError(error, 'create a Supabase account'));
  }
}

async function getAuthenticatedUser(options = {}) {
  const { refreshExpired = true } = options;
  if (process.env.SOVEREIGN_MOCK === 'true') {
    return { id: 'mock-user-id', email: 'mock@sovereign.local' };
  }
  if (!isSupabaseConfigured()) return null;
  let session = loadSession();
  if (!session) return null;
  if (isSessionValid(session)) return session.user;
  if (!refreshExpired) return null;
  try {
    session = await refreshSession(session);
    return session ? session.user : null;
  } catch (error) {
    throw new Error(classifySupabaseError(error, 'refresh the Supabase session'));
  }
}

async function requireAuth(reason) {
  if (process.env.SOVEREIGN_MOCK === 'true') {
    return true;
  }
  if (!isSupabaseConfigured()) return true;
  const session = loadSession();
  if (session && isSessionValid(session)) return true;
  const label = reason ? ` for ${reason}` : '';
  console.error(`\n${RED}${BOLD}✖ Sign-in required${label}.${RESET}`);
  console.error(`${GRAY}  Run \`sovereign login\` to authenticate, then try again.${RESET}\n`);
  return false;
}

module.exports = {
  SESSION_PATH,
  SESSION_DIR,
  hashPin,
  verifyPin,
  isSupabaseConfigured,
  loadSession,
  saveSession,
  clearSession,
  isSessionValid,
  refreshSession,
  loginWithCredentials,
  registerWithCredentials,
  getAuthenticatedUser,
  evaluatePassword,
  renderStrengthBar,
  promptPassword,
  promptPasswordWithStrength,
  promptLine,
  requireAuth,
};
