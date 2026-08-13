# Next Session Goal

## 2026-08-09 Activate the cleanup-first documentation loop

1. **User activates the refined loop**:
   - Start with the baseline/classification batch; do not begin by generating random pages.
   - Preserve `docs/` as durable engineering knowledge and `workspace/` as operational state/evidence.
   - Do not use subagents unless the user explicitly changes that rule.

2. **Freeze the measured baseline**:
   - `docs/`: 115 Markdown files / 12,636 lines; 20 docs Markdown paths manifest-registered; 95 unclassified.
   - `workspace/`: 169 Markdown files / 29,667 lines; root, plans, and handoffs own 82.0% of lines; 15 non-control root files.
   - Classify the 11 raw link findings before changing them; distinguish current defects, historical paths, and parser false positives.
   - Treat duplicate names and mirrors as candidates only; none are byte-identical deletion proof.

3. **Establish the loop contract before scheduling**:
   - Proposed canonical root: `docs/sections/<domain>/<section-id>/`.
   - Use reproducible entropy-weighted selection from clean tracked production files.
   - Exclude generated/vendor/test paths, current dirty files, already-covered owners, and all open P0/P1 surfaces.
   - Limit each iteration to one section, five files, and 800 net lines; create only applicable files.
   - Reconcile existing owners before adding prose; stop on overlap, missing focused tests, required deletion approval, or any failed gate.

4. **Run one reviewed pilot before enabling recurrence**:
   - Record candidate scores, seed, selected source, ownership map, existing docs, and exclusions.
   - Produce or update one non-overlapping domain section.
   - Run documentation audit, focused source tests, structure, hygiene, link validation, and diff check.
   - Review net documentation growth and overlap before scheduling further iterations.

5. **Keep existing P1 blockers visible**:
   - BT-L10-1: comparable cross-dataset sweep selection remains unresolved.
   - BT-L10-2: durable clean-tree test-integrity scope remains unresolved.
   - The loop must not select or edit their sweep/native/test-integrity surfaces.

6. **Open proof boundaries**:
   - The accumulated current state is sealed on the `checkpoint/2026-08-09-current-state` branch as source/test checkpoint evidence; BT-L10-1/2 remain open and block release interpretation.
   - CI, committed archive, provider, host, deployment, recovery, soak, paper, and live qualification remain open.

Immediate next action:
- Restore exact hpdesk Git provenance before any Paper service cutover: hpdesk now has deploy-key read access and a clean host-local rsync-snapshot checkpoint `3c3ca65a`, while published source is `origin/checkpoint/2026-08-09-current-state` at `2e036889`. Reconcile the two histories without overwriting `.env*`, `storage/`, or `workspace/`; then use the exact-image/rollback path and run one redacted `doctor alpaca --paper-auth` provider read to attribute the Paper HTTP 401.
- Do not start the recurring intraday bot: every registered strategy still resolves to `1d`; require an approved, source/backtest-supported 5m/15m strategy contract first.
- The documentation loop remains deferred until the host/Paper diagnostic boundary is resolved or explicitly reprioritized.

## 2026-08-11 Session Closeout — hpdesk snapshot and Paper-auth recovery

1. Local reviewed source/test checkpoint `2e036889` is published to `origin/checkpoint/2026-08-09-current-state`. Its diagnostics and bounded Paper controls pass local focused/structure/integrity/hygiene/manifest/canonical Node gates.
2. hpdesk has a clean local branch `checkpoint/2026-08-11-hpdesk-rsync` at `3c3ca65a`; its 135 transferred non-workspace paths match the published checkpoint’s source/config/test scope, including the Paper diagnostic and intraday policy SHA-256 hashes. It is host-local rsync-snapshot evidence—not exact published ancestry or an image deployment.
3. hpdesk now authenticates read-only to GitHub using its dedicated deploy key. Next session must fetch/compare/reconcile the published checkpoint deliberately; do not reset host `main`, overwrite owner-only env/runtime state, or use broad rsync again.
4. The running `docker-bot-alpaca-paper-1` remains unchanged on `personal_finance:latest`; no image build, restart, Paper provider diagnostic, or new order followed snapshot commit. The two earlier authorized AAPL `$25` Paper attempts failed before order creation on a quote HTTP 401.
5. After exact provenance is re-established, run exactly one Paper-only redacted raw `/v2/account` vs SDK `getAccount()` diagnostic. Branch on result: dual rejection -> account/credential/provider handoff; raw accept/SDK reject -> source fix; outage/rate limit -> availability classification. Only retry the explicitly authorized AAPL order after an accepted Paper preflight.

## 2026-08-13 Next Session Goal — Security and remote product foundations

1. Start with `blast-through` in exactly one security/connective-tissue mode over the strategy data-readiness path and the artifact-only delayed public data boundary. Produce confirmed findings and a decision-complete B1 implementation plan before edits.
2. Treat B1 as P1: strategy catalog, CLI, API, dashboard, backtest, automation, promotion, Paper, and execution must fail closed when declared cached timeframes are missing, stale, insufficient, grain-suspect, or forbidden-derived. Distinguish data-unavailable rejection from a valid zero-trade result. hpdesk repair remains a manual owner-only action followed by readiness recheck.
3. Remote product boundary is fixed for initial work: free verified viewers get sanitized 24-hour delayed market/universe/freshness and aggregate-research artifacts only; no public live hpdesk queries, provider calls, compute, bot/account/portfolio/host access, credentials, or execution. Publication is blocked pending provider redistribution-rights review.
4. Artifact model is fixed: restricted non-execution hpdesk publisher; immutable schema-allowlisted signed/hashed artifact; atomic publish, expiry/retention, rollback, kill switch, and fail-closed unavailable state. Public routes must never fall through to live data.
5. Local all-in-one Linux/Windows package keeps every user’s providers, credentials, and bots local. Paper activation is a separate local wizard with owner-only storage, redacted read-only Paper account preflight, no-live default, and final explicit confirmation.
6. Cloudflare is deferred until source/API hardening, provider rights review, and staging proof; tunnel only to private origin and do not modify localhost behavior. Multi-tenant remote credentials/bots are separately deferred; current host global env and singleton state are not suitable.

Authoritative detailed plan: `/home/vgbn1/.claude/plans/dazzling-giggling-moler.md`.

Immediate closeout boundary:
- No CI, exact-image deployment, provider recovery, Paper fill, live execution, restart/rollback, or soak qualification has been achieved.
- Local continuity records are uncommitted session closeout files and intentionally remain separate from published functional source.

## 2026-08-13 Maintainer onboarding follow-up

1. Replace the deliberate `@..._HANDLE` placeholders in `MAINTAINERS.md` and `.github/CODEOWNERS` with verified GitHub users or teams; replace the `OWNER/REPOSITORY` issue-template URLs.
2. A repository administrator must enable GitHub private vulnerability reporting before treating `SECURITY.md` as an active confidential-reporting channel.
3. After real owners exist, configure protected `main`, PRs, at least one approval, sensitive-path CODEOWNERS review, the existing required checks, force-push/deletion protection, and a merge policy as documented in `GOVERNANCE.md`. Do not enable CODEOWNERS enforcement while placeholders remain.
4. This onboarding work does not grant provider credentials, host access, deployment control, CI administration, canonical-data write authority, or Paper/live execution authorization. Those remain separate core-maintainer and operator-controlled boundaries.

Immediate next action:
- Supply the initial GitHub handles and repository owner/name, then perform the administrator-only GitHub settings steps above. Until then, the new governance documents and templates are ready for source collaboration but the placeholder ownership/security links are intentionally non-operational.


## 2026-08-10 Post-closure follow-up

1. Confirm the requested checkpoint commit and push are visible on the intended remote branch.
2. Treat BT-L10-1 and BT-L10-2 as closed for source/test and indexed clean-archive evidence; do not imply CI, provider, host, deployment, recovery, or soak qualification.
3. Resume the refined cleanup-first documentation loop only after the committed checkpoint is confirmed; Batch 0 baseline/classification is complete, and the existing `docs/sections/` batch is now part of the sealed worktree rather than a fresh pilot candidate.
4. Keep current runtime, provider, data-write, paper/live, deployment, and credential boundaries unchanged.
