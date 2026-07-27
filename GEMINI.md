# Gemini CLI Compatibility

Use `skills/session-orchestrator/SKILL.md` as the only boot, routing, and closeout workflow.

- Route audits to `blast-through`, feature use/testing to `feature-exerciser`, bounded implementation to `codex`, and broad approved batches to `mass-implement`.
- Prefer current manifests, code, fixtures, and empirical evidence over hardcoded assumptions.
- Preserve unrelated changes and use targeted reads before edits.
- Never hardcode outputs merely to pass tests.
- Delegate only when the user or governing instructions authorize it.
- Use recoverable, non-destructive repair steps; do not run Git restore/reset operations without clear authorization and resolved targets.

`workspace/STATE.md` remains the current project-direction truth.
