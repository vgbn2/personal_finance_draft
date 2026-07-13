# TUI Feature Map

Source of truth: `backend/cli/tui/manifest.js` + `backend/cli/sovereign_cli.js`
Updated: 2026-06-11

Current audit baseline: this map is aligned to the 2026-06-11 feature pass. Use `workspace/FEATURE_TEST_MATRIX.md` for the verification ledger and `workspace/STATE.md` for the append-only repo truth.

Legend:
- `PASS`
- `PARTIAL`
- `STUB`
- `BROKEN`

---

## Main Menu

```text
SOVEREIGN | HH:MM:SS | Select Category:
  Operational Dashboard & Health
  Backend Tools
  Research & Backtesting
  Execution & Trading
  Polymarket (Prediction Markets)
  Settings & Preferences
```

`Account & Auth` is registered in the manifest and shown as a direct command group, but it is not part of the main category picker block above.

---

## 1. Operational Dashboard & Health

CLI prefix: none (commands dispatched directly as `sovereign <id>`)

| TUI Label | CLI Command | Flags | Status | Notes |
|---|---|---|---|---|
| Status (Phase, cache, quality) | `sovereign status` | - | PASS | Root status keeps `freshness_scope:"last_fetch_snapshot"` separate from backend integrity. |
| Cockpit (Terminal dashboard) | `sovereign cockpit` | - | PARTIAL | Render/model coverage is green, but quote-provider and backtest trust inputs are still better treated as live-provider dependent checks. |
| Universe (Symbol discovery) | `sovereign universe` | - | PASS | |
| Watch (Semi-live data sync) | `sovereign watch` | `--family`, `--interval` | PASS | |
| Check (Validate live cache) | `sovereign check` | - | PASS | |
| Ingest (Sync market data) | `sovereign ingest` | `--family`, `--symbol`, `--timeframe`, `--history-days` | PASS | `--family` reaches `ingestMarketData()`; `--history-days` is wired. |
| Backfill (Build historical cache) | `sovereign backfill` | `--symbol`, `--timeframe`, `--days`, `--20-years` | PASS | |
| Mass Backfill (All symbols x all timeframes) | `sovereign mass-backfill` | `--timeframes`, `--days`, `--concurrency`, `--dry-run` | PASS | |
| Cache Clean (Quarantine rejected records) | `sovereign cache-clean` | `--dry-run` | PASS | |

---

## 2. Backend Tools

CLI prefix: `backend` -> `sovereign backend <subcommand>`

| TUI Label | CLI Command | Flags | Status | Notes |
|---|---|---|---|---|
| Backend Status | `sovereign backend status` | - | PASS | |
| Backend Stats | `sovereign backend stats` | - | PASS | |
| Backend Data Summary | `sovereign backend data summary` | `--timeframe`, `--max-bars` | PASS | |
| Backend Correlation | `sovereign backend correlation` | `--timeframe`, `--max-bars`, `--method` | PASS | Methods: auto, pearson-returns, fx-returns, pearson-levels. |
| Backend Visualize (Sigma Bands + Live Poll) | `sovereign backend visualize` | `--timeframe`, `--window`, `--interval`, `--no-poll` | PASS | |
| Backend Universe | `sovereign backend universe` | - | PASS | |
| Backend Integrity | `sovereign backend integrity` | - | PASS | Current baseline: `ok:true`, `84/84 cached`, `0 missing`, `0 stale`, `1 exception` (`RNDRUSDT`); `VRE` no longer belongs in the exception set; keep latest-fetch freshness in `status --json`. |

---

## 3. Research & Backtesting

CLI prefix: none (research commands dispatched directly as `sovereign <id>`)

| TUI Label | CLI Command | Flags | Status | Notes |
|---|---|---|---|---|
| Features / Indicators | `sovereign features` | `--timeframe` | PASS | alias: `sovereign indicators` |
| Models Compare (quality gate) | `sovereign models` | `--timeframe` | PASS | |
| Backtest (Prop-firm fit) | `sovereign bt` | `--strategy`, `--timeframe`, `--days`, `--allow-degraded` | PASS | Strategy picker reads the live registry; walk-forward and trust gate are wired. |
| Optimize (Indicators only) | `sovereign optimize` | `--strategy`, `--timeframe` | PASS | Fast-fails when no usable features; no implicit cache refresh. |
| Edge Decay (Rolling window alpha check) | `sovereign edge-decay` | `--strategy`, `--timeframe`, `--symbol` | PASS | |
| Scorecard | `sovereign scorecard` | `--schema`, `--fixture`, `--symbol`, `--state`, `--family`, `--tf`, `--direction`, `--min-conf`, `--top`, `--allow-degraded`, `--no-backfill` | PASS | Both TUI manifests expose the same flags. Schema 2 defaults fail closed; partial coverage is opt-in and labeled degraded. Schema 3 uses catalog rows with single-asset evidence drill-down. |

---

## 4. Execution & Trading

CLI prefix: varies per command. Strategy Management, Prop Firm, and Persistent Runners are single entries that open their own sub-menus.

| TUI Label | CLI Command | Flags | Status | Notes |
|---|---|---|---|---|
| Alpaca | `sovereign alpaca` | - | PARTIAL | Routes to `commandTrade`; live broker data are present, but quote fallback still depends on credentials. |
| MT5 / EA | `sovereign mt5` | - | PASS | |
| + Add Broker | `sovereign add-platform` | - | PASS | |
| Auto-Trade Loop | `sovereign auto-trade` | `--interval`, `--live` | PARTIAL | `--live` gates on `requireAuth`; live broker execution remains a manual gate. |
| AI Agent | `sovereign agent` | `--query` | PARTIAL | Works when Ollama is running locally; falls back gracefully when offline. |
| Strategy -> sub-menu: New / List / Validate / Sync Registry | `sovereign strategy [new|list|validate|sync]` | - | PASS | |
| Prop Firm -> sub-menu: Profiles / Set Active / Inspect Profile | `sovereign prop-firms [list|set-active|show]` | - | PASS | |
| Persistent Runners -> sub-menu: Loop Status / Start Paper Bot / Start Auto-Backfill Loop / Start All Runners | `sovereign run [status|bot paper|backfill|all]` | prompted inline | PASS | |

---

## 5. Polymarket (Prediction Markets)

CLI prefixes: `polymarket` -> `sovereign polymarket <subcommand>`; `bot` -> `sovereign bot <subcommand>`

The Edge Trader Bot stays in this section because it trades exclusively on Polymarket.

| TUI Label | CLI Command | Flags | Status | Notes |
|---|---|---|---|---|
| Portfolio | `sovereign polymarket portfolio` | - | PARTIAL | Funder/signer wallet handling is wired; live reachability depends on the current environment and credential state. |
| Browse Active Markets | `sovereign polymarket markets` | - | PARTIAL | Gamma browsing is wired, but this shell still needs a runtime/network-capable host for a live fetch. |
| Historical Price Data | `sovereign polymarket history` | `--event`, `--history-days`, `--timeframe` | PARTIAL | Scoped output is wired; live CLOB fetch is environment-dependent here. |
| Derive L2 API Credentials | `sovereign polymarket derive-creds` | - | PASS | Prints `POLYMARKET_API_KEY/SECRET/PASSPHRASE` for .env paste. |
| Bot: Health Check (credentials, API, balance) | `sovereign bot health` | - | PASS | |
| Bot: Status | `sovereign bot status` | - | PASS | |
| Bot: Run Cycle (dry-run) | `sovereign bot cycle` | `--live` | PARTIAL | Dry-run is verified; `--live` remains a manual real-money gate. |
| Bot: Start Loop | `sovereign bot run` | `--interval`, `--live` | PARTIAL | Same live caveat as above. |
| Bot: Enable | `sovereign bot config --key enabled --value true` | - | PASS | |
| Bot: Disable | `sovereign bot config --key enabled --value false` | - | PASS | |
| Bot: View / Edit Config | `sovereign bot config` | `--key`, `--value` | PASS | |

---

## 6. Settings & Preferences

CLI prefix: `settings` -> `sovereign settings <subcommand>`

| TUI Label | CLI Command | Flags | Status | Notes |
|---|---|---|---|---|
| Show Current Config | `sovereign settings show` | - | PASS | Persists to `storage/data/user_settings.json`; env override via `SOVEREIGN_USER_SETTINGS_PATH`. |
| Set Timezone | `sovereign settings timezone` | `--value` (select) | PASS | |
| Set Layout Preset | `sovereign settings layout` | `--preset` | PASS | |
| Default Trading Params | `sovereign settings params` | `--position-size`, `--stop-loss`, `--take-profit`, `--min-edge`, `--max-positions`, `--polling-interval` | PASS | Merge-patch; unset flags leave existing values unchanged. |
| Feature Flags | `sovereign settings flags` | `--flag`, `--value` | PASS | Toggles: `bot_autopilot`, `polymarket`, `onchain_data`, `multi_agent_research`, `auto_rebalance`, `ai_agent_trading`, `auto_backfill`. |
| Alert Preferences | `sovereign settings alerts` | `--email`, `--push` | PASS | |
| Reset to Defaults | `sovereign settings reset` | - | PASS | |

---

## 7. Account & Auth

CLI prefix: none (commands dispatched directly)

| TUI Label | CLI Command | Flags | Status | Notes |
|---|---|---|---|---|
| Auth Status (who am I) | `sovereign auth-status` | - | PASS | alias: `sovereign whoami` |
| Sign In | `sovereign login` | - | PASS | |
| Create Account | `sovereign register` | - | PASS | Non-TTY stdin queue fixed. |
| Sign Out | `sovereign logout` | - | PASS | |

---

## CLI-Only Aliases (not in TUI menu)

| CLI Command | Alias for | Notes |
|---|---|---|
| `sovereign clean` | `cache-clean` | |
| `sovereign validate` | `check` | |
| `sovereign backtest` | `bt` | |
| `sovereign indicators` | `features` | |
| `sovereign quotes` | - | Quote feed import management. |
| `sovereign mt5-profile` | - | MT5 vault management. |
| `sovereign mt5-connect` | - | MT5 temp INI launch. |
| `sovereign mt5-bridge` | - | MT5 bridge control. |
| `sovereign prune` / `db-prune` | - | Storage pruning. |
| `sovereign demo` | - | Demo mode. |
| `sovereign loc` | - | Line-of-code report. |
| `sovereign whoami` | `auth-status` | |

---

## Current Audit Baseline

- `backend integrity --json` is policy-green on the configured cache with one explicit exception: `RNDRUSDT`.
- `status --json` remains the separate latest-fetch freshness signal and now explicitly reports when the current file is only a scoped snapshot (`freshness_scope: "last_fetch_snapshot_scoped"`, `target_family: "reserves"` in the current 2026-06-11 pass).
- Polymarket browse/history/portfolio are environment-blocked in this shell; the CLI and gateway surfaces are still present.
- Live broker or live-trade execution remains a manual gate and is intentionally outside the no-spend audit.

## Residual Gaps

| Item | Category | Gap | Effort |
|---|---|---|---|
| Cockpit quote badge | Operational | Needs a live quote-provider re-probe in a provider-capable shell to keep the badge honest. | S |
| Browse Active Markets | Polymarket | Environment-blocked in this shell; needs runtime/network access for a live fetch. | env blocker |
| Historical Price Data | Polymarket | Same live fetch blocker as markets. | env blocker |
| Portfolio | Polymarket | Needs a real funded wallet and live reachability to show a non-empty pUSD balance. | env + creds |
| Auto-Trade Loop `--live` | Execution & Trading | Manual real-money gate only. | manual gate |
| Run Cycle `--live` | Edge Trader Bot | Manual real-money gate only. | manual gate |
| Latest-fetch freshness | Data | Still degraded independently of configured cache integrity. | data refresh |
