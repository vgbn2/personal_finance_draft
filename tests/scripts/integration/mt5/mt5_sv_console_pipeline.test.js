'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const CLI_PATH = path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js');

test('SV Console to MT5 Pipeline: trade balance, positions, quote, and diagnostics end-to-end', async () => {
  const PORT = 18285;
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

    function cleanup() {
      if (sock) {
        try { sock.destroy(); } catch {}
        sock = null;
      }
      schedulePoll();
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
            equity: 50010.0,
            freeMargin: 49500.0
          }) + '\\n');
          return;
        }
        if (msg.type === 'POSITIONS_GET') {
          sock.write(JSON.stringify({
            type: 'POSITIONS_RESULT',
            nonce: msg.nonce,
            ok: true,
            positions: [{
              ticket: 1001,
              symbol: 'EURUSD',
              side: 'buy',
              volume: 0.10,
              openPrice: 1.0850,
              currentPrice: 1.0860,
              unrealizedPl: 10.0,
              sl: 1.0800,
              tp: 1.0950,
              magic: 123456,
              comment: 'sov:forex_trend'
            }]
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
            ticket: 998877,
            deal: 112233,
            volume: msg.quantity / 100000,
            fillPrice: msg.price || 1.0855,
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
    // 1. sovereign mt5 doctor
    const docResult = spawnSync(process.execPath, [CLI_PATH, 'mt5', 'doctor', '--slot', 'test', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        MT5_LOGIN: '665544',
        MT5_SERVER: 'MetaQuotes-Demo',
        MT5_PASSWORD: 'password123',
        SOVEREIGN_MT5_TERMINAL_PATH: CLI_PATH,
      },
    });
    assert.equal(docResult.status, 0, `Doctor failed: ${docResult.stderr || docResult.stdout}`);
    const doc = JSON.parse(docResult.stdout.trim());
    assert.equal(doc.ok, true);
    assert.equal(doc.slot, 'test');
    assert.equal(doc.login, '66***44');

    // 2. sovereign mt5 profile list
    const listResult = spawnSync(process.execPath, [CLI_PATH, 'mt5', 'profile', 'list', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env },
    });
    assert.equal(listResult.status, 0);
    const list = JSON.parse(listResult.stdout.trim());
    assert.ok(Array.isArray(list.profiles));
    assert.equal(list.profiles.length, 3);

    // 3. sovereign trade balance --broker mt5 --json
    const balResult = spawnSync(process.execPath, [CLI_PATH, 'trade', 'balance', '--broker', 'mt5', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, MT5_BRIDGE_PORT: String(PORT), MT5_CONNECT_TIMEOUT_MS: '3000' },
    });
    assert.equal(balResult.status, 0, `Balance failed: ${balResult.stderr || balResult.stdout}`);
    const bal = JSON.parse(balResult.stdout.trim());
    assert.equal(bal.USD, 50000.0);
    assert.equal(bal.EQUITY, 50010.0);
    assert.equal(bal.FREE_MARGIN, 49500.0);

    // 4. sovereign trade positions --broker mt5 --json
    const posResult = spawnSync(process.execPath, [CLI_PATH, 'trade', 'positions', '--broker', 'mt5', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, MT5_BRIDGE_PORT: String(PORT), MT5_CONNECT_TIMEOUT_MS: '3000' },
    });
    assert.equal(posResult.status, 0, `Positions failed: ${posResult.stderr || posResult.stdout}`);
    const pos = JSON.parse(posResult.stdout.trim());
    const posList = pos.positions || pos;
    assert.ok(Array.isArray(posList));
    assert.equal(posList.length, 1);
    assert.equal(posList[0].symbol, 'EURUSD');
    assert.equal(posList[0].quantity, 0.10);
    assert.equal(posList[0].unrealizedPl, 10.0);

    // 5. sovereign trade buy EURUSD 1000 --broker mt5 --live --pin 1234 --json
    const buyResult = spawnSync(process.execPath, [CLI_PATH, 'trade', 'buy', 'EURUSD', '1000', '--broker', 'mt5', '--live', '--pin', '1234', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, MT5_BRIDGE_PORT: String(PORT), SOVEREIGN_TRADE_PIN: '1234', SOVEREIGN_MOCK: 'true', CURRENT_PORTFOLIO_DRAWDOWN: '0.02', MT5_CONNECT_TIMEOUT_MS: '3000' },
    });
    assert.equal(buyResult.status, 0, `Buy order failed: ${buyResult.stderr || buyResult.stdout}`);
    const firstBrace = buyResult.stdout.indexOf('{');
    const lastBrace = buyResult.stdout.lastIndexOf('}');
    assert.ok(firstBrace !== -1 && lastBrace !== -1, `Expected JSON payload in: ${buyResult.stdout}`);
    const buyPayload = JSON.parse(buyResult.stdout.substring(firstBrace, lastBrace + 1));
    const buy = buyPayload.order || buyPayload;
    assert.equal(buy.status, 'filled');
    assert.equal(buy.orderId, '998877');

  } finally {
    daemonChild.kill('SIGKILL');
  }
});
