# Polymarket Bot — Pre-Build Research Plan

## Phase 0: Historical data collection

### What we need
1. **Resolved market list** — markets that closed in the last 90–180 days with known YES/NO outcome
2. **Rolling price time series** — full probability curve over the market's lifetime (hourly), not just snapshots
3. **Resolution outcome** — did YES win or NO win?

### Why "rolling" matters here
Polymarket probabilities are not static — a market might open at 10%, spike to 40% on news, then crash back to 8% before resolving NO. A strategy that only looks at "current price" misses this entirely. What we actually need per market:
- The full `{t, p}` time series (already available from CLOB price history)
- **Derived rolling features computed from that series:**
  - 7d and 14d rolling mean (`p_ma7`, `p_ma14`)
  - Rolling volatility (std of `p` over 7d window)
  - Momentum: `p_now - p_7d_ago`
  - Z-score: how many σ is current price from its own rolling mean
  - Time-to-resolution fraction: `elapsed / total_duration` (markets near end behave differently)

These features are what makes a strategy signal actionable vs. noise. Raw price alone is not enough.

### How to get it

#### Gamma API (free, public)
```
GET https://gamma-api.polymarket.com/markets
  ?closed=true
  &limit=200
  &offset=N
  &order=volume  (or end_date_min / end_date_max)
```
Returns: `question`, `outcomes`, `clobTokenIds`, `resolutionSource`, `endDate`, `closed`, `volume`
**Limit**: ~200 per page, cursor-based. ~2000–3000 historical markets accessible.

#### CLOB price history (free, public)
```
GET https://clob.polymarket.com/prices-history
  ?market=<token_id>
  &interval=1d     # or 1h
  &fidelity=100
```
Returns: `history: [{t: unix_sec, p: float}]`
Already implemented as `polymarket price-history --token <id>`.

### Proposed data schema
```
storage/data/polymarket_history/
  markets_index.json        # [{conditionId, question, tokens:[{id,outcome}], resolved, winner, volume, endDate}]
  prices/<token_id>.json    # [{t, p}] hourly snapshots
  features/<token_id>.json  # point-in-time rolling features derived from prices
  orderbooks-lite/<token_id>.jsonl # candidate-time spread/depth snapshots only
```

### Ingest script
Implemented command surface:
- `polymarket research ingest --days 90 --interval 1h --max-markets 500 --category crypto --json`
- `polymarket history ingest --days 90 --interval 1h --max-markets 500 --category crypto --json`

Implementation owner:
- `shared/lib/market/polymarket_history.js` normalizes Gamma closed markets, CLOB price history, local archive reads/writes, coverage summaries, and feature-file generation.
- `storage/data/polymarket_history/` is generated local state and is ignored by git.

Ingest flow:
1. Paginate Gamma for closed markets in window.
2. For each market, fetch CLOB price history for YES token by default.
3. Write normalized prices to `storage/data/polymarket_history/prices/`.
4. Write point-in-time feature rows to `storage/data/polymarket_history/features/`.
5. Report coverage: markets archived, token histories, price points, feature rows, missing history.

PMXT/order-book policy:
- Do not dense-archive full historical order books by default.
- Use PMXT historical order-book snapshots only after a price-history strategy produces candidate trades.
- Store derived candidate-window fields under `orderbooks-lite/`: best bid, best ask, mid, spread, depth_1pct, depth_5pct, snapshot_ts, source.
- PMXT requests require `PMXT_API_KEY` against `https://api.pmxt.dev`; capture is opt-in and no-network tests use injected fetchers.

---

## Phase 1: Strategy backtesting

### Strategy candidates to evaluate

| Strategy | Entry | Exit | Hypothesis |
|---|---|---|---|
| Low-prob dip buy | p < 0.10 | p > 0.30 or resolution | Tail events underpriced |
| High-prob lock | p > 0.85 | hold to resolution | Near-certain markets still pay |
| Mean reversion | p deviates 2σ from 7d MA | return to mean | Markets overreact to news |
| Kelly sizing | any entry | varies | Optimal position sizing |

### Metrics to compute
- Win rate (positions that resolved in favor)
- Expected value per trade (EV = p_win × gain - p_loss × stake)
- Avg hold time
- Max drawdown across all concurrent positions
- Sharpe equivalent (EV / stddev of returns)

### Output
`polymarket backtest --strategy low_prob_dip --days 90 --json`
→ JSON report: `{trades: N, win_rate: 0.XX, ev_per_trade: $X.XX, max_drawdown: $X.XX}`

Current implementation notes:
- Backtests prefer local archive reads when `markets_index.json` exists.
- Use `--live-fetch` or `--no-archive` to force the live historical fetch path.
- Use `--repair-missing` to fetch missing token histories while replaying archive markets.
- Execution costs are included by default and can be configured with `--fee`, `--half-spread`, `--impact-y`, `--order-notional`, and `--rolling-market-volume`.
- Use `--capture-orderbook-lite` to write candidate-window PMXT snapshots into `orderbooks-lite/` when `PMXT_API_KEY` is available.
- Result payloads label `source`, `archiveCoverage`, `fallbackOnlyCount`, `grossPnl`, `totalExecutionCost`, net `totalPnl`, `evPerTrade`, `maxDrawdown`, and `avgHoldTimeHours`.

---

## Phase 1.5: Paper trading

Run the bot logic against live markets without spending real money. This is the gate between backtesting (historical data) and live deployment.

### How it works
- Bot runs its full cycle: fetch markets, score via strategy, pick entries
- Instead of submitting orders via CLOB, it **logs virtual fills** at the current midprice
- Tracks a virtual portfolio: virtual positions, virtual P&L as markets resolve
- Compares virtual P&L to actual Polymarket resolutions

### Virtual portfolio schema
```
storage/data/paper_trading/
  portfolio.json    # {virtual_balance: N, positions: [{token_id, outcome, shares, avg_price, opened_at}]}
  fills.jsonl       # one line per virtual fill: {t, token_id, outcome, side, shares, price, reason}
  pnl_log.jsonl    # one line per resolved position: {t, token_id, outcome, virtual_pnl, resolved_yes}
```

### Entry point
`polymarket paper-run --strategy low_prob_dip --virtual-balance 100 --dry-run`
- `--dry-run` = no real orders, just log
- `--virtual-balance 100` = starting paper capital in pUSD equivalent
- Runs on the same cycle as the live bot (every 5 min or on demand)

### Gate for live deployment
Paper trading must run for **≥7 days** before live mode is enabled. Thresholds:
- Virtual EV > $0 per resolved position
- Win rate on resolved positions > 45%
- Virtual max drawdown < 30% of starting balance

If any threshold fails during paper trading → block live mode flag, alert in terminal.

### Why this order matters
Backtesting uses historical data (survivorship bias risk). Paper trading uses **live prices, real spreads, real liquidity** — it catches issues like: strategy picks markets with no CLOB liquidity, timing lag between signal and available price, edge cases in position deduplication. Both passes together provide reasonable confidence before risking real capital.

---

## Phase 2: Bot architecture

### Entry point
`backend/gateway/src/polymarket_bot_cycle.ts`

```ts
export async function runPolymarketBotCycle(options: {
  dry_run: boolean;
  strategy: 'low_prob_dip' | 'high_prob_lock';
  max_position_usd: number;
  max_concurrent: number;
}): Promise<BotCycleResult>
```

### Cycle logic
1. Fetch active markets from Gamma (category: crypto, volume > threshold)
2. For each market, get current CLOB price for YES token
3. Apply strategy rules → list of (token_id, target_size, target_price)
4. Check existing positions (avoid doubling up)
5. Submit orders via `placePolymarketOrder` (gated by `ai_agent_trading` flag)
6. Log to `storage/data/polymarket_bot_log.jsonl`

### Safety rails
- `max_position_usd` per market (default $1)
- `max_concurrent` open positions (default 5)
- Dry-run mode by default (logs without executing)
- `ai_agent_trading` feature flag must be `true` for live execution
- Daily loss limit: stop if P&L < -$X in rolling 24h

---

## Phase 3: Docker deployment

### Services
```yaml
# docker-compose.yml
services:
  sovereign:
    build: .
    volumes:
      - ./.env:/app/.env:ro
      - ./storage:/app/storage
    command: node --no-deprecation backend/cli/sovereign_cli.js bot run --live
    restart: unless-stopped

  polymarket-bot:
    build: .
    volumes:
      - ./.env:/app/.env:ro
      - ./storage:/app/storage
    command: >
      sh -c "while true; do
        node --no-deprecation backend/cli/sovereign_cli.js trade polymarket bot cycle --live;
        sleep 300;
      done"
    restart: unless-stopped
```

### Ubuntu host cron alternative
```cron
*/5 * * * * cd /opt/sovereign && node --no-deprecation backend/cli/sovereign_cli.js trade polymarket bot cycle --live >> /var/log/polymarket_bot.log 2>&1
```

---

## Decision gate before bot goes live

Run `polymarket backtest --strategy low_prob_dip --days 90 --json` after archive ingest.
- EV per trade must be > $0 after fees
- Win rate on closed positions must be > 45%
- Max drawdown must be < 30% of total capital

If any gate fails → adjust strategy, do not deploy bot.
