# Bootstrap

Read this first, every session, before `HANDOFF.md`. `session-orchestrator` already tries to read this
file first on every boot — it just never existed until 2026-06-25 (session 59), which is exactly why
the `docs/` library below kept falling out of session context across ~50+ prior sessions.

## The docs/ library exists — read docs/README.md, but with two corrections

`docs/README.md` is the documentation hub (folder map, architecture, ops guides, research notes). It is
**not** part of the normal boot sequence (`workspace/*.md` only) and gets forgotten every session as a
result. Read it. But as of the 2026-06-25 triage, two things in it are wrong:

1. **17 of its own links are broken.** Every `docs/operational/*.md` link points at files that moved into
   subfolders at some point: the real paths are `docs/operational/guides/*.md`,
   `docs/operational/roadmap/*.md`, and `docs/operational/local_first/*.md`. The hub itself was never
   updated after the move.
2. **Two of its "Canonical" picks are stale enough to mislead, not just out of date:**
   - `docs/engineering/architecture_overview.md` (header says "2026-05-14") describes live broker
     execution as `*Planned*` and says "build configuration does not yet compile the trading modules."
     Both are now false — live order placement across Alpaca/Polymarket/MT5 is real, tested, and has had
     multiple security/safety review passes (see `workspace/DEV_REVIEW.md`); the C++ core builds 30 real
     test executables via CMake/ctest.
   - `docs/engineering/capability_manifest.md` describes a flat `backend/cli/commands/*.js` layout and
     `data/market_data.db` / SQLite trade-log artifacts. The real layout is domain-subfoldered
     (`backend/cli/commands/trade/trade.js`, `backend/api/server/routes/market/sigma_band.js`, etc.) and
     the real data plane is `storage/data/ts/` (a binary ts-index format) — `data/` is legacy/compat only.
   - Everything else sampled in the 2026-06-25 triage (`codebase_org.md`, `tui_feature_map.md`, `web_api.md`)
     was structurally accurate, just missing ~2 weeks of feature churn at the detail level. Treat
     `workspace/STATE.md` as the tiebreaker whenever a `docs/engineering/*` claim and current code disagree.

`docs/guide/` (the 24-chapter, ~5,000-line "build it from scratch" book) is a **different genre** —
generic teaching content with placeholder filenames (`adapter_a.js`, `--paper` flag that doesn't actually
exist), not a description of this repo's current real code. Useful for *why a pattern like a gateway
exists*, not for *what `index.ts` does on line 480 today*.

## For "what does the real code actually do right now"

`docs/codebase_tour/` (added 2026-06-25, session 59) is the hands-on layer the triage above found
missing: short modules with real file:line citations and lab exercises (read this real file, trace this
real order through N real files, run this real command and interpret the real output) tracing the
CURRENT code. Start at `docs/codebase_tour/00_START_HERE.md`.

## Standing facts worth not re-deriving every session

- Test runner is `node --test` via `node tests/run_node_tests.js` (`npm test`), **not** `npx jest` — jest
  mis-parses these test files and reports false failures.
- The Ink dashboard (`sovereign_dashboard.mjs`) has its **own inline** menu model (`M`), separate from
  `tui/manifest.js` (used only by the older `runInteractiveMenu` engine). Editing the wrong one is a
  silent no-op — a repeated historical bug class.
- `workspace/STATE.md`'s `## Current Phase` is the live source of truth for project direction, not any
  static doc.

## 2026-08-09 correction — workspace is operations, docs is engineering knowledge

The dated corrections and standing facts above are preserved as historical boot evidence. Do not extend this file
with new module explanations, algorithms, equations, structures, protocols, or code topology.

- Use `workspace/workspace_manifest.json` for the operational tree contract.
- Use `docs/README.md` and `docs/documentation_manifest.json` for durable engineering knowledge.
- Use `docs/modules/` for current capability ownership and `docs/atlas/` for deep mechanisms.
- Mine workspace facts through `workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md`; verify them against
  source and tests before promotion, then link the canonical docs instead of copying the explanation here.
