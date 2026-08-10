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
- User activates the refined cleanup-first documentation loop; execute Batch 0 baseline/classification only, then present the pilot candidate and GO/NO-GO boundary before writing a new section.


## 2026-08-10 Post-closure follow-up

1. Confirm the requested checkpoint commit and push are visible on the intended remote branch.
2. Treat BT-L10-1 and BT-L10-2 as closed for source/test and indexed clean-archive evidence; do not imply CI, provider, host, deployment, recovery, or soak qualification.
3. Resume the refined cleanup-first documentation loop only after the committed checkpoint is confirmed; Batch 0 baseline/classification is complete, and the existing `docs/sections/` batch is now part of the sealed worktree rather than a fresh pilot candidate.
4. Keep current runtime, provider, data-write, paper/live, deployment, and credential boundaries unchanged.
