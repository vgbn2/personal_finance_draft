# Scalping Bot Pivot — Scoping Document

**Status**: Scoping only — no implementation started. Written 2026-06-08 in response to the user
floating "make it a scalping bot" (carried as an open item from session 6, flagged then as "a real
pivot ... not a flag swap").

**TL;DR**: This is **not** a config change or a new strategy YAML — it is a second execution
architecture running alongside the existing minute/day-bar platform. Every layer (strategy model,
loop cadence, market data, fee/slippage modeling, rate-limit handling) currently assumes
minute-or-coarser granularity and would need new code, not configuration. Estimated effort: **weeks,
not days** — this scopes the work, it does not recommend starting it.

---

## 1. What exists today (the baseline this would diverge from)

The platform runs **paper-trading bots on ~30-minute cycles** (`run bot paper --interval 30`,
default in `backend/cli/commands/runner/run.js:98`) executing YAML-defined strategies
(`low_prob_dip`/`mean_revert` on Polymarket; daily-bar strategies on Alpaca/MT5/Gate.io). The whole
stack — strategy schema, loop runner, indicator pipeline, backtester, fee model — is built around
**bar-level data (1d/1h/1m) and minute-resolution timestamps**. This has been refined over ~80
sessions into a coherent, tested system (DCS 0.97).

Scalping is fundamentally different: entries/exits driven by **order-book microstructure**
(bid/ask depth, spread, queue position) on **sub-second to low-second timescales**, where execution
latency and per-trade fees can exceed the edge being captured. That's not a parameter tweak on the
existing model — it's a different trading paradigm requiring different inputs, different timing
guarantees, and different risk controls.

## 2. Gap analysis (what would need to be built, by layer)

### 2a. Strategy module — needs a new execution mode, not a new YAML
Current strategies (`config/strategies/*.yaml`, `shared/lib/strategy_registry.js:216-247`,
`backend/cli/commands/strategy/strategy.js:51-159`) are schema'd around `timeframe` (1d/1h),
`signal_threshold` (a single 0-1 float), `sections.indicators` (RSI/ATR/Bollinger over N bars), and
a single automation pass per cycle (`strategy.js:735-880`: refresh data → backtest → check
threshold → maybe execute). There is no field for order-book state, no concept of multiple
entry/exit prices within one cycle, no partial-fill or queue-position awareness. A scalping
strategy would need a genuinely new `execution_mode: scalp` (or a parallel strategy class) with its
own schema and its own runner — reusing the YAML *registry* (discovery, enable/disable, `strategy
list`) but not the bar-based execution model underneath it.

### 2b. Loop architecture — the runner can go fast; everything it calls cannot
`shared/lib/run_loop.js:38-89` is a generic `setInterval`-style async loop with no hardcoded floor —
technically it could fire every 100ms. But `parseIntervalArg` in `cycle.ts` defaults to whole
**minutes**, every freshness check uses second-resolution ISO timestamps, each cycle currently
re-fetches/re-aggregates a full day-bar dataset (expensive at sub-minute cadence), and cycles are
stateless/isolated between ticks (file-based `run_status.json` only — no in-memory order queue or
"awaiting fill" state machine). Running this loop every second wouldn't crash it, but it would (a)
hammer the data layer with redundant full-frame refreshes, (b) have no way to track an order from
"placed" → "partially filled" → "filled/cancelled" across ticks, and (c) have no backpressure if a
cycle takes longer than the interval.

### 2c. Market data — order-book depth exists for ONE venue, unused
This is the most encouraging finding: **Polymarket's CLOB client already exposes order-book depth**
(`client.getOrderBook(tokenId)` at `backend/gateway/src/index.ts:1792`, returning `bids[]`/`asks[]`
as `[price, size]` tuples — currently wired only to a read-only `polymarket orderbook` display
command, not consumed by any strategy). That's a real head start for a Polymarket-only scalper.
However: it's request/response (no streaming WebSocket — depth can go stale between polls), the
existing price-history cache layer is built for daily aggregation (24h TTL), and **Alpaca and
Gate.io have no order-book plumbing at all** — last-price/OHLCV only. A multi-venue scalper would
need new depth-streaming integrations for those brokers from scratch.

### 2d. Fee/slippage/latency modeling — currently a single flat constant
`shared/lib/backtest.js:701-838` models costs as one flat `costBps` (default 5 bps total, split
2.5/2.5 between fee and slippage), applied symmetrically on entry and exit, identical across every
broker and instrument. There is **no latency simulation** at all — order placement is treated as
instantaneous in both backtests and live cycles. Scalping economics live or die on exactly the
inputs this model doesn't have: maker-vs-taker fee tiers, size-dependent market impact/slippage,
and realistic latency distributions (p50/p95/p99) between signal and fill. Backtesting a scalping
strategy on the current cost model would produce numbers that are not just optimistic but
*structurally meaningless* — the edge a scalper targets is often smaller than the gap between flat
5bps and real maker/taker/impact costs.

### 2e. Rate limits — no guardrails exist anywhere in the stack
No per-broker throttling exists in any adapter; the only rate limiting found is a generic API-layer
middleware (`backend/api/server/middleware/rate_limiter.js`, 60 req/60s). Inferred provider limits
(not enforced anywhere in code): Alpaca ~1 order/sec, Polymarket CLOB undocumented (likely
sustains low tens/sec but with no published burst budget), Gate.io ~13 req/sec sustained. A
sub-second polling loop with no throttle queue, adaptive backoff, or circuit breaker would risk
getting the bot's API keys rate-limited or banned within minutes of going live — a real operational
hazard, not a theoretical one.

## 3. Reusable building blocks (the encouraging part)

Not greenfield — these pieces transfer:
- **Strategy registry/discovery** (`strategy_registry.js`, `strategy list`/enable/disable UX)
- **Polymarket CLOB order-book API** (already wired, just unused — `index.ts:1792`)
- **FOK (Fill-or-Kill) order logic + cooldown tracking** (`cycle.ts:296-320`) — closer to scalping's
  "take it now or don't" execution style than the platform's other (limit/market, patient) order paths
- **Position state persistence** (`bot_state.ts`) and the paper-ledger pattern (`polymarket_paper.js`)
  for safely proving out a new strategy without spending real funds first
- **`run_loop.js`'s generic interval runner** (just needs a faster, stateful sibling, not a replacement)

## 4. Sizing & risk — why this is "weeks, not days"

| Layer | New code required | Risk if rushed |
|---|---|---|
| Strategy schema + execution engine | New `execution_mode` + runner (parallel to existing automation pass) | Silent fallback to bar-based logic; strategy "looks scalpy" but trades on stale signals |
| Sub-second loop + order state machine | New stateful loop with in-flight-order tracking | Duplicate/orphaned orders, no fill reconciliation |
| Order-book depth integration | Polymarket: wire existing API into a strategy signal. Alpaca/Gate.io: build from scratch | Trading on stale depth → adverse selection (the single biggest scalping failure mode) |
| Realistic fee/slippage/latency model | Per-broker fee tables + size-impact curves + latency distributions in both backtest and live paths | Backtests show profit; live trading bleeds on costs the model never saw |
| Rate-limit/throttle layer | Per-broker queue + backoff + circuit breaker | API ban / key suspension mid-session |

**The fee/latency-modeling gap is the most dangerous one to skip.** Scalping is a game of basis
points; this platform's backtester currently can't even *measure* whether a scalping edge survives
real costs, let alone whether it's profitable live. Building the strategy before fixing this would
produce a bot that backtests beautifully and loses money in paper/live — a worse outcome than not
building it, because it would look validated when it isn't.

## 5. Open questions for the user (decide before any code starts)

1. **Which venue first?** Polymarket has the only existing depth API — does a Polymarket-only
   scalper (prediction-market microstructure, not traditional-asset scalping) match what you had in
   mind, or is the goal specifically equities/crypto scalping (which means building Alpaca/Gate.io
   depth plumbing from zero)?
2. **What's the actual goal?** Is this about chasing a specific observed inefficiency (e.g., "I've
   noticed X pattern on Y market"), or a general capability addition ("the platform should be able
   to scalp")? The former scopes much tighter than the latter.
3. **Is paper-only acceptable for a long validation window?** Given the fee/latency-modeling gap,
   any scalping strategy would need an extended paper-trading proof period with REAL depth data
   (not the flat-cost backtester) before risking live funds — likely longer than the existing 7-day
   paper gate, because scalping edges are thinner and more cost-sensitive than swing strategies.
4. **Resourcing**: does this replace current priorities (Docker deploy review, `.mcp.json` fix, data
   freshness) or run alongside them? Given the size, it would likely become *the* multi-session
   focus if pursued.

## 6. Recommendation

Do not start implementation from this scoping pass alone. If the user wants to proceed, the
right next step is answering §5 (especially Q1/Q2 — venue and motivating thesis), then a **separate
planning pass** scoped narrowly to that answer (e.g., "Polymarket-only scalper exploiting X pattern"
is a very different, much smaller plan than "general multi-venue scalping capability"). Building the
fee/latency/depth-realism layer should be the first implementation milestone regardless of venue —
without it, nothing built on top of it can be trusted.
