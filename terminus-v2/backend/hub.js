/**
 * TERMINUS V2 — Client Hub
 * Manages all frontend WebSocket connections.
 * Routes messages from engines to clients.
 */

const state = require('./state')

class ClientHub {
  constructor() {
    this.clients = new Set()
  }

  // ── Client management ─────────────────────────────────────────

  add(ws) {
    this.clients.add(ws)
    console.log(`[Hub] Client connected. Total: ${this.clients.size}`)

    // Send full state snapshot immediately on connect
    this._sendSnapshot(ws)

    ws.on('message', (raw) => this._handleClientMessage(ws, raw))
    ws.on('close',   () => {
      this.clients.delete(ws)
      console.log(`[Hub] Client disconnected. Total: ${this.clients.size}`)
    })
    ws.on('error', () => this.clients.delete(ws))
  }

  // ── Incoming from client ──────────────────────────────────────

  _handleClientMessage(ws, raw) {
    try {
      const msg = JSON.parse(raw)

      // Client can request a fresh snapshot
      if (msg.type === 'snapshot' && msg.symbol) {
        this._send(ws, state.snapshot(msg.symbol))
      }

      if (msg.type === 'summary') {
        this._send(ws, state.summary())
      }
    } catch (e) {
      // ignore malformed messages
    }
  }

  // ── Broadcast from engines ────────────────────────────────────

  broadcast(msg) {
    if (this.clients.size === 0) return
    const payload = JSON.stringify(msg)
    for (const ws of this.clients) {
      try {
        if (ws.readyState === 1) { // OPEN
          ws.send(payload)
        }
      } catch (e) {
        this.clients.delete(ws)
      }
    }
  }

  // ── Private ───────────────────────────────────────────────────

  _sendSnapshot(ws) {
    // Send summary first
    this._send(ws, state.summary())

    // Then full snapshot for each symbol
    for (const symbol of state.allSymbols()) {
      this._send(ws, state.snapshot(symbol))
    }
  }

  _send(ws, msg) {
    try {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(msg))
      }
    } catch (e) {
      this.clients.delete(ws)
    }
  }
}

module.exports = new ClientHub()
