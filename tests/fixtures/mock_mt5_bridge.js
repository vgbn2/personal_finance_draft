'use strict';

const net = require('node:net');
const readline = require('node:readline');

class MockMt5Client {
  constructor(port = 8282, host = '127.0.0.1') {
    this.port = port;
    this.host = host;
    this.socket = null;
    this.positions = [
      { ticket: 1001, symbol: 'EURUSD', side: 'buy', volume: 0.10, openPrice: 1.0850, currentPrice: 1.0860, unrealizedPl: 10.0 }
    ];
    this.balance = 50000.0;
    this.equity = 50010.0;
    this.freeMargin = 49500.0;
    this.registered = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ port: this.port, host: this.host }, () => {
        this.socket.write(JSON.stringify({
          type: 'REGISTER',
          terminalId: 'mock_mt5_01',
          account: 12345678,
          server: 'MockServer-Demo',
          marginMode: 'RETAIL_HEDGING',
          currency: 'USD',
          leverage: 100,
          tradeAllowed: true
        }) + '\n');
        resolve();
      });

      this.socket.on('error', reject);

      const rl = readline.createInterface({ input: this.socket, crlfDelay: Infinity });
      rl.on('line', (line) => this.handleCommand(line));
    });
  }

  handleCommand(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    const msg = JSON.parse(trimmed);
    if (msg.type === 'REGISTER_ACK') {
      this.registered = true;
      return;
    }

    if (msg.type === 'ORDER_SUBMIT') {
      const ticket = Math.floor(100000 + Math.random() * 900000);
      const deal = Math.floor(100000 + Math.random() * 900000);
      this.socket.write(JSON.stringify({
        type: 'ORDER_RESULT',
        nonce: msg.nonce,
        ok: true,
        ticket,
        deal,
        symbol: msg.symbol,
        volume: msg.quantity / 100000,
        fillPrice: msg.price || 1.0850,
        retcode: 10009,
        retcodeDescription: 'TRADE_RETCODE_DONE',
        timestamp: new Date().toISOString()
      }) + '\n');
    } else if (msg.type === 'POSITIONS_GET') {
      this.socket.write(JSON.stringify({
        type: 'POSITIONS_RESULT',
        nonce: msg.nonce,
        ok: true,
        positions: this.positions
      }) + '\n');
    } else if (msg.type === 'ACCOUNT_GET') {
      this.socket.write(JSON.stringify({
        type: 'ACCOUNT_RESULT',
        nonce: msg.nonce,
        ok: true,
        balance: this.balance,
        equity: this.equity,
        freeMargin: this.freeMargin
      }) + '\n');
    } else if (msg.type === 'ORDER_CANCEL') {
      this.socket.write(JSON.stringify({
        type: 'CANCEL_RESULT',
        nonce: msg.nonce,
        ok: true,
        retcode: 10009
      }) + '\n');
    } else if (msg.type === 'QUOTE_GET') {
      this.socket.write(JSON.stringify({
        type: 'QUOTE_RESULT',
        nonce: msg.nonce,
        ok: true,
        price: 1.0855
      }) + '\n');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

module.exports = { MockMt5Client };
