---
name: polymarket-history-backfill
description: Plan, implement, delegate, and verify Polymarket historical data backfill and replay backtesting in personal_finance_draft. Use when the task mentions Polymarket historical data, CLOB price history, PMXT order-book archives, resolved-market backfills, market impact or slippage modeling, Polymarket strategy backtests, or delegating this work to subagents.
---

# Polymarket History Backfill

Use this skill to turn Polymarket strategy ideas into a repeatable historical archive and replay backtest workflow.

## Load Order

1. Read `workspace/STATE.md`, `workspace/HANDOFF.md`, and today's dated handoff if active context matters.
2. Read `workspace/POLYMARKET_BOT_PLAN.md`.
3. Read `shared/lib/market/polymarket_history.js`, `backend/cli/commands/trade/polymarket_backtest.js`, and `backend/cli/commands/trade/trade.js`.
4. Open `references/implementation-plan.md` before planning implementation waves or spawning subagents.

## Core Direction

- Start with resolved markets plus historical price curves. Do not make full historical order books the first archive layer.
- Store full price curves locally and replay strategies from local files by default.
- Treat PMXT historical order-book snapshots as phase 2 for candidate trades, liquidity filters, and slippage validation.
- Keep `storage/data/polymarket_history/` as generated local state unless the user explicitly asks to commit a fixture or small sample.
- Preserve live-trading safety gates. Historical research must not place live orders.

## Execution Shape

Use this order unless the user explicitly changes scope:

1. Define archive schema and tests.
2. Implement resolved-market and price-history ingest.
3. Make backtests prefer local archive reads.
4. Add feature generation and point-in-time replay.
5. Add execution-cost modeling using spread, fee, and square-root impact.
6. Add PMXT order-book-lite only for candidate entry windows.
7. Update docs and workspace state with commands, limits, and evidence.

## Delegation

When the user asks for subagents or delegation, split work by ownership:

- Worker A: archive library and disk schema under `shared/lib/market/polymarket_history.js` plus focused tests.
- Worker B: CLI ingest and backtest wiring under `backend/cli/commands/trade/`.
- Worker C: feature generation, slippage model, and replay metrics under new or existing market/backtest helpers.
- Reviewer: independent verification against contracts, fixture replay, and storage-growth risks.

Tell workers they are not alone in the codebase, must not revert others' edits, and must list changed files. Keep write sets disjoint.

## Verification Gates

Minimum gates before claiming success:

- `node --check` on every touched JS file.
- Targeted `node --test` for Polymarket history, trade CLI, and backtest contracts.
- A no-network fixture replay proving local archive reads work.
- A small live ingest smoke only when network is available and the user accepts external calls.
- `git status --short -- .` to separate generated history files from code/docs changes.

## Reference

Read `references/implementation-plan.md` for the detailed task breakdown, storage policy, subagent prompts, and acceptance criteria.

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct
  evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after
  expectation and keep production, tests, and docs aligned.
