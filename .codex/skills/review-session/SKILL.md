---
name: review-session
description: Low-coding, high-token session mode for reviewing code, optimizing hotspots, security auditing, and checking repo health without heavy implementation work.
---

# Blast Through

Use this skill when the user wants to spend the session mostly on review, optimization, security audit, reflection, planning, or exploration rather than writing much code.

## Session Mode

- Prefer analysis, review, and structured thinking.
- Keep implementation minimal unless a small fix is clearly needed to support the review.
- Spend time on reading, comparison, and identifying risks or next steps.
- Include optimization and security passes when the repo state makes them useful.
- Use a lightweight model to fetch context through graphify when that is enough for the task.
- Use stronger review context at the end if the session produces a change set.
- Maintain a boot-time safe-file checklist or registry for stable, previously reviewed files so repeated sessions can skip re-reading them unless the user asks, the file changes, or the task touches that area.
- For system-hardening passes, explicitly review architecture seams, data wiring, provider configuration, cache freshness, error propagation, and verification commands so the system is "waterproof" against silent data gaps.
- **Anti-Bullshit Mandate**: Actively identify and flag hardcoded test values, forged JSON snapshots, or "Fairytale" data. Enforcement of real-world fixtures and historical slices is mandatory.
- **Isolated Validation**: Verify that testing logic is isolated in the mirrored `/test` directory. No internal state sharing between tests and production source.
- **Empirical Visibility**: Ensure every data transformation emits `[VISIBILITY]` logs. Transformation logic without visible sampling is considered a "Black Box" risk.
- Bad data is worse than no data. If freshness, integrity, or provenance is uncertain, fail closed and mark the path degraded instead of letting questionable records drive review, backtests, or optimization.

## What To Do

1. Read the current prompt and the repo state files.
2. Identify the session goal and the smallest useful review objective.
3. Review code, docs, tests, config, and handoff notes for gaps, risk, and optimization opportunities, but trust the safe-file checklist first for stable files.
4. Trace critical data paths from config to provider call to normalization to cache/report/UI, and flag any mismatch between docs, commands, folder names, runtime output, and actual files.
   If the data is suspect, stop at the seam and label it degraded rather than promoting it downstream.
5. Capture findings, open questions, and next ideas in the repo memory files.
6. If the user asks for a code review, use findings-first output.

## What Not To Do

- Do not turn the session into a large implementation sprint.
- Do not re-read the same files repeatedly when the state has not changed.
- Do not skip the handoff notes just because little code changed.
- Do not skip security-sensitive paths, build wiring, or validation gaps when doing a system check.

## Best Fit

- Review days.
- Planning days.
- Token-heavy exploration days.
- Security audit days.
- Optimization and cleanup days.
- Sessions where the user wants judgment and direction more than code.
