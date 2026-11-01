'use strict';

const net = require('node:net');
const port = Number(process.argv[2] || 8282);

let running = true;
let socket = null;
let reconnectTimer = null;

function scheduleReconnect() {
  if (!running || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 100);
}

function connect() {
  if (!running || socket) return;
  const sock = net.createConnection({ port, host: '127.0.0.1' });

  sock.on('connect', () => {
    socket = sock;
    sock.write(JSON.stringify({
      type: 'REGISTER',
      terminalId: 'mock_interactive_mt5',
      account: 11223344,
      server: 'MetaQuotes-Demo',
      marginMode: 'RETAIL_HEDGING',
      currency: 'USD',
      leverage: 100,
      tradeAllowed: true,
    }) + '\n');
  });

  let buffer = '';
  sock.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'ACCOUNT_GET') {
          sock.write(JSON.stringify({
            type: 'ACCOUNT_RESULT',
            nonce: msg.nonce,
            ok: true,
            balance: 100000.0,
            equity: 100500.0,
            freeMargin: 95000.0,
          }) + '\n');
        } else if (msg.type === 'QUOTE_GET') {
          sock.write(JSON.stringify({
            type: 'QUOTE_RESULT',
            nonce: msg.nonce,
            ok: true,
            symbol: msg.symbol,
            price: 1.0850,
          }) + '\n');
        } else if (msg.type === 'POSITIONS_GET') {
          sock.write(JSON.stringify({
            type: 'POSITIONS_RESULT',
            nonce: msg.nonce,
            ok: true,
            positions: [
              { ticket: 5001, symbol: 'EURUSD', side: 'buy', volume: 0.10, openPrice: 1.0850, currentPrice: 1.0860, profit: 10.0 },
            ],
          }) + '\n');
        } else if (msg.type === 'ORDER_SUBMIT') {
          sock.write(JSON.stringify({
            type: 'ORDER_RESULT',
            nonce: msg.nonce,
            ok: true,
            ticket: 998877,
            deal: 665544,
            symbol: msg.symbol,
            volume: Number(msg.quantity) <= 50 ? Number(msg.quantity) : Number(msg.quantity) / 100000,
            fillPrice: 1.0852,
            retcode: 10009,
            retcodeDescription: 'TRADE_RETCODE_DONE',
            timestamp: new Date().toISOString(),
          }) + '\n');
        }
      } catch {
        // ignore parse errors for partial lines
      }
    }
  });

  sock.on('error', () => {
    socket = null;
    scheduleReconnect();
  });

  sock.on('close', () => {
    socket = null;
    scheduleReconnect();
  });
}

process.on('SIGTERM', () => {
  running = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (socket) {
    try { socket.destroy(); } catch {}
  }
  process.exit(0);
});

connect();
