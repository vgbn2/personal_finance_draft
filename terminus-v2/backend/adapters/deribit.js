/**
 * TERMINUS V2 — Deribit Adapter
 * Handles: options data, GEX, put/call ratio, max pain
 * Uses Deribit JSON-RPC over WebSocket
 */

const WebSocket = require('ws')
const state     = require('../state')

const DERIBIT_WS = 'wss://www.deribit.com/ws/api/v2'

class DeribitAdapter {
  constructor(currencies = ['BTC', 'ETH']) {
    this.currencies = currencies
    this.ws         = null
    this.reqId      = 1
    this.isRunning  = false
    this.reconnectDelay = 3000
    this.onBroadcast = null

    // Options data store
    this.optionsData = {}
    for (const c of currencies) {
      this.optionsData[c] = {
        gex:          null,
        putCallRatio: null,
        maxPain:      null,
        iv:           null,
        updatedAt:    null,
      }
    }
  }

  // ── Start ─────────────────────────────────────────────────────

  start() {
    this.isRunning = true
    this._connect()
  }

  stop() {
    this.isRunning = false
    if (this.ws) this.ws.terminate()
  }

  // ── WebSocket ─────────────────────────────────────────────────

  _connect() {
    if (!this.isRunning) return
    console.log('[Deribit] Connecting...')

    this.ws = new WebSocket(DERIBIT_WS)

    this.ws.on('open', () => {
      console.log('[Deribit] Connected')
      this.reconnectDelay = 3000
      this._subscribe()
      this._pollOptions()
    })

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw)
        this._route(msg)
      } catch (e) {
        // ignore
      }
    })

    this.ws.on('close', () => {
      console.log(`[Deribit] Disconnected. Reconnecting in ${this.reconnectDelay}ms...`)
      if (this.isRunning) {
        setTimeout(() => this._connect(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
      }
    })

    this.ws.on('error', (err) => {
      console.error('[Deribit] Error:', err.message)
    })
  }

  // ── Subscribe to ticker streams ───────────────────────────────

  _subscribe() {
    // Subscribe to BTC and ETH index prices
    for (const currency of this.currencies) {
      this._send({
        method: 'public/subscribe',
        params: {
          channels: [
            `deribit_price_index.${currency.toLowerCase()}_usd`,
          ]
        }
      })
    }
  }

  // ── Message routing ───────────────────────────────────────────

  _route(msg) {
    // Subscription notifications
    if (msg.method === 'subscription') {
      const channel = msg.params?.channel || ''
      const data    = msg.params?.data

      if (channel.startsWith('deribit_price_index')) {
        const currency = channel.includes('btc') ? 'BTC' : 'ETH'
        const symbol   = `${currency}USDT`
        if (data?.price) {
          state.updatePrice(symbol, { indexPrice: data.price })
          this._broadcast({ type: 'deribit_index', symbol, indexPrice: data.price })
        }
      }
    }

    // RPC responses
    if (msg.id && msg.result) {
      this._handleRpcResponse(msg.id, msg.result)
    }
  }

  _handleRpcResponse(id, result) {
    // Options summary responses are handled via _processOptions
    if (Array.isArray(result)) {
      this._processOptions(result)
    }
  }

  // ── Options data ──────────────────────────────────────────────

  _pollOptions() {
    if (!this.isRunning) return
    for (const currency of this.currencies) {
      this._fetchOptionsSummary(currency)
    }
    setTimeout(() => this._pollOptions(), 60000) // every 60s
  }

  _fetchOptionsSummary(currency) {
    this._send({
      method: 'public/get_book_summary_by_currency',
      params: {
        currency,
        kind: 'option'
      }
    })
  }

  _processOptions(instruments) {
    if (!instruments.length) return

    // Determine currency from first instrument
    const first    = instruments[0]
    const currency = first.instrument_name?.startsWith('BTC') ? 'BTC' : 'ETH'

    let totalCallOI = 0
    let totalPutOI  = 0
    let totalIV     = 0
    let ivCount     = 0

    // Group by strike for max pain calculation
    const strikeMap = {}

    for (const inst of instruments) {
      if (!inst.instrument_name) continue
      const parts   = inst.instrument_name.split('-')
      if (parts.length < 4) continue

      const strike   = parseFloat(parts[2])
      const optType  = parts[3] // C or P
      const oi       = inst.open_interest || 0
      const iv       = inst.mark_iv || 0
      const midPrice = inst.mid_price || 0

      if (optType === 'C') totalCallOI += oi
      if (optType === 'P') totalPutOI  += oi

      if (iv > 0) { totalIV += iv; ivCount++ }

      // For max pain
      if (!strikeMap[strike]) strikeMap[strike] = { calls: 0, puts: 0 }
      if (optType === 'C') strikeMap[strike].calls += oi * midPrice
      if (optType === 'P') strikeMap[strike].puts  += oi * midPrice
    }

    // Put/call ratio
    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : null

    // Max pain — strike where total option value is lowest
    let maxPain   = null
    let minValue  = Infinity
    for (const [strike, data] of Object.entries(strikeMap)) {
      const total = data.calls + data.puts
      if (total < minValue) {
        minValue = total
        maxPain  = parseFloat(strike)
      }
    }

    // Average IV
    const avgIV = ivCount > 0 ? totalIV / ivCount : null

    // Store
    this.optionsData[currency] = {
      putCallRatio: pcr    ? parseFloat(pcr.toFixed(3))    : null,
      maxPain:      maxPain,
      iv:           avgIV  ? parseFloat(avgIV.toFixed(2))  : null,
      callOI:       totalCallOI,
      putOI:        totalPutOI,
      updatedAt:    Date.now(),
    }

    const symbol = `${currency}USDT`
    this._broadcast({
      type:         'options',
      symbol,
      currency,
      putCallRatio: this.optionsData[currency].putCallRatio,
      maxPain:      this.optionsData[currency].maxPain,
      iv:           this.optionsData[currency].iv,
      callOI:       totalCallOI,
      putOI:        totalPutOI,
    })
  }

  // ── Helpers ───────────────────────────────────────────────────

  _send(payload) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ ...payload, jsonrpc: '2.0', id: this.reqId++ }))
  }

  _broadcast(msg) {
    if (this.onBroadcast) this.onBroadcast(msg)
  }

  getOptionsData(currency) {
    return this.optionsData[currency] || null
  }
}

module.exports = DeribitAdapter
