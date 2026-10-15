# Module: Paper Trading Settlement & Accounting Ledger

> **Status:** Implemented & Hardened (PM-SETTLE-01 Resolved)  
> **Audience:** Financial Engineers, Backend Developers, Risk Officers  
> **Canonical owners:** `backend/gateway/src/polymarket/paper_ledger.ts`, `backend/gateway/src/polymarket/paper.ts`  
> **Review triggers:** Accounting rules, settlement windows, ledger schema versions, locking protocols  

## Purpose And Non-Goals

This module provides a cryptographically chained, double-entry virtual paper ledger for simulated execution, position tracking, cash reconciliation, and settlement accounting.

**Goals:**
- Maintain an append-only, SHA-256 hash-chained event journal (`events.jsonl`) with prior-event digest verification.
- Model realistic **settlement delay windows**: proceeds from asset sales enter `pending_receivables` and cannot finance new buy orders until settlement maturation ($T+1$ or configurable settlement duration).
- Enforce strict **temporal projection grounding**: default projections evaluate against current wall-clock time (`Date.now()`) or caller-supplied `asOf`, preventing future unearned receivables from being spent.
- Size paper orders strictly from **`available_cash`** (settled cash minus active pending receivables), preventing unearned settlement leakage.
- Record discrete **funding fee cashflows** (`event_type: 'funding_fee'`) for crypto derivatives without corrupting asset cost bases or trade execution prices.
- Provide atomic concurrency control via PID-verified lockfiles (`ledger.lock`).

**Non-Goals:**
- It is not a real-money broker execution gateway (production broker orders route through authenticated broker adapters).
- It does not mutate external broker accounts.

---

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `replayLedger(events, fallbackBalance, options)` | `backend/gateway/src/polymarket/paper_ledger.ts` | Replays events to produce a `LedgerProjection` with `virtual_balance`, `settled_cash`, `pending_receivables`, positions, and realized PnL. |
| `appendLedgerEvents(storageDir, newEvents)` | `backend/gateway/src/polymarket/paper_ledger.ts` | Atomically validates hash linkage, sequence continuity, and appends events to `events.jsonl`. |
| `acquireLedgerLock(storageDir, now)` | `backend/gateway/src/polymarket/paper_ledger.ts` | Acquires process lockfile with PID and timestamp; reclaims stale locks (>10m) if owning PID is dead. |
| `releaseLedgerLock(storageDir, token)` | `backend/gateway/src/polymarket/paper_ledger.ts` | Releases held lockfile matching the issued UUID token. |

### Event Types & Accounting Invariants

1. `ledger_initialized`: Genesis event setting `starting_balance` and `cash_after`.
2. `paper_fill`: Buy or sell execution. Sells specify `settlement_due_at`.
3. `position_settled`: Market resolution or contract expiry. Credits payout and updates `realized_pnl`.
4. `funding_fee`: Periodic perpetual funding deduction or credit (`cash_delta: -fee`), preserving position quantity and cost basis.
5. `cash_deposit` / `cash_withdrawal`: Capital allocation adjustments.

---

## Dependencies And Data Flow

```text
Trading Bot Intent ──► Paper Execution (paper.ts)
                             │
                      Acquire Lock (ledger.lock)
                             │
                      Append Event (events.jsonl)
                             │  (SHA-256 Chained)
                             ▼
                      replayLedger()
                             │
       ┌─────────────────────┴──────────────────────┐
       ▼                                            ▼
  settled_cash                             pending_receivables
 (Available for Buys)                     (Unsettled Sales Proceeds)
       │                                            │
       └──────────────◄── [Time >= due_at] ─────────┘
```

---

## Invariants And Safety Boundaries

1. **Genesis Linkage**: Event 1 must have `prior_checksum: "0000...0000"` (64 zeroes).
2. **Sequence Monotonicity**: Every event must have `sequence === index + 1`.
3. **Cryptographic Tamper-Proofing**: `event_checksum === SHA256(stableObject(unsignedEvent))`. Any modified byte invalidates all subsequent events upon replay.
4. **Available Cash Invariant**:
   $$\text{AvailableCash}(t) = \max(0, \text{settled\_cash}(t) - \sum \text{pending\_receivables}_{t_i > t})$$
   **Enforcement (`PM-SETTLE-01` Resolved)**: `replayLedger(..., options)` default projections evaluate at `options.asOf ?? options.now ?? Date.now()`, ensuring omitted `asOf` anchors to the current instant rather than terminal infinity. Furthermore, `backend/gateway/src/polymarket/paper.ts` sizes paper buy orders strictly against `available_cash` rather than nominal `virtual_balance`, synchronizing `available_cash` and `settled_cash` deductions.

---

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| Corrupt/truncated line in `events.jsonl` | `readLedger().ok === false` | Replay halts; prevents further mutations | Operator / `paper_ledger.ts` |
| Hash mismatch at sequence $N$ | `error: 'checksum mismatch'` | Refuses writes; preserves intact history | Audit investigator |
| Stale lockfile from crashed process | `recovered_stale_lock: true` | Cleans up lock only if PID is confirmed dead | Lock manager |
| Pre-due receivable spending attempt | `error: 'insufficient available cash'` | Rejects buy order; locks pending receivables until maturation | Gateway / `paper.ts` |

---

## Observability

- **Ledger Status**: `node -r ./shared/lib/runtime/ts_register -e 'console.log(require("./backend/gateway/src/polymarket/paper_ledger").loadLedgerProjection("storage/data/paper_trading/polymarket"))'`.
- **Integrity Check**: Replay logs checksum status and active position counts.

---

## Tests And Evidence

- **Runnable verification**: `node tests/run_node_tests.js tests/scripts/integration/gateway/paper_ledger_settlement.test.js`
  - Verifies that sell proceeds remain locked in `pending_receivables` until settlement timestamp.
  - Verifies that buy orders fail when available cash is insufficient, even with pending receivables.
  - Verifies that `funding_fee` events adjust cash without altering position sizes or average entry price.
