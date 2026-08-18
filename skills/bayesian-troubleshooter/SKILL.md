---
name: bayesian-troubleshooter
description: Perform hierarchical Bayesian fault isolation, hypothesis-driven What-If risk prediction, and A/B differential divergence tracing across single and multi-repository codebases. Use for output problems, unexpected results, zero-trade anomalies, pipeline dropouts, and root-cause line attribution; do not use for feature implementation or routine audits.
---

# Bayesian Troubleshooter

Diagnostic and root-cause isolation only. Report confirmed findings with fault-domain attributions and route approved fixes to `codex`, `refactor-readability`, or `mass-implement`.

## Core Diagnostic Philosophy

When an output anomaly or system defect occurs, avoid brute-force trial and error. Apply **Optimal Binary Probing** (choosing diagnostic tests that maximize entropy reduction and bisect the hypothesis space) alongside **Hypothesis-Driven "What-If" Risk Prediction** and **A/B Differential Isolation**.

```
[System Anomaly / Output Failure / Unexpected Zero Result]
       │
       ├── 0. Fault Domain Classification
       │      ├── external_provider (API 401/429/400, remote schema mismatch, network outage)
       │      ├── environment_or_sandbox (OS perms, missing binary, node/compiler version)
       │      ├── operator_config_or_credentials (YAML overrides, missing env vars, flag conflicts)
       │      └── our_source (Logic defect, silent fallbacks, type drift, unhandled edge cases)
       │
       ├── 1. Multi-Repo, Web-Doc & Cross-Boundary Preflight
       │      ├── Inspect root paths, submodules, client/server interfaces, shared schemas
       │      ├── Execute targeted web documentation searches for dense API/framework technical specs when encountering external provider or library errors
       │      └── Map dependencies before executing diagnostic probes
       │
       ├── 2. Hypothesis-Driven "What-If" Trial & Error (With Mutation Shielding)
       │      ├── Formulate explicit hypothesis: "If I run Option X, I expect Result Y"
       │      ├── Screen for hidden bugs: "Will this cause side-effects, cache corruption, or silent fallbacks?"
       │      └── Execute probe with mutation shielding (--dry-run, sample mode, or isolated $CLAUDE_JOB_DIR/tmp)
       │
       ├── 3. Optimal Binary Probing (Maximum Entropy Reduction)
       │      ├── Probe A: Sample/Fixture Mode vs Real Data (Isolates math/rendering from disk cache)
       │      ├── Probe B: Engine Bifurcation (JS vs C++/Python implementation drift)
       │      └── Probe C: Config Overrides vs CLI Flags (Discovers hidden precedence rules)
       │
       ├── 4. A/B Differential Divergence Tracing
       │      └── Compare intermediate outputs (Config -> Dataset -> Model -> Signal -> Output)
       │          between Known-Good (Reference) and Target (Anomaly) executions
       │
       └── 5. Hierarchical Line-Level Drill Down
              ├── Level 1: Feature / Flag / Config Precedence
              ├── Level 2: Model / Predictor Output Distributions
              ├── Level 3: Module / File Interface Contracts
              ├── Level 4: Function / Control Flow Branching
              └── Level 5: Line & Causal Mechanism Attribution
```

---

## 1. Fault Domain Classification Matrix & Web Documentation Protocol

When external provider or framework anomalies occur (e.g., HTTP 400 Bad Request, 401 Unauthorized, rate limits, schema drift):
- **Documentation-First Web Search**: Execute targeted search queries focusing on official technical documentation first (e.g., `"polymarket clob api orderbook"`, `"alpaca paper v2 api authentication"`). Official documentation provides the highest density of authoritative contract specifications, parameter constraints, and required headers.
- **Key Terms**: Extract specific endpoint URLs, status codes, and error payloads for exact query string formulation.

Trace every candidate defect to exactly one fault domain before attempting line-level attribution:

- `our_source`: Logical bug, unhandled edge case, calculation flaw, or silent fallback in repository source code.
- `operator_config_or_credentials`: Overriding YAML setting, missing environment variable, or invalid CLI flag combination.
- `external_provider`: Upstream API authentication rejection (401/429), remote schema mismatch, or external service outage.
- `environment_or_sandbox`: Node/compiler version incompatibility, container sandbox limit, or file permission restriction.
- `shared_or_mixed`: Multiple proved causes across boundaries (must document both).
- `unresolved`: Evidence cannot yet distinguish domain; name the exact binary check required to resolve it.

---

## 2. Hypothesis-Driven "What-If" Trial & Error Protocol

Before running any diagnostic command or code probe, state:

1. **Hypothesis**: *"If I execute Option X, I expect diagnostic output Y."*
2. **Output Inspection**: *"Will this command print explicit diagnostic evidence to stdout/stderr?"*
3. **Hidden Bug & Side-Effect Screen**: *"Could this action corrupt persistent caches, overwrite storage, mutate state, or swallow errors via silent fallbacks?"*
4. **Mutation Shielding**: Always use non-mutating flags (`--dry-run`, `--sample`, `--no-write`), temporary isolated output paths (`$CLAUDE_JOB_DIR/tmp`), or clean read-only fixtures.

---

## 3. Optimal Binary Probing (Entropy Reduction)

Order diagnostic checks to eliminate ~50% of the remaining hypothesis space per probe:

- **Probe A (Sample vs Real Data)**: Run with deterministic generated sample data (e.g. `bt --sample`).
  - *If Sample Passes*: Engine math, data structures, and output renderers are 100% sound. The fault lies in local disk cache, historical timestamps, or indicator thresholds.
  - *If Sample Fails*: Engine logic, rendering pipeline, or core calculations are directly broken.
- **Probe B (Engine Bifurcation)**: Compare JS execution vs native engine execution (e.g. `--engine js` vs `--engine auto`).
  - Pinpoints implementation drift between high-level wrapper and fast-path native core.
- **Probe C (Config vs CLI Override)**: Check if a configuration file (e.g. strategy YAML `universe: [SPY, QQQ]`) silently overrides user CLI inputs (`--symbols AAPL,MSFT`).

---

## 4. A/B Differential Isolation (Divergence Tracing)

When an output is wrong or zero, compare intermediate state between a **Known-Good Reference** (e.g. sample mode or single-asset baseline) and the **Target Execution**:

1. **Stage 1 (Config Load)**: Compare parsed options & universe arrays.
2. **Stage 2 (Data Series)**: Compare candle record counts, timeframes, and freshness metadata.
3. **Stage 3 (Feature Calculation)**: Compare rolling indicator frames and finite value bounds.
4. **Stage 4 (Model Prediction)**: Compare confidence score distribution against entry thresholds.
5. **Stage 5 (Trade / Signal Execution)**: Compare position sizing, holding periods, and trade loop increments.

Identify the exact stage where the Target Execution output diverges from the Known-Good Reference.

---

## 5. Common Edge Case Matrix

Scan for these high-frequency edge cases during drill-down:

| Edge Case Category | Common Manifestation | Diagnostic Probing Rule |
| :--- | :--- | :--- |
| **Silent Fallback Trap** | Catch block returns default empty array or 0 trades without logging errors. | Check try/catch blocks for swallowed errors; inspect `error_code` or `warnings`. |
| **Config Precedence** | Strategy YAML hardcodes universe/model, ignoring CLI flags. | Inspect strategy YAML parser and option merging logic (`inspectStrategyFile`). |
| **Threshold Range** | Model outputs confidence ~0.50 while strategy requires >= 0.65 threshold. | Inspect model `predict()` confidence distribution across historical bars. |
| **Loop Advancement** | Trade loop increments `i += horizon` instead of `i++` on uncrossed entries. | Trace trade loop counter increment logic in backtest loop. |
| **Stale Cache / Shadowing** | Binary `.bin` or JSON cache contains old bars; fresh code reads old binary. | Check file modification timestamps (`mtimeMs`) and run data integrity sweep. |
| **Path Slippage** | Relative paths resolve differently depending on caller `cwd`. | Verify absolute path resolution (`path.resolve`, `STORAGE_DATA_DIR`). |

---

## Output Contract

Report:
1. **Fault Domain Attribution**: `failing_boundary`, `fault_domain`, `repair_owner`, `causal_mechanism`, `stub_involvement`.
2. **Binary Probe Trail**: Probes executed, hypotheses tested, outputs observed, and risk screens applied.
3. **A/B Divergence Trace**: Stage at which target execution diverged from reference.
4. **Line-Level Root Cause**: Exact file, function, and line number responsible for the defect.
5. **Structured Remediation Handoff**: Target functional skill (`codex`, `refactor-readability`, `mass-implement`) and acceptance criteria.
6. **Anti-Recurrence Note**: Summary of the failure signature to be logged in session memory.

---

## Truthfulness And Test Integrity

- Context is bounded. Build a task-local architecture map and disclose material surfaces not read or verified.
- Never claim a file was read, command ran, test passed, host was checked, or behavior was proved without direct evidence. Keep source, test, clean-install, CI, host, deployment, recovery, soak, paper, and live proof distinct.
- Do not weaken, skip, delete, mock away, suppress, or rewrite tests merely to make a result pass.
- Change a stale test only with canonical contract or approved behavior evidence; report the before/after expectation and keep production, tests, and docs aligned.
