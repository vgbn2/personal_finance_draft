# Sub-Position Virtual Ledger & Multi-Broker Reconciliation

## 1. Purpose & Core Problem

In automated trading systems, multiple independent trading strategies (e.g. Trend Following, RSI Mean Reversion, Volatility Breakout) and manual operator discretionary trades may target the same financial asset (e.g. `SPY`, `BTC/USD`) simultaneously. 

Most brokerages (such as Alpaca or Gate.io) maintain only an **aggregate position** per symbol (e.g. "Long 100 shares of SPY"). They do not natively track which shares belong to which automated strategy or which were placed manually by an operator. 

Without sub-position attribution:
1. One strategy closing its position might inadvertently liquidate another strategy's open position or the operator's manual investment.
2. Position sizing and risk models cannot accurately compute per-strategy drawdown, return on capital, or win/loss expectancy.

The **Sub-Position Virtual Ledger** (`shared/lib/runtime/sub_positions_ledger.js`) solves this by establishing a deterministic, atomic, and persistent accounting layer between the physical broker holdings and internal strategy logic.

```text
+---------------------------------------------------------------------------------------------------+
|                            SUB-POSITION RECONCILIATION ARCHITECTURE                               |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ Autonomous Bot Strategies ]                         [ Discretionary Operator CLI ]             |
|  - Strategy A: RSI Reversal (5m)                       - Manual Limit/Market Orders               |
|  - Strategy B: Trend Follow (1h)                                    │                             |
|              │                                                      │                             |
|              ▼                                                      ▼                             |
|  [ Deterministic Order Signatures ]                    [ Manual Order Signatures ]                |
|  `strat_rsi_5m_1756148200000_a1b2c3`                   `manual_cli_SPY_1756148200000_d4e5f6`      |
|              │                                                      │                             |
|              └──────────────────────────────┬───────────────────────┘                             |
|                                             │                                                     |
|                                             ▼                                                     |
|                        [ Broker Order Execution Gateway ]                                         |
|                        (Alpaca / Polymarket / Gate.io)                                            |
|                                             │                                                     |
|                                             ▼                                                     |
|                        [ Sub-Positions Virtual Ledger ]                                           |
|                        `storage/data/runtime/ledger/sub_positions.json`                           |
|                        - Atomic File Locking (`.lock`) & Temp Writes                              |
|                        - Itemized Active Sub-Positions & History                                  |
|                                             │                                                     |
|                                             ▼                                                     |
|                        [ Multi-Broker Reconciliation ]                                            |
|                        • Sum(Active Bot Sub-Positions) = Claimed Bot Qty                          |
|                        • Broker Qty - Claimed Bot Qty = Residual `[MANUAL]` Qty                   |
|                        • Protects manual holdings from bot liquidation                            |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Deterministic Order Signatures

Every order dispatched through the platform is tagged with a deterministic client order identifier and cryptographic signature.

### Signature Formatting Specification
- **Automated Bot Orders**:
  $$\text{Signature} = \text{"strat\_"} + \text{strategyId} + \text{"\_"} + \text{timeframe} + \text{"\_"} + \text{timestampMs} + \text{"\_"} + \text{entropyHex(6)}$$
  *Example*: `strat_mean_reversion_5m_1756148200000_3f9a2b`
- **Manual Discretionary Orders**:
  $$\text{Signature} = \text{"manual\_cli\_"} + \text{symbol} + \text{"\_"} + \text{timestampMs} + \text{"\_"} + \text{entropyHex(6)}$$
  *Example*: `manual_cli_SPY_1756148200000_8c1e4d`

### Bidirectional Parsing (`parseOrderSignature`)
The signature parser decompiles the signature string to recover provenance:
- Origin: `bot` vs `manual`
- Associated `strategyId` and `timeframe`
- Creation timestamp and random entropy bytes

---

## 3. Virtual Ledger Persistence & Schema

The ledger state is stored locally in JSON format at `storage/data/runtime/ledger/sub_positions.json`.

### Concurrency & Write Safety
- **File-Lock Protocol**: Operations acquire an exclusive `.lock` file via `withFileLockSync()` before reading or mutating the ledger.
- **Atomic Commits**: Mutations are written to a temporary file (`sub_positions.json.tmp`) and committed via `fs.renameSync()` to guarantee zero partial-file corruption on power failure.

### Data Schema
```json
{
  "version": 1,
  "last_updated": "2026-09-07T10:00:00.000Z",
  "positions": {
    "SPY": [
      {
        "sub_id": "sub_SPY_strat_mean_reversion_1756148200000",
        "symbol": "SPY",
        "strategy_id": "mean_reversion",
        "source": "bot",
        "quantity": 25.0,
        "entry_price": 542.50,
        "timeframe": "5m",
        "confidence": 0.82,
        "signature": "strat_mean_reversion_5m_1756148200000_3f9a2b",
        "order_id": "alpaca_ord_882910",
        "submitted_at": 1756148200000,
        "status": "open"
      }
    ]
  },
  "history": []
}
```

---

## 4. Multi-Broker Position Reconciliation Algorithm

The reconciliation engine (`reconcilePositions`) synchronizes physical broker balances with virtual ledger commitments:

1. **Query Physical Holdings**: Fetches aggregate holdings from the broker API (e.g. Alpaca `GET /v2/positions`).
2. **Calculate Claimed Bot Quantities**:
   $$\text{Quantity}_{\text{Claimed Bot}} = \sum_{p \in \text{Positions}(\text{Symbol})} p.\text{quantity} \quad (\text{where } p.\text{source} == \text{"bot"})$$
3. **Calculate Residual Manual Holdings**:
   $$\text{Quantity}_{\text{Residual Manual}} = \text{Quantity}_{\text{Broker Aggregate}} - \text{Quantity}_{\text{Claimed Bot}}$$
4. **Auto-Attribution of `[MANUAL]` Sub-Positions**:
   - If $\text{Quantity}_{\text{Residual Manual}} > 0$, a synthetic sub-position tagged as `[MANUAL]` is injected into the reconciled position view.
   - If $\text{Quantity}_{\text{Residual Manual}} < 0$ (over-allocation / manual liquidation occurred externally), active bot sub-positions are clamped and an unallocated mismatch warning is logged.

---

## 5. LIFO Exit Execution & Position Reduction

When a strategy signals an exit (`recordSubPositionExit`):
- **LIFO Processing**: The ledger iterates through the strategy's open sub-positions in reverse chronological order (newest first).
- **Partial Reductions**: If exit quantity is less than the sub-position quantity, the sub-position's quantity is decremented and remains open.
- **Full Closures**: When fully closed, the sub-position is moved to `ledger.history[]`, recording exit price, realization timestamp, and calculated PnL.
- **Key Cleanup**: Symbols with zero remaining open sub-positions are cleanly pruned from the `positions` dictionary.
