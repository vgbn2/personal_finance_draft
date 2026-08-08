# Module 07 — How Tests Actually Run Today & Test Integrity Architecture

`docs/operational/guides/testing_surface.md` is the grouped-command reference. This module explains how
the runner behaves, how to debug individual slices, and how the anti-cheating test governance architecture is enforced.

## The one gotcha that costs the most time if you don't know it

**`npx jest` does not work on this codebase's own test files and will lie to you.** It mis-parses the
`node:test`-format files and reports false failures. The real runner:

```bash
npm test                          # = node tests/run_node_tests.js
```

which spawns `node --test` against glob patterns covering `tests/scripts/**/*.test.js` and
`tests/web/**/*.test.js`. If you ever see a confusing failure that "shouldn't be possible," check which
runner produced it before debugging the code.

## Where tests live and what kind

| Folder | Kind |
|---|---|
| `tests/scripts/lib/` | Unit tests on pure functions/helpers (e.g. `alpaca_bot_cycle.test.js`, `backend_bridge.test.js`) |
| `tests/scripts/architecture/` | Contract/structure tests — API shape, config integrity, security checks |
| `tests/scripts/data/` | Backfill/ingestion regression and data-flow tests |
| `tests/scripts/integration/` | Live-path integration (some gated behind `SOVEREIGN_LIVE_TEST=1`) |
| `tests/scripts/tui/` | Interactive-UI tests via the fake-TTY harness (module 05) |
| `tests/scripts/strategy/` | Strategy-specific tests |
| `tests/benchmarks/` | Dedicated performance benchmarks (`npm run bench`, `npm run bench:sim`, `npm run bench:mini-pc`) |

## Hardware Constraint Simulation (`SOVEREIGN_BENCH_PROFILE`)

To test performance under simulated low-power hardware constraints (e.g. 1-Core 512MB Cloud VPS or 2-Core 1GB Mini-PC) without running on dedicated physical hardware, run:

```bash
npm run bench:sim      # 1-Core 512MB VPS profile (OMP=1, UV=2, 25us delay)
npm run bench:mini-pc  # 2-Core 1024MB Mini-PC profile (OMP=2, UV=4, 10us delay)
```

`SOVEREIGN_BENCH_PROFILE` sets libuv threadpool sizing (`UV_THREADPOOL_SIZE`), OpenMP native thread scaling (`OMP_NUM_THREADS`), V8 memory caps (`NODE_OPTIONS`), and nanosecond CPU frequency delay simulation (`artificialDelayUs`).

## Automated Anti-Cheating Test Governance (`scripts/dev/audit_test_integrity.js`)

AI coding agents working on complex repositories can engage in test-gaming ("cheating"). The static analysis scanner `scripts/dev/audit_test_integrity.js` automatically scans all test files under `tests/` and enforces 4 mandatory rules:

- **Rule 1 (Forbidden Internal Mocking)**: Stubs and mocks are permitted **ONLY** for external network/HTTP boundaries (`Alpaca`, `Polymarket`, `Binance`, `Yahoo`, `Stooq`, `CoinGecko`). Core domain engines (`validation.js`, `ts_index_storage.js`, `backtest.js`, `paper_ledger.js`, `strategy.js`, `cli_executor.js`, `equity_session.js`, `quote_router.js`) **MUST NEVER** be mocked or stubbed.
- **Rule 2 (Strict Assertion Enforcement)**: Loose boolean assertions cannot replace strict equality (`assert.equal`, `assert.deepEqual`).
- **Rule 3 (No Silent Error Swallowing)**: Assertions wrapped in `try/catch` blocks without re-throwing or failing the test runner are forbidden.
- **Rule 4 (Fresh-Clone Fixture Isolation)**: Tests must read static inputs from `tests/fixtures/` and never directly read gitignored `storage/data/cache/` paths.

Integrated into architecture contract tests (`npm run test:structure`).

## Environment Variable Isolation (`withIsolatedEnv`)

All tests modifying environment variables (`process.env`) must use the centralized `withIsolatedEnv` helper in `tests/support/env_helper.js` to guarantee zero state leakage across test cases within shared V8 execution contexts:

```javascript
const { withIsolatedEnv } = require('../../../support/env_helper.js');

test('safety guard blocks live trading under poisoned credentials', () => {
  withIsolatedEnv({
    SOVEREIGN_RUNTIME_MODE: 'private-paper',
    LIVE_TRADING: 'true',
    SOVEREIGN_EXECUTION_AUTHORIZED: 'true',
  }, () => {
    const result = runSafetyGuard();
    assert.equal(result.live_blocked, true);
  });
});
```

## Deterministic Strategy Replay via Seeded PRNG (Mulberry32 Pattern)

When testing quantitative strategy logic (e.g. RSI crossovers, ATR risk sizing, Bayesian outcome summaries), tests must avoid volatile external data by generating reproducible OHLCV bars using a seeded Mulberry32 Pseudo-Random Number Generator (`tests/scripts/strategy/rsi_backtest_analyze.test.js`):

```javascript
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSineBars({ n, period, amplitude, base, jitterAmp, seed }) {
  const rand = mulberry32(seed);
  const startMs = Date.parse('2020-01-01T00:00:00Z');
  const dayMs = 86400000;
  const bars = [];
  for (let i = 0; i < n; i += 1) {
    const jitter = (rand() - 0.5) * 2 * jitterAmp;
    const close = base + amplitude * Math.sin((2 * Math.PI * i) / period) + jitter;
    const prevClose = i === 0 ? close : bars[i - 1].close;
    bars.push({
      timestamp: new Date(startMs + i * dayMs).toISOString(),
      open: prevClose,
      high: Math.max(close, prevClose) + 0.5,
      low: Math.min(close, prevClose) - 0.5,
      close,
      volume: 1000,
    });
  }
  return bars;
}
```

### Invariant Assertions
Deterministic fixture tests assert numeric invariants to catch calculation drift end-to-end:
- **Kelly Fraction Bounds**: `0 <= Kelly <= 1`
- **Hit Rate Bounds**: `0 <= hit_rate <= 1`
- **Exact Numeric Tolerance**: `assert.ok(Math.abs(sig.kelly - 0.5715) < 1e-3)`

## C++ tests

```bash
npm run test:core
```
This seeds the required fixture, builds the Release native target, and runs every executable registered
with CTest. Read the emitted discovery/pass/fail counts rather than relying on a stale hard-coded total.

## Hygiene check

```bash
npm run hygiene
```
runs `scripts/dev/check_hygiene.js`, which checks five categories: **Git Noise** (tracked artifacts that
should be ignored), **Symlinks** (broken links, submodule drift), **Agent Skills** (stale skill folders),
**Code Markers** (lingering TODO/FIXME/"dev review" comments), **Docs Alignment** (presence of the
workspace truth files). This is a fast, deterministic pass-worth-running before claiming any session's
work is done.

## Labs

**Lab 1 — reproduce the jest gotcha yourself.**
```bash
npx jest tests/scripts/lib/alpaca_bot_cycle.test.js
```
vs
```bash
node --test tests/scripts/lib/alpaca_bot_cycle.test.js
```
Compare the two outputs. Now you'll recognize this failure mode instantly if you hit it again.

**Lab 2 — run the real full suite and read the summary line, not just "passed."**
```bash
npm test
```
What are the exact tests/pass/fail/skip counts? Open `workspace/STATE.md`'s most recent session entry
and compare — does it match what you just ran, or has something changed since the last recorded number?

**Lab 3 — find a real pure-function test and explain why it needs no mocks.** Open
`tests/scripts/lib/alpaca_bot_cycle.test.js` and find the tests for `buildExitOutcome`. Why can these run
with zero I/O, no spawned process, no fake broker — and what does that tell you about which parts of
`alpaca_bot_cycle.js` are *not* covered by these specific tests (module 04 names the function that still
has a gap here)?

**Lab 4 — run hygiene and read every category.**
```bash
npm run hygiene
```
If anything fails, that's real signal — read the specific finding rather than just noting pass/fail.
