# Module 04 — The Trading Gateway & Live Order Placement

**Read this before touching anything in `backend/gateway/`, `backend/cli/commands/trade/`, or
`shared/lib/runtime/alpaca_bot_cycle.js`.** This is the real-money path. `docs/guide/chapter_16` covers
the *generic* "why a gateway boundary exists" pattern with placeholder filenames; this module is the
actual current code, verified line-by-line on 2026-06-25.

## The three broker adapters

| Broker | Adapter | Order call | Minimal shape |
|---|---|---|---|
| Alpaca (equities/crypto) | `AlpacaAdapter`, `backend/gateway/src/index.ts:456` | `this.alpaca.createOrder(payload)` (:511) | `{symbol, qty, side, type, time_in_force, limit_price?}` — `time_in_force` is `'gtc'` for crypto, `'day'` for fractional equities (an Alpaca 422-rejection workaround) |
| Polymarket (prediction markets) | `PolymarketAdapter`, `:900` | `client.createOrder(...)` then `client.postOrder(signedOrder, OrderType.GTC)` | `{tokenID, price, size, side}` — price is bounds-checked against tick size before submission |
| MT5 (forex/CFDs) | No direct adapter — `backend/cli/commands/trade/trade_mt5.js` launches the real MT5 terminal via a saved profile; symbol/qty/side flow through the MT5 EA bridge, not this gateway | — | `{login, server, has_password, terminal_path}` |

From the CLI, all three are reachable through one function: `commandTrade(args)` in
`backend/cli/commands/trade/trade.js:264` (Alpaca path) or `trade_polymarket.js`'s `commandPolymarket`
(Polymarket path). `alpaca`/`trade` are aliases for the same handler
(`backend/cli/sovereign_cli.js:71-72`).

## The PIN gate (fail-closed by design)

`trade.js`, inside `commandTrade`:
- **:327** reads `process.env.SOVEREIGN_TRADE_PIN`.
- If set: prompts interactively if no `--pin` was given and the terminal is rich (`isRichTerminal()`),
  then **:338** `verifyPin(inputPin, expectedPin)` — a real cryptographic comparison, not a string `===`.
- If **not** set: in a rich terminal you get a warn + manual confirm. In a **non-interactive** context
  (cron, dashboard in-pane spawn, CI) **:353** fails closed outright — `"Unattended LIVE execution
  blocked (Fail-Closed)"`, exit code 1. No silent default-allow path exists.
- **:362** — `buildTradeGatewayLaunch(stripFlagValue(args, '--pin'))` strips the PIN before the spawned
  gateway subprocess's argv is built, so it never appears in `tasklist`/`ps` output. As of 2026-06-25,
  this strip *also* happens unconditionally inside `buildTradeGatewayLaunch` itself
  (`shared/lib/runtime/backend_bridge.js`) — the first fix only covered this one caller; the second
  covers all 8 current callers of that function.

`isRichTerminal()` is `process.stdout.isTTY && !process.env.CI` (`backend/cli/tui/engine/engine.js:45-48`)
— an in-pane dashboard child has a piped, non-TTY stdout, so it always lands on the fail-closed branch
rather than hanging on a prompt nobody can answer. This is why the automated bot (below) always passes
`--pin` explicitly via the env var instead of relying on an interactive prompt.

## The risk engine

`RiskEngineBridge` (`backend/gateway/src/index.ts:610`), `checkRisk(order)` at `:611`, called at `:719`.
If the C++ risk binary isn't found: **dry-run mode warns and approves anyway**; **live mode rejects**
with a `CRITICAL` reason. If the binary *is* found, it also checks the kill-switch status
(module 01) before evaluating notional/volatility/drawdown — an engaged kill-switch rejects regardless
of the other numbers.

## Exit-code propagation — the property everything else depends on

`index.ts:798` (batch path) and `:2055` (single-order CLI path) both check
`order.status === OrderStatus.FAILED || order.status === OrderStatus.RISK_REJECTED` and set
`process.exitCode = 1` (`:804`, `:2057`) on failure. `trade.js`'s `spawnSync` result `.status` is
returned straight up the call chain. **This is why a failed buy never gets recorded as a phantom open
position, and a failed exit sell never silently drops a position from tracking** — every caller that
records state checks this exit code first.

## The Alpaca bot's own position memory

`shared/lib/runtime/alpaca_bot_cycle.js` — no broker provides free position tracking with stop/target/age
logic, so this file is it:

- `decideExit(position, currentPrice, ageDays)` (:14) — pure, returns `'target'|'stop'|'age'|null`.
- `canOpenPosition(openCount, maxPositions)` (:29) — pure concurrency cap (added 2026-06-23 after an
  earlier gap let the bot exceed its own configured limit).
- `resolveEntryQty(brokerPos, requestedQty)` (:42) — records the broker's *actual filled* qty, not the
  requested qty, so a partial fill doesn't desync the tracker from reality.
- `resolveExitQty(positionQty, availableQty)` (:56) — clamps a sell to what the broker can actually
  deliver (handles two tracked positions sharing one symbol's holding).
- `buildExitOutcome(position, exitReason, currentPrice, sellQty, cycleId, isLive)` (:74) — added
  2026-06-25: when `resolveExitQty` clamps a sell below the tracked qty, this computes realized P&L from
  what was *actually sold*, not the original tracked qty, and returns the unsold remainder as a
  still-tracked position instead of dropping it.
- `runAlpacaExitCheck(args)` (:140) — the review loop: acquires a PID-staleness lock, checks every
  tracked position against the broker snapshot, fires real sells in `--live`, and is always run *before*
  the entry loop in `strategy.js`'s `runAutomationPass` (module 03) — review-then-buy, same ordering
  Polymarket's bot uses.

## Labs

**Lab 1 — read the fail-closed path for real.** With `SOVEREIGN_TRADE_PIN` unset in your shell, run:
```bash
node backend/cli/sovereign_cli.js trade buy AAPL 1 market --live --json
```
Confirm you get exit code 1 and the exact fail-closed message from `trade.js:353`, with **no prompt**
(this is non-interactive from this shell's perspective once piped through `--json`). Then check `$?`
(bash) or `$LASTEXITCODE` (PowerShell).

**Lab 2 — trace a real order's args, not your assumption of them.** Open `trade.js` and find
`buildTradeArgsFromActionFlag` (added 2026-06-25, right before `commandTrade`). Without running
anything, work out by hand what `['--action','buy','--symbol','aapl','--qty','5','--order-type','limit',
'--price','180']` becomes after this function runs. Then verify:
```bash
node -e "console.log(require('./backend/cli/commands/trade/trade.js').buildTradeArgsFromActionFlag(['--action','buy','--symbol','aapl','--qty','5','--order-type','limit','--price','180']))"
```

**Lab 3 — find the oversell guard's limit yourself.** In `alpaca_bot_cycle.js`, construct (on paper, no
need to run code) a scenario where `resolveExitQty` would clamp a sell, then trace what `buildExitOutcome`
does to the realized P&L and the remaining position in that exact scenario. Compare your answer against
the test cases in `tests/scripts/lib/alpaca_bot_cycle.test.js` (search for "clamped partial exit").

**Lab 4 — confirm the kill-switch boundary.** Run:
```bash
node backend/cli/sovereign_cli.js bot health --json
```
then find, by reading `RiskEngineBridge.checkRisk` in `index.ts`, exactly which JSON field in the C++
binary's `kill-switch status` output it reads to decide rejection. Don't guess the field name — find it.

**Lab 5 — the highest-impact open gap.** `workspace/DEV_REVIEW.md` (search "Gate.io") flags that the
Gate.io spot market-order semantics (`GateIoAdapter`, `index.ts:247` onward — the order payload's
`amount`/`side`/`type` fields are built around `:311-313`) have only been reviewed at the gateway-code
level, never empirically probed against the real API. Read that code and write down, in your own words,
what you'd test to close that gap (hint: for a market order, does `amount` mean base-currency quantity
or quote-currency notional, and does Gate.io's API interpret it the same way for buy vs sell?). You
don't have to run a live order to do this lab — the point is being able to state the open question
precisely.
