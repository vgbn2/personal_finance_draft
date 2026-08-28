# Audit Mode Checklists

## Triage

- Read the latest relevant state, developer-review, and review-ledger sections.
- Search the user-provided symptom, command, file, or domain.
- Verify at most three high-risk candidates.
- Return confirmed findings, dismissed candidates, fault-domain/stub-causality attribution, and the next
  narrow check.

## Section Grade

- Inspect active production entrypoints, tests, docs, and config for each named section.
- Score path clarity, duplication/drift, verification, artifact hygiene, doc alignment, and domain boundaries.
- Use A for coherent/verified, B for contained debt, C for material drift, D for unclear or untrusted ownership, and F for broken/unsafe foundations.
- For every grade below A, identify each grade-limiting finding's failing boundary, fault domain, repair owner,
  causal mechanism, and stub involvement. Do not lower a grade for an unattributed suspicion.
- Grade only sections actually checked and update the review ledger.

## Data Integrity

- Trace source, adapter, validation, storage/cache, transform, decision/report, UI, and tests.
- Report row/record counts, freshness, schema, coverage, provenance, point-in-time correctness, and overwrite risk.
- Calculate `DCS = 0.3*Freshness + 0.4*Schema + 0.3*Coverage` only from current evidence.
- Mark suspect seams degraded and block downstream promotion.

## Maintainability

- Read governing rules, the complete target, direct callers, tests, docs, and relevant legacy constraints.
- Map the touched behavior to one canonical owner and its operator entrypoint.
- Compare sibling modules for naming, error, async, validation, configuration, and dependency conventions.
- Find duplicated policy, mixed responsibilities, generic utility dumping grounds, speculative abstractions,
  deep control flow, misleading names, stale comments, and docs that overstate current behavior.
- Use size only as a review signal: inspect changed functions above 60 lines, nesting deeper than three levels,
  files above 300 lines, and especially files above 500 or 1,000 lines. Do not split cohesive legacy code
  mechanically.
- Trace one incident path from symptom to owner, logs/health, safe shutdown, recovery, and verification.
- Classify each candidate as readability debt, ownership debt, behavioral defect, intentional compatibility,
  legacy constraint, or dismissed false positive.
- Route behavior-preserving cleanup to `refactor-readability`; route behavior changes through `codex` or
  `mass-implement`.

## Review

- Read changed/requested files, then callers, tests, and active runtime logs.
- Inspect live logs (`storage/logs/flaw_monitor.log`, `storage/data/logs/*.jsonl`, broker logs) to identify active operational rejections or runtime regressions.
- Report findings first in severity order with file:line, impact, fault-domain/stub-causality attribution, and
  missing verification.
- Do not lead with a broad summary or section grades.

## Security

- Execute Security Audit Intake Protocol: prompt user for target authorization context, scope boundaries, live secret presence, and threat model priorities.
- Verify zero unredacted API keys, JWT secrets, or private credentials in source files, logs, or test fixtures.
- Audit authentication policy gates (`access_policy.js`), bearer token validation, and public API boundaries (`/api/public/*`).
- Audit input sanitization and path traversal defenses in file readers/publishers (`input_validator.js`, `public_artifact_publisher.js`).
- Verify Trade PIN enforcement (`authorizePolymarketLive`) and execution authority flags (`LIVE_TRADING=false`).

## Fault Attribution Matrix

Apply this matrix to every confirmed finding in any audit mode and to every grade-limiting finding below A:

| Field | Required value |
| --- | --- |
| Failing boundary | First directly proved broken seam in the caller-to-output path |
| Fault domain | `our_source`, `our_host_or_deployment`, `operator_config_or_credentials`, `external_provider`, `environment_or_sandbox`, `shared_or_mixed`, or `unresolved` |
| Repair owner | Exact module, service, deployment surface, operator workflow, or provider boundary |
| Causal mechanism | Proved root cause, or explicitly labeled candidate |
| Stub involvement | `production_stub`, `test_stub_only`, `silent_fallback`, `compatibility_shim`, `adapter_not_stub`, `none`, or `unresolved` |
| Confidence | `high`, `medium`, or `low`, tied to observed evidence |
| Alternatives checked | Plausible competing domains and the evidence for dismissing or retaining them |
| Discriminating check | First safe check that resolves any remaining ambiguity |

Trace `entrypoint -> caller -> canonical owner -> config projection -> owned runtime -> external dependency ->
output`. Stop at the strongest proved layer. A symptom observed on the owned server is not automatically an
owned-server defect; an upstream error is not automatically an upstream defect. When a mock, fixture, or test
stub appears only in verification, classify it as `test_stub_only`, not as the production cause. When the
production path contains no stub, say `none`.

## API Authentication Gate

Apply this gate whenever an audit claims an API credential works or diagnoses an authentication failure:

1. Identify the canonical credential names, compatibility aliases, secret class, owner, runtime consumer, and
   intended account scope such as paper versus live. Never print secret values.
2. Prove configuration layers separately: non-empty presence, value fingerprint equality where needed,
   endpoint class, service projection, and the exact runtime path consuming the variables.
3. Treat source checks, mocks, fingerprints, and successful projection as configuration proof only. They do
   not prove provider acceptance.
4. Prefer an existing structured runtime status artifact for provider evidence. Record provider, account
   scope, endpoint class, timestamp, result, and normalized error code without copying headers, tokens, or raw
   response bodies.
5. A fresh provider probe is external polling. Run it only with explicit user authorization and the
   `AGENTS.md` restricted-delegation boundary. Use the least-privileged read-only identity endpoint, forbid
   orders and mutations, and accept only structured redacted JSON back into the main audit.
6. Classify the result as `accepted`, `rejected`, `unavailable`, `rate_limited`, or `inconclusive`. Do not call
   a credential invalid when transport, rate-limit, endpoint-scope, clock, account-state, or permission
   evidence remains unresolved.
7. Report the strongest proved layer and the first unproved layer. Keep Paper and Live results distinct.
8. Attribute a rejected credential to `operator_config_or_credentials` only when our source, projection,
   endpoint, and runtime-consumption layers are proved and provider acceptance is the first failed layer.
   Use `external_provider` only with evidence of an upstream service/account defect independent of the supplied
   credential, and use `unresolved` when those cases cannot yet be separated.

## Full

- Check workspace archive chronology and clean committed/archive truth.
- Run the connective-tissue checklist and inspect the mandatory critical path.
- Grade only reviewed major sections.
- Run one broad hygiene/test gate when practical.
- Update review ledgers and report DCS only when canonical data is actually reviewed.

## Reading Modes

- Hard: use for a first pass or stale state; establish current production ownership before conclusions.
- Fast: reuse current verified context and inspect unresolved surfaces only.

If `HEAD` is a merge commit or the dirty tree repairs load-bearing files, use a temporary `git archive HEAD` proof before calling the source clean-clone reproducible.
