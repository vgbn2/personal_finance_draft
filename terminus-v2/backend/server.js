/**
 * TERMINUS V2 — Server
 * Entry point. Wires everything together.
 * 
 * Usage:
 *   node server.js
 *   node server.js BTC ETH SOL   (custom symbols)
 */

require('dotenv').config()

const http           = require('http')
const WebSocket      = require('ws')
const BinanceAdapter = require('./adapters/binance')
const DeribitAdapter = require('./adapters/deribit')
const QuantEngine    = require('./engines/quant')
const hub            = require('./hub')
const state          = require('./state')

// ── Config ────────────────────────────────────────────────────

const PORT    = process.env.PORT || 3001
const SYMBOLS = process.argv.slice(2).length > 0
  ? process.argv.slice(2).map(s => `${s.toUpperCase()}USDT`)
  : ['BTCUSDT', 'ETHUSDT']

const DERIBIT_CURRENCIES = SYMBOLS
  .map(s => s.replace('USDT', ''))
  .filter(c => ['BTC', 'ETH'].includes(c))

// ── HTTP Server ───────────────────────────────────────────────

const fs   = require('fs')
const path = require('path')

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')

  // Serve frontend
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(fs.readFileSync(path.join(__dirname, '../frontend/index.html')))
    return
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status:    'ok',
      symbols:   state.allSymbols(),
      clients:   hub.clients.size,
      uptime:    process.uptime(),
      timestamp: Date.now(),
    }))
    return
  }

  if (req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(state.summary()))
    return
  }

  if (req.url?.startsWith('/state/')) {
    const symbol = req.url.split('/state/')[1].toUpperCase()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(state.snapshot(symbol)))
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

// ── WebSocket Server ──────────────────────────────────────────

const wss = new WebSocket.Server({ server, path: '/ws' })
wss.on('connection', (ws) => hub.add(ws))

// ── Adapters & Engines ────────────────────────────────────────

const binance = new BinanceAdapter(SYMBOLS)
const deribit = new DeribitAdapter(DERIBIT_CURRENCIES)
const quant   = new QuantEngine()

// Wire broadcasts to hub
binance.onBroadcast = (msg) => hub.broadcast(msg)
deribit.onBroadcast = (msg) => hub.broadcast(msg)
quant.onBroadcast   = (msg) => hub.broadcast(msg)

// ── Graceful shutdown ─────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down...`)
  binance.stop()
  deribit.stop()
  quant.stop()
  server.close(() => {
    console.log('[Server] Shutdown complete.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

// ── Start ─────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║         TERMINUS V2 — ONLINE         ║
╠══════════════════════════════════════╣
║  Port:     ${String(PORT).padEnd(27)}║
║  Symbols:  ${SYMBOLS.join(', ').padEnd(27)}║
║  Health:   http://localhost:${PORT}/health  ║
╚══════════════════════════════════════╝
  `)

  binance.start()
  if (DERIBIT_CURRENCIES.length > 0) deribit.start()
  quant.start()
})
