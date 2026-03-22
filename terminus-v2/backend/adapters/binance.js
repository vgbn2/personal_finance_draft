/**
 * TERMINUS V2 — Binance Futures Adapter
 * Handles: price, orderbook, liquidations, funding, OI
 * All streams in one multiplexed WebSocket connection.
 */

const WebSocket = require('ws')
const state     = require('../state')

const BASE_WS   = 'wss://fstream.binance.com/stream?streams='
const BASE_REST = 'https://fapi.binance.com/fapi/v1'

class BinanceAdapter {
  constructor(symbols = ['BTCUSDT', 'ETHUSDT']) {
    this.symbols   = symbols.map(s => s.toUpperCase())
    this.ws        = null
    this.reconnectDelay = 2000
    this.maxReconnectDelay = 30000
    this.isRunning = false
    this.onBroadcast = null  // set by hub
  }

  // ── Start ─────────────────────────────────────────────────────

  start() {
    this.isRunning = true
    this._connect()
    this._pollOI()  // OI not available via WS, poll every 30s
  }

  stop() {
    this.isRunning = false
    if (this.ws) this.ws.terminate()
  }

  // ── WebSocket ─────────────────────────────────────────────────

  _buildStreams() {
    const streams = []
    for (const sym of this.symbols) {
      const s = sym.toLowerCase()
      streams.push(`${s}@ticker`)         // price, volume, change
      streams.push(`${s}@depth20@500ms`)  // orderbook top 20
      streams.push(`${s}@forceOrder`)     // liquidations
      streams.push(`${s}@markPrice@1s`)   // mark price + funding
    }
    return streams.join('/')
  }

  _connect() {
    if (!this.isRunning) return

    const url = `${BASE_WS}${this._buildStreams()}`
    console.log('[Binance] Connecting...')

    this.ws = new WebSocket(url)

    this.ws.on('open', () => {
      console.log('[Binance] Connected')
      this.reconnectDelay = 2000
    })

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw)
        if (msg.stream && msg.data) {
          this._route(msg.stream, msg.data)
        }
      } catch (e) {
        // ignore parse errors
      }
    })

    this.ws.on('close', () => {
      console.log(`[Binance] Disconnected. Reconnecting in ${this.reconnectDelay}ms...`)
      if (this.isRunning) {
        setTimeout(() => this._connect(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      }
    })

    this.ws.on('error', (err) => {
      console.error('[Binance] Error:', err.message)
    })
  }

  // ── Message routing ───────────────────────────────────────────

  _route(stream, data) {
    if (stream.endsWith('@ticker')) {
      this._handleTicker(data)
    } else if (stream.includes('@depth')) {
      this._handleDepth(stream, data)
    } else if (stream.endsWith('@forceOrder')) {
      this._handleLiquidation(data)
    } else if (stream.includes('@markPrice')) {
      this._handleMarkPrice(data)
    }
  }

  _handleTicker(d) {
    const symbol = d.s
    state.updatePrice(symbol, {
      price:     parseFloat(d.c),
      change24h: parseFloat(d.P),
      volume24h: parseFloat(d.q),
      high24h:   parseFloat(d.h),
      low24h:    parseFloat(d.l),
    })
    this._broadcast({ type: 'price', symbol, price: parseFloat(d.c), change24h: parseFloat(d.P) })
  }

  _handleDepth(stream, d) {
    const symbol = stream.split('@')[0].toUpperCase()
    const bids = (d.b || []).map(([p, q]) => [parseFloat(p), parseFloat(q)])
    const asks = (d.a || []).map(([p, q]) => [parseFloat(p), parseFloat(q)])
    state.updateOrderbook(symbol, bids, asks)
    this._broadcast({ type: 'orderbook', symbol, bids: bids.slice(0, 10), asks: asks.slice(0, 10) })
  }

  _handleLiquidation(d) {
    const o = d.o
    const symbol   = o.s
    const side     = o.S === 'BUY' ? 'SHORT' : 'LONG'  // force buy = short liquidated
    const price    = parseFloat(o.ap)
    const qty      = parseFloat(o.q)
    const usdValue = price * qty

    const liq = state.addLiquidation(symbol, side, price, qty, usdValue)
    this._broadcast({ type: 'liquidation', ...liq })
  }

  _handleMarkPrice(d) {
    const symbol = d.s
    const rate   = parseFloat(d.r)
    const time   = parseInt(d.T)
    state.updateFunding(symbol, rate, time)
    state.updatePrice(symbol, { markPrice: parseFloat(d.p), indexPrice: parseFloat(d.i) })
    this._broadcast({ type: 'funding', symbol, rate, nextTime: time })
  }

  // ── OI polling ────────────────────────────────────────────────

  async _fetchOI(symbol) {
    try {
      const res  = await fetch(`${BASE_REST}/openInterest?symbol=${symbol}`)
      const data = await res.json()
      const oi   = parseFloat(data.openInterest)
      state.updateOI(symbol, oi)
      this._broadcast({ type: 'oi', symbol, openInterest: oi })
    } catch (e) {
      // silent fail — OI is supplementary
    }
  }

  _pollOI() {
    if (!this.isRunning) return
    for (const sym of this.symbols) this._fetchOI(sym)
    setTimeout(() => this._pollOI(), 30000)
  }

  // ── Broadcast helper ──────────────────────────────────────────

  _broadcast(msg) {
    if (this.onBroadcast) this.onBroadcast(msg)
  }
}

module.exports = BinanceAdapter
