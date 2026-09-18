'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const CLI_PATH = path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js');

test('MT5 Lockout Interactions & Edge Cases', async (t) => {
  const PORT = 18286;
  const daemonCode = `
    const net = require('net');
    let sock = null;
    let pollTimer = null;

    function schedulePoll() {
      if (pollTimer) return;
      pollTimer = setTimeout(() => {
        pollTimer = null;
        poll();
      }, 50);
    }

    function poll() {
      if (sock) return;
      const s = net.connect(${PORT}, '127.0.0.1', () => {
        sock = s;
        sock.write(JSON.stringify({
          type: 'REGISTER',
          terminal_id: 'MT5-DEMO-665544',
          login: 665544,
          company: 'MetaQuotes Software Corp.',
          currency: 'USD',
          leverage: 100,
          server: 'MetaQuotes-Demo'
        }) + '\\n');
      });

      let buf = '';
      s.on('data', (d) => {
        buf += d.toString();
        let idx;
        while ((idx = buf.indexOf('\\n')) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line) handleMsg(line);
        }
      });

      s.on('error', () => {
        if (sock === s) sock = null;
        schedulePoll();
      });

      s.on('close', () => {
        if (sock === s) sock = null;
        schedulePoll();
      });
    }

    function handleMsg(line) {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'REGISTER_ACK') return;
        if (msg.type === 'ACCOUNT_GET' || msg.type === 'ACCOUNT_INFO') {
          sock.write(JSON.stringify({
            type: 'ACCOUNT_RESULT',
            nonce: msg.nonce,
            ok: true,
            balance: 50000.0,
            equity: 50000.0,
            freeMargin: 50000.0
          }) + '\\n');
          return;
        }
        if (msg.type === 'QUOTE_GET') {
          sock.write(JSON.stringify({
            type: 'QUOTE_RESULT',
            nonce: msg.nonce,
            ok: true,
            price: 1.0855
          }) + '\\n');
          return;
        }
        if (msg.type === 'ORDER_SUBMIT') {
          sock.write(JSON.stringify({
            type: 'ORDER_RESULT',
            nonce: msg.nonce,
            ok: true,
            ticket: 112233,
            deal: 445566,
            volume: msg.quantity / 100000,
            fillPrice: 1.0855,
            retcode: 10009,
            retcodeDescription: 'TRADE_RETCODE_DONE'
          }) + '\\n');
          return;
        }
      } catch {}
    }

    poll();
  `;

  const daemonChild = spawn(process.execPath, ['-e', daemonCode], {
    stdio: 'inherit',
  });

  try {
    // 1. Edgecase: Invalid PIN lockout on live MT5 trade
    await t.test('Lockout: Invalid or missing PIN halts live execution', () => {
      const res = spawnSync(process.execPath, [CLI_PATH, 'trade', 'buy', 'EURUSD', '1000', '--broker', 'mt5', '--live', '--pin', 'WRONG_PIN', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, MT5_BRIDGE_PORT: String(PORT), SOVEREIGN_TRADE_PIN: '1234', SOVEREIGN_MOCK: 'true', MT5_CONNECT_TIMEOUT_MS: '3000' },
      });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Invalid or missing Trade PIN/);
    });

    // 2. Edgecase: Global Kill Switch engaged lockout
    await t.test('Lockout: Global Kill Switch halts order preflight', () => {
      // Engage kill switch
      const engageRes = spawnSync(process.execPath, [CLI_PATH, 'kill-switch', 'engage', '--reason', 'Emergency test halt', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      assert.equal(engageRes.status, 0);

      try {
        // Attempt order
        const buyRes = spawnSync(process.execPath, [CLI_PATH, 'trade', 'buy', 'EURUSD', '1000', '--broker', 'mt5', '--live', '--pin', '1234', '--json'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: { ...process.env, MT5_BRIDGE_PORT: String(PORT), SOVEREIGN_TRADE_PIN: '1234', SOVEREIGN_MOCK: 'true', CURRENT_PORTFOLIO_DRAWDOWN: '0.02', MT5_CONNECT_TIMEOUT_MS: '3000' },
        });
        assert.equal(buyRes.status, 1);
        const firstBrace = buyRes.stdout.indexOf('{');
        const lastBrace = buyRes.stdout.lastIndexOf('}');
        assert.ok(firstBrace !== -1 && lastBrace !== -1);
        const payload = JSON.parse(buyRes.stdout.substring(firstBrace, lastBrace + 1));
        assert.equal(payload.ok, false);
        assert.match(payload.error, /GLOBAL KILL SWITCH ENGAGED/i);
      } finally {
        // Disengage kill switch
        const disengageRes = spawnSync(process.execPath, [CLI_PATH, 'kill-switch', 'disengage', '--json'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        });
        assert.equal(disengageRes.status, 0);
      }
    });

    // 3. Edgecase: C++ Risk Engine Drawdown lockout
    await t.test('Lockout: Portfolio Max Drawdown exceeded blocks trade', () => {
      const buyRes = spawnSync(process.execPath, [CLI_PATH, 'trade', 'buy', 'EURUSD', '1000', '--broker', 'mt5', '--live', '--pin', '1234', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          MT5_BRIDGE_PORT: String(PORT),
          SOVEREIGN_TRADE_PIN: '1234',
          SOVEREIGN_MOCK: 'true',
          CURRENT_PORTFOLIO_DRAWDOWN: '0.35', // 35% drawdown > 30% limit
          MT5_CONNECT_TIMEOUT_MS: '3000',
        },
      });
      assert.equal(buyRes.status, 1);
      assert.match(buyRes.stderr + buyRes.stdout, /Max drawdown limit reached or exceeded/i);
    });

    // 4. Edgecase: C++ Risk Engine Concentration lockout
    await t.test('Lockout: Excessive position concentration blocked', () => {
      // $50,000 equity * 25% max concentration = $12,500 max notional
      // 50,000 units EURUSD @ 1.0855 = $54,275 notional (>100% concentration)
      const buyRes = spawnSync(process.execPath, [CLI_PATH, 'trade', 'buy', 'EURUSD', '50000', '--broker', 'mt5', '--live', '--pin', '1234', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          MT5_BRIDGE_PORT: String(PORT),
          SOVEREIGN_TRADE_PIN: '1234',
          SOVEREIGN_MOCK: 'true',
          CURRENT_PORTFOLIO_DRAWDOWN: '0.02',
          MT5_CONNECT_TIMEOUT_MS: '3000',
        },
      });
      assert.equal(buyRes.status, 1);
      assert.match(buyRes.stderr + buyRes.stdout, /Concentration limit exceeded/i);
    });

    // 5. Edgecase: Disconnected Bridge lockout
    await t.test('Lockout: Offline bridge fails closed with immediate rejection', () => {
      // Kill daemon to simulate bridge offline
      daemonChild.kill('SIGKILL');

      const buyRes = spawnSync(process.execPath, [CLI_PATH, 'trade', 'buy', 'EURUSD', '1000', '--broker', 'mt5', '--live', '--pin', '1234', '--json'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          MT5_BRIDGE_PORT: String(PORT),
          SOVEREIGN_TRADE_PIN: '1234',
          SOVEREIGN_MOCK: 'true',
          CURRENT_PORTFOLIO_DRAWDOWN: '0.02',
          MT5_CONNECT_TIMEOUT_MS: '500',
        },
      });
      assert.equal(buyRes.status, 1);
      assert.match(buyRes.stderr + buyRes.stdout, /MT5 terminal bridge is not connected/i);
    });

  } finally {
    try { daemonChild.kill('SIGKILL'); } catch {}
  }
});
