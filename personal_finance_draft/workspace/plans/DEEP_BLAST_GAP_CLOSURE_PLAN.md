# Deep Blast Gap Closure Plan - 2026-06-11

## Objective

Make the repository reproducible from a clean checkout, then close the remaining product and
workflow gaps in dependency order. The first implementation pass should not broaden into feature
work. It should prove that tracked code, tracked tests, tracked docs, and tracked verification
scripts are self-contained.

Research basis:

- `npm.cmd test` is green locally, but tracked tests and docs depend on untracked or ignored files.
- Native C++ builds locally, but `backend/core/CMakeLists.txt` and `backend/core/src/main.cpp`
  reference untracked frame-backtester source files.
- `tests/scripts/notebooks_contract.test.js` requires `.ipynb` files that `.gitignore` excludes.
- `notebooks/signal_library.json` is runtime input for `scripts/strategies/rsi_reversal_signal.js`;
  it is not the same class of artifact as heavyweight local notebooks.
- `.dockerignore`, repo proof scripts, and an API contract test are untracked despite being cited
  by repo-truth files.
- `.agents/skills` contains many advertised skill directories without `SKILL.md`; the tracked
  `skills/` subset is much smaller.
- Provider stubs and C++ ML review comments remain real quality gaps, but they should not block
  the clean-clone repair.

## Decision Matrix

| Gap | Decision | Rationale |
|---|---|---|
| `backend/core/src/backtest/frame_backtester.cpp` and `.hpp` | Track now | They are directly referenced by tracked CMake and `main.cpp`; omitting them breaks clean native builds. |
| `scripts/classify_strategy_assets.js` | Track now | A tracked test executes it. It is source/proof tooling, not generated output. |
| `scripts/mcp_stdio_probe.js` | Track now | Workspace ledgers cite it as the MCP proof command; it is small and deterministic. |
| `backend/api/tests/correlation_contract.test.js` | Track and wire into `test:api` or `test:contracts` | Current evidence depends on it, but package scripts do not run it by default. |
| `.dockerignore` | Track now | It keeps secrets, cache, notebooks, workspace state, and generated data out of Docker context. |
| `notebooks/*.ipynb` | Keep ignored | The notebooks are local research artifacts, including one large file. Tracking them is the wrong fix for a test-contract problem. |
| `notebooks/signal_library.json` | Track or move to a tracked strategy fixture path | It is live strategy input. Clean clone must either include it or the RSI strategy must have a tracked fallback fixture. |
| `notebooks/notebook_utils.py` and `notebooks/research/rsi_reversal.py` | Track if notebook/research provenance remains in repo scope | They are source/provenance files, unlike `.ipynb` execution artifacts. |
| `tests/scripts/notebooks_contract.test.js` | Rewrite | It should validate tracked templates/fixtures or generated notebook contracts, not require ignored local notebooks. |
| `scripts/ml/train.py` and `scripts/ml/verify_parity.py` | Track if ONNX binaries remain committed | These are provenance and parity source for the committed ML runtime path. |
| `storage/data/ml`, `storage/data/paper_trading`, `storage/data/polymarket_history` | Ignore generated state, use fixtures for tests | These are run outputs, local ledger state, and fetched market history. Do not bulk commit. |
| Missing repo skills in `.agents/skills` | Canonicalize, do not bulk restore empty dirs | Update docs to point at live tracked skills, or create only the few protocol skills that are actually required. |
| Provider stubs | Separate product phase | They require provider-specific contracts and possible network/API decisions; do after reproducibility. |
| Docker ONNX flag | Verify before committing Dockerfile behavior | Keep `.dockerignore` independent; Dockerfile runtime behavior needs container proof. |
| C++ ML `dev review` comments | Separate cleanup phase | They are quality debt, not reproducibility blockers. |

## Phase 1 - Clean-Clone Reproducibility

Goal: a fresh checkout has every file that tracked source, tests, docs, and proof commands require.

Tasks:

- Promote the load-bearing files:
  - `.dockerignore`
  - `backend/core/src/backtest/frame_backtester.cpp`
  - `backend/core/src/backtest/frame_backtester.hpp`
  - `scripts/classify_strategy_assets.js`
  - `scripts/mcp_stdio_probe.js`
  - `backend/api/tests/correlation_contract.test.js`
- Wire `backend/api/tests/correlation_contract.test.js` into one default gate:
  - Preferred: add it to `test:api`.
  - Acceptable: add it to `test:contracts` if the intent is contract-only coverage.
- Extend `tests/scripts/structure_contract.test.js` with targeted guardrails:
  - CMake source entries under `backend/core/src` must exist and be tracked.
  - Known proof scripts cited by workspace ledgers must be tracked.
  - Default package test scripts must include the API correlation contract.
  - Generated state paths remain ignored and untracked.
- Add `.gitignore` entries for generated local state:
  - `storage/data/ml/`
  - `storage/data/paper_trading/`
  - `storage/data/polymarket_history/`
  - `__pycache__/`

Verification:

```powershell
git ls-files --error-unmatch .dockerignore backend/core/src/backtest/frame_backtester.cpp backend/core/src/backtest/frame_backtester.hpp scripts/classify_strategy_assets.js scripts/mcp_stdio_probe.js backend/api/tests/correlation_contract.test.js
npm.cmd run test:structure
npm.cmd run test:api
npm.cmd test
```

Native verification on this Windows shell should use the duplicate `Path`/`PATH` workaround:

```powershell
$pathValue = [Environment]::GetEnvironmentVariable('Path', 'Process')
if (-not $pathValue) { $pathValue = [Environment]::GetEnvironmentVariable('PATH', 'Process') }
[Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
[Environment]::SetEnvironmentVariable('Path', $pathValue, 'Process')
cmake --build backend\core\build --config Release --target sovereign_wealth
```

Definition of done:

- `npm.cmd test` remains green.
- Native C++ target builds without relying on untracked source.
- `git status --short` no longer shows load-bearing source/proof files as untracked.
- `git check-ignore --no-index storage\data\ml storage\data\paper_trading storage\data\polymarket_history notebooks\backtest_analysis.ipynb` succeeds for local-only artifacts.

## Phase 2 - Notebook and Research Contract Repair

Goal: keep research outputs local while making the strategy/research contract reproducible.

Tasks:

- Rewrite `tests/scripts/notebooks_contract.test.js` so it validates tracked contract inputs:
  - Option A, preferred: use compact tracked notebook fixture JSON under `tests/fixtures/notebooks/`.
  - Option B: use a tracked manifest such as `tests/fixtures/notebooks/research_ladder_contract.json`.
  - Avoid requiring `notebooks/*.ipynb` in the default suite.
- Promote the RSI strategy runtime input:
  - Track `notebooks/signal_library.json`, or move it to `config/strategies/signal_library.json`
    and update `scripts/strategies/rsi_reversal_signal.js`.
  - If moved, leave a compatibility read path for the old notebook location only as a fallback.
- Promote provenance source if the repo wants RSI research to be explainable:
  - `notebooks/research/rsi_reversal.py`
  - `notebooks/notebook_utils.py`
- If `scripts/dev/refine_notebooks.js` remains, make it generate or refine notebooks from tracked
  templates rather than assuming ignored local notebooks exist.

Verification:

```powershell
node --test tests/scripts/notebooks_contract.test.js
node -e "const s=require('./scripts/strategies/rsi_reversal_signal.js'); console.log(Object.keys(s).sort().join(','));"
npm.cmd test
```

Definition of done:

- Default tests pass in a clone with no `notebooks/*.ipynb`.
- RSI strategy bridge can load its documented signal library from tracked repo content.
- `.ipynb` files remain ignored unless there is an explicit product decision to version notebooks.

## Phase 3 - Repo Protocol and Skill Truth

Goal: make agent bootstrap instructions truthful and portable.

Tasks:

- Pick one canonical skill/protocol location:
  - Preferred: tracked `skills/` for portable repo skills.
  - Keep `.agents/` as local agent state because `.gitignore` already treats it that way.
- Fix instruction drift:
  - `GEMINI.md` should not point to missing `.codex/skills/repo-global-protocol/SKILL.md`.
  - `AGENTS.md` should list only loadable skills or tracked repo protocol files.
  - `docs/operational/bootstrap.md` should not require absent `.gemini/skills/all-skills-loader/SKILL.md`.
- Create only the minimal protocol skills that are actually used:
  - `skills/repo-global-protocol/SKILL.md`
  - `skills/session-orchestrator/SKILL.md`
  - `skills/rigorous-feature-testing/SKILL.md`
  - Optional later: `skills/multi-agent-research/SKILL.md` if subagent routing becomes real.
- Each protocol skill should be short and point to repo truth:
  - `workspace/STATE.md`
  - `workspace/HANDOFF.md`
  - `workspace/SESSION_MEMORY.md`
  - `docs/engineering/codebase_org.md`
  - `graphify-out/GRAPH_REPORT.md` when present

Verification:

```powershell
Test-Path skills\repo-global-protocol\SKILL.md
Test-Path skills\session-orchestrator\SKILL.md
Test-Path skills\rigorous-feature-testing\SKILL.md
Select-String -Path AGENTS.md,GEMINI.md,docs\operational\bootstrap.md -Pattern '\.codex/skills/repo-global-protocol|\.gemini/skills/all-skills-loader'
```

Definition of done:

- Bootstrap docs no longer advertise absent paths.
- The skills that AGENTS-style instructions require are actually loadable from tracked files.
- Empty `.agents/skills/*` directories are not treated as repo truth.

## Phase 4 - Docker and ONNX Container Verification

Goal: prove the container path before accepting the Dockerfile ONNX behavior change.

Tasks:

- Track `.dockerignore` in Phase 1 regardless of Docker daemon availability.
- Keep `infra/docker/Dockerfile` ONNX behavior uncommitted until the container build proves:
  - C++ build succeeds inside the image.
  - ONNX runtime is present.
  - `ml compare` can run in-container against the committed model assets.
- If Docker Desktop remains unavailable, document the exact blocked command and leave the Dockerfile
  change as a carryover rather than marking it verified.

Verification after Docker is available:

```powershell
docker compose -f infra\docker\docker-compose.yml build
docker compose -f infra\docker\docker-compose.yml up -d
docker compose -f infra\docker\docker-compose.yml ps
```

Add the project-specific in-container `ml compare` command once the service name and binary path
are confirmed from the compose file.

Definition of done:

- Docker build context excludes local secrets/generated state.
- ONNX-enabled image builds and runs.
- Container proof is written back to `workspace/DEV_REVIEW.md` and `workspace/STATE.md`.

## Phase 5 - Provider and Data Product Gaps

Goal: convert wired-but-empty provider seams into tested ingestion behavior without weakening the
current no-spend gates.

Implementation order:

1. ECB FX provider.
2. SP Global PMI provider.
3. SEC holdings provider.
4. Blockchair provider.
5. OpenSky provider.
6. TradingView screener search, only if the dependency supports a stable no-auth query path.

Tasks per provider:

- Add fetch/extract code behind the existing registry entry.
- Add a fixture-backed parser test that does not need live network.
- Add one no-spend integration check that proves the registry can call the provider seam.
- Keep raw provider payload and normalized row contracts separate.
- Preserve `backend integrity --json` versus `status --json` semantics.

Verification:

```powershell
npm.cmd run test:macro
npm.cmd run test:data
node backend\cli\sovereign_cli.js status --json
node backend\cli\sovereign_cli.js backend integrity --json
```

Definition of done:

- Provider no longer returns a silent empty object unless the upstream response is actually empty.
- Parser tests cover both happy path and malformed payload path.
- Ingestion failures are visible in `errors` or provider diagnostics, not swallowed as success.

## Phase 6 - C++ ML Cleanliness

Goal: remove unresolved review notes from active ML code and keep train/serve parity auditable.

Tasks:

- Resolve `dev review` comments in:
  - `backend/core/src/ml/cnn_inference.cpp`
  - `backend/core/src/ml/model_registry.cpp`
  - `backend/core/src/ml/onnx_model.cpp`
- Promote `scripts/ml/train.py` and `scripts/ml/verify_parity.py` if committed ONNX assets remain
  part of the repo.
- Add or document the parity gate that compares Python ONNX output to C++ `ml compare`.

Verification:

```powershell
node --check backend/cli/sovereign_cli.js
npm.cmd test
cmake --build backend\core\build --config Release --target sovereign_wealth
```

Definition of done:

- Active C++ ML code has decisions instead of unresolved review comments.
- ML model provenance and parity commands are tracked or explicitly documented as external.

## Final Clean-Clone Gate

Run this only after Phases 1 and 2 are implemented and staged or committed.

Preferred after commit:

```powershell
git worktree add C:\tmp\sovereign-clean-check HEAD
Set-Location C:\tmp\sovereign-clean-check
npm.cmd test
npm.cmd run test:api
npm.cmd run test:structure
cmake --build backend\core\build --config Release --target sovereign_wealth
```

If build artifacts are not present in the clean worktree, run the documented configure/bootstrap
step first, then rerun the target build. Do not mark the gap closed until the verification runs from
tracked repository content only.

## Recommended Commit Split

1. `repo: track clean-clone source and proof assets`
2. `test: harden structure and notebook contracts`
3. `docs: repair repo protocol and skill truth`
4. `infra: verify docker ONNX runtime`
5. `data: implement provider extraction contracts`
6. `ml: resolve C++ review notes and parity provenance`

The first two commits should be treated as the next implementation target. Later commits depend on
their proof gates and should not be mixed into the clean-clone repair.
