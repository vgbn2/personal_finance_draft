# 🛡️ Sentinel-MT5 — AI-Enhanced Trading Bridge

> Low-latency, hallucination-proof trading bot bridging **MetaTrader 5** execution
> with **Discord** notifications, enhanced by a Neural Network for trade validation.

---

## Architecture

```
┌─────────────────────────────────────┐       ┌──────────────────────────────────┐
│   PROCESS A — Quant Engine          │       │   PROCESS B — Discord Gateway    │
│                                     │  ZMQ  │                                  │
│  MT5 Poll → SMC Strategy → AI Score ├──────►│  Leaky Bucket → Embed → Discord  │
│  Watchdog Thread (auto-reconnect)   │ PUSH  │  Rate-limit protection (5 req/s) │
│  TimescaleDB logging                │ PULL  │  Bot mode / Webhook fallback     │
└─────────────────────────────────────┘       └──────────────────────────────────┘
```

Two **separate OS processes** (GIL evasion) communicate via ZeroMQ `tcp://127.0.0.1:5559`.

---

## Quick Start

### 1. Install Dependencies

```powershell
cd c:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\signalbots
pip install -r requirements.txt
```

### 2. Configure Environment

```powershell
copy .env.example .env
```

Edit `.env` with your credentials:

```ini
# Required
MT5_LOGIN_ID=12345678
MT5_PASSWORD=YourPassword
MT5_SERVER=YourBroker-Demo

# Pick ONE Discord mode:
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...   # Simple mode
# OR
DISCORD_BOT_TOKEN=your_bot_token_here                      # Rich embed mode
DISCORD_CHANNEL_ID=123456789                                # Required for bot mode

# Safety (keep true for testing!)
DEMO_ONLY=true
```

### 3. Run

```powershell
python discord_signal.py
```

You'll see:
```
============================================================
  Sentinel-MT5 — AI-Enhanced Bridge
  ZMQ: tcp://127.0.0.1:5559
  Assets: XAUUSD, EURUSD, GBPUSD, USDJPY, AUDCAD, BTCUSD
  Demo Only: True
============================================================
⚡ Engine  PID: 12345
🤖 Gateway PID: 12346
```

---

## File Structure

```
signalbots/
├── discord_signal.py      ← Main entry point (orchestrator)
├── config.py              ← Env-based configuration
├── .env.example           ← Template for secrets
├── .env                   ← Your secrets (git-ignored)
│
├── mt5_engine.py          ← Process A: MT5 + Strategy + AI
├── discord_gateway.py     ← Process B: Discord bot/webhook
├── bridge.py              ← ZeroMQ PUSH/PULL bridge
├── backpressure.py        ← Leaky bucket rate limiter
├── watchdog.py            ← MT5 auto-reconnect
│
├── ai_model.py            ← LSTM scorer (ONNX runtime)
├── feature_engine.py      ← Tensor builder (50×4 features)
├── chart_snapshot.py      ← Candlestick PNG generator
├── db.py                  ← TimescaleDB trade logger
│
├── requirements.txt       ← Python dependencies
├── models/                ← Place trade_scorer.onnx here
└── snapshots/             ← Auto-saved chart PNGs
```

---

## Discord Modes

### Webhook Mode (Simple)
Set `DISCORD_WEBHOOK_URL` in `.env`. Sends embed messages via webhook.
No bot invite needed.

### Bot Mode (Full)
Set `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` in `.env`.
Features: rich embeds, chart image attachments, color-coded AI confidence bars.

**Discord embed example:**
```
🚀 ENTRY — XAUUSD BUY
──────────────────────
  Symbol:       XAUUSD
  Action:       BUY
  Quality:      A+
  Entry:        2650.50
  SL:           2640.00
  TP:           2682.00
  Volume:       0.10
  🟢 AI Confidence: ████████░░ 85%
──────────────────────
  Ticket #12345 • Sentinel-MT5
```

---

## AI Scoring

The LSTM model scores each trade signal **0–100%** (probability of profit within 60 min).
It acts as a **Risk Manager only** — it never executes trades.

### Without a trained model
The system uses a **dummy scorer** that returns 50% for all trades.
Trading continues normally; the AI score is just informational.

### To enable real AI scoring

1. Train your LSTM model (PyTorch):
   - Input: `(batch, 50, 4)` tensor — price delta, volume delta, whale imbalance, sentiment
   - Output: sigmoid probability `[0, 1]`

2. Export to ONNX:
   ```python
   from ai_model import TradeScorer
   TradeScorer.export_to_onnx(your_model, "models/trade_scorer.onnx")
   ```

3. Set path in `.env`:
   ```ini
   ONNX_MODEL_PATH=models/trade_scorer.onnx
   ```

---

## Backpressure (Rate Limiting)

If MT5 fires 50 trades in 1 second (news event), the system **does not** send 50 Discord
messages. Instead:

| Queue Depth | Behavior |
|-------------|----------|
| 1–10 | Send 1 embed per 0.5 seconds |
| 11+ | **Aggregate** into single summary: "⚡ Batch Alert — 15 Signals" |

This prevents Discord API bans (rate limit: 5 req/sec).

---

## Watchdog (Auto-Reconnect)

Runs as a background thread inside Process A. Every 30 seconds:

1. Checks `mt5.terminal_info().connected`
2. If disconnected → `taskkill /F /IM terminal64.exe`
3. Waits 5s → `mt5.initialize()` → `mt5.login()`
4. Gives up after 5 consecutive failures

---

## TimescaleDB (Optional)

If you have TimescaleDB running, set `TIMESCALE_DSN` in `.env`:

```ini
TIMESCALE_DSN=postgresql://postgres:postgres@localhost:5432/sentinel
```

The system auto-creates the `trade_logs` hypertable:
```sql
CREATE TABLE trade_logs (
    time           TIMESTAMPTZ NOT NULL,
    ticket         BIGINT,
    symbol         TEXT,
    type           TEXT,
    price          DOUBLE PRECISION,
    ai_confidence  FLOAT,
    profit         DOUBLE PRECISION
);
```

If DB is unavailable, trades are logged to console instead. **No data is silently lost.**

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bot online, no trade alerts | MT5 lost broker connection | Watchdog handles this automatically. Check logs for "Connection lost" |
| AI score always 0.5 | No ONNX model loaded | Train and export a model, or this is normal (dummy scorer) |
| AI score always 0.99 | Model overfit | Check feature normalization, add more training data |
| Discord alert delayed 10s+ | Polling too slow or ZMQ buffer overflow | Reduce `ENGINE_POLL_INTERVAL` in config |
| "heartbeat blocked" errors | GIL contention | Should not happen — processes are separate. Check if something is running in-process |
| Discord rate-limit ban | Backpressure not working | Check `AGGREGATE_THRESHOLD` in backpressure.py |

---

## Safety

- **`DEMO_ONLY=true`** — Bot refuses to start if account is real money
- **AI never executes** — Only scores trades, never places orders
- **NaN assertions** — Feature pipeline crashes loudly if data is corrupt (no silent bad trades)
- **Credentials in `.env`** — Never committed to git

---

## Running Tests

```powershell
python _test_smoke.py
```

Tests: backpressure, ZMQ bridge, config, AI dummy scorer, Discord embed builders.
