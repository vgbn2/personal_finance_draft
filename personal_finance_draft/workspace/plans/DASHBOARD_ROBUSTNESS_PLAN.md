# TUI Execution Robustness & AI-Testability Plan

This plan maps out all registered dashboard commands, diagnoses interactive crashes, provides solutions to run commands alongside the dashboard, and defines the environment mocking bridge for AI testability.

---

## 1. Complete Audit of Manifest Commands & Crash Status

The table below maps out every command registered in the `M` manifest of `sovereign_dashboard.mjs` and their safety status when run inside the dashboard's output pane:

| Command | Category | Crash Risk | Cause of Crash / Silent Fail | Resolution / Mode |
| :--- | :--- | :--- | :--- | :--- |
| `status` | Operational | **None (Safe)** | None. Terminates quickly. | Runs in-pane. |
| `cockpit` | Operational | **High** | Opens full-screen interactive dashboard. | Run via `runExternal` (unmount TUI). |
| `watch` | Operational | **Medium** | Runs infinitely. Freezes TUI if blocking. | Runs in-pane, abortable via Escape. |
| `cache-clean` | Operational | **Low** | Prompts confirm if dry-run is false. | Runs in-pane. Add `--force` flag. |
| `backend integrity` | Data | **None (Safe)** | None. Returns static table. | Runs in-pane. |
| `ingest` | Data | **None (Safe)** | None. Terminates after fetch. | Runs in-pane. |
| `backfill-daemon` | Data | **Medium** | Runs infinitely. Freezes TUI if blocking. | Runs in-pane, abortable via Escape. |
| `intraday-rollup` | Data | **None (Safe)** | None. Runs calculations and exits. | Runs in-pane. |
| `clear-api-cache` | Data | **Low** | Prompts confirm if dry-run is false. | Runs in-pane. Add `--force` flag. |
| `backend status` | Backend | **None (Safe)** | None. C++ status checks. | Runs in-pane. |
| `backend stats` | Backend | **None (Safe)** | None. Stats reports. | Runs in-pane. |
| `backend correlation`| Backend | **None (Safe)** | None. Computes correlation matrix. | Runs in-pane. |
| `backend visualize`| Backend | **None (Safe)** | Non-TTY defaults to one-shot mode. | Runs in-pane. |
| `backend universe` | Backend | **None (Safe)** | None. Lists cache inventory. | Runs in-pane. |
| `features` | Research | **None (Safe)** | None. Computes indicators and exits. | Runs in-pane. |
| `models` | Research | **None (Safe)** | None. Runs comparison and exits. | Runs in-pane. |
| `bt` | Research | **Medium** | Prompts for strategy/symbol if blank. | Runs in-pane. Populate flags via TUI. |
| `optimize` | Research | **Medium** | Prompts for strategy if blank. | Runs in-pane. Populate flags via TUI. |
| `edge-decay` | Research | **None (Safe)** | None. Computes decay metrics. | Runs in-pane. |
| `alpaca` | Trade | **High** | Prompts for profiles. Requires PIN on live. | Run via `runExternal` (unmount TUI). |
| `mt5` | Trade | **High** | Prompts for account slots. Requires PIN on live. | Run via `runExternal` (unmount TUI). |
| `add-platform` | Trade | **High** | Setup wizard prompts for secret keys. | Run via `runExternal` (unmount TUI). |
| `trade favorites` | Trade | **High** | Prompts for favorites action. | Run via `runExternal` (unmount TUI). |
| `auto-trade` | Trade | **High** | Prompts for confirmation. Requires auth/PIN. | TUI PIN prompting + Env Injection. |
| `agent` | Trade | **Medium** | Prompts for query if blank. | Runs in-pane. In TUI, default query. |
| `strategy` | Trade | **High** | Interactive sub-menus. | Run via `runExternal` (unmount TUI). |
| `prop-firms` | Trade | **High** | Interactive sub-menus. | Run via `runExternal` (unmount TUI). |
| `run` | Trade | **High** | Interactive runner controls. | Run via `runExternal` (unmount TUI). |
| `polymarket portfolio`| Polymarket | **None (Safe)** | None. Fetches balance sheet. | Runs in-pane. |
| `polymarket markets`| Polymarket | **High** | Heavy prompt-based browsing/ordering. | Run via `runExternal` (unmount TUI). |
| `polymarket history` | Polymarket | **None (Safe)** | None. Fetches price history. | Runs in-pane. |
| `polymarket backtest`| Polymarket | **None (Safe)** | None. Runs historical backtest. | Runs in-pane. |
| `polymarket derive-creds`| Polymarket | **High** | Setup wizard prompts. | Run via `runExternal` (unmount TUI). |
| `bot` | Polymarket | **High** | Control panel prompts. Requires auth/PIN. | Run via `runExternal` (unmount TUI). |
| `settings show` | Settings | **None (Safe)** | None. Prints user settings. | Runs in-pane. |
| `settings favorites`| Settings | **None (Safe)** | None. Updates favorites file. | Runs in-pane. |
| `settings timezone` | Settings | **None (Safe)** | None. Updates timezone. | Runs in-pane. |
| `settings layout` | Settings | **None (Safe)** | None. Updates layout preset. | Runs in-pane. |
| `settings params` | Settings | **None (Safe)** | None. Updates default parameters. | Runs in-pane. |
| `settings flags` | Settings | **None (Safe)** | None. Toggles feature gates. | Runs in-pane. |
| `settings alerts` | Settings | **None (Safe)** | None. Updates alert preferences. | Runs in-pane. |
| `settings reset` | Settings | **None (Safe)** | None. Resets settings file. | Runs in-pane. |
| `auth-status` | Account | **None (Safe)** | None. Checks cache session. | Runs in-pane. |
| `login` | Account | **High** | Prompts for email & password. | Run via `runExternal` (unmount TUI). |
| `register` | Account | **High** | Prompts for registration email. | Run via `runExternal` (unmount TUI). |
| `logout` | Account | **None (Safe)** | None. Clears local session. | Runs in-pane. |

---

## 2. Root Cause of Interactive Crashes

1. **Piped Stdin EOF**: When a child process is spawned using Node `spawn` with piped stdin (no input streams connected from the TUI), calling `readline`'s `question()` or Inquirer prompts instantly triggers `EOF` (End of File). The prompt resolves with empty/null strings, leading to immediate validation crashes or authorization failures.
2. **Raw Mode Throws**: In piped mode, `process.stdin.setRawMode(true)` throws `Error: ENOTTY` because stdin is a pipe rather than a true TTY descriptor. This crashes the Node execution loop immediately.

---

## 3. Resolving Execution Boundaries & Running Alongside Dashboard

To ensure all commands can be run alongside the dashboard without crashes or freezes, we apply three core design solutions:

### A. TUI Process Unmounting for Takeover Commands
Fully interactive takeover commands (like `cockpit`, `alpaca`, `mt5`, `polymarket markets`, `login`, etc.) require full-screen terminal control and raw keyboard interception. They must unmount the dashboard TUI, run using synchronous `spawnSync` with inherit stdio, and then remount the dashboard once completed.
We register these commands in `INTERACTIVE_CMDS` inside `sovereign_dashboard.mjs`:
```javascript
const INTERACTIVE_CMDS = new Set([
  'cockpit',
  'watch', // when run interactively
  'auto-trade', // when run interactively
  'alpaca',
  'mt5',
  'polymarket markets',
  'polymarket derive-creds',
  'login',
  'register',
  'add-platform',
  'trade favorites',
  'strategy',
  'prop-firms',
  'run',
  'bot'
]);
```

### B. Asynchronous In-pane Abort Support
For commands running in-pane (like `watch` or `backfill-daemon`), the dashboard blocks normal navigation keys during execution to prevent rendering conflicts, but intercepts `Escape` and `c` keys to kill the subprocess gracefully.
```javascript
if (running) {
  if (key.escape || input === 'c') {
    if (childRef.current) {
      try { childRef.current.kill('SIGINT'); } catch (e) {}
      setOutput(c => c + '\n\n[Command aborted by user]\n');
    }
    setRunning(false);
    return;
  }
}
```

### C. Dashboard-level PIN Prompting & Env Injection
Instead of letting child processes prompt for MFA/PIN, the dashboard prompts the user for their 4-digit PIN inside the React tree before spawning any live trade command.
1. When selecting "Run" on a command with `--live` flag set to `true`, the dashboard sets `focus` to `'pin'` and shows a secure input card.
2. Once the PIN is submitted, it is injected as the `SOVEREIGN_TRADE_PIN` environment variable to the spawned child process, bypassing the CLI PIN prompt completely.

---

## 4. Designing for AI-Testability (Mocking Bridge)

To enable AI models (like Codex or Claude) or automated CI runners to test all dashboard interfaces, auth paths, and live trading flows headlessly, we introduce the `SOVEREIGN_MOCK=true` mode.

1. **Auth Bypass**: In `backend/cli/lib/auth.js`, if `process.env.SOVEREIGN_MOCK === 'true'`, then `requireAuth` returns `true`, `verifyPin` returns `true`, and `getAuthenticatedUser` returns a dummy user session.
2. **No Prompts/Interactive Blocks**: With mock mode active, all prompts instantly resolve with mock credentials.
3. **Execution Verification**: Testing agents can run commands headlessly and check the output JSON/logs directly.
