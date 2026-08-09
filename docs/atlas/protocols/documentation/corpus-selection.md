---
id: atlas.protocol.documentation.corpus-selection
kind: protocol
title: Documentation Corpus Selection
status: current
owners:
  source:
    - path: shared/lib/ai/docs_rag_indexer.js
      symbol: resolveCorpusFiles
    - path: docs/documentation_manifest.json
      symbol: default_corpus
  tests:
    - tests/scripts/tools/docs_rag.test.js
    - tests/scripts/architecture/cli/core/documentation_contract.test.js
  docs:
    - docs/modules/documentation-retrieval.md
review_triggers:
  - documentation-manifest-change
  - corpus-policy-change
  - workspace-boundary-change
last_verified:
  revision: working-tree
  base_commit: 9fea4a90cbe92cddb0c401db5ef2d3b631427689
  method: source-and-test-review
---

# Documentation Corpus Selection

## Participants, Authority, And Boundary

The documentation manifest declares default corpus policy, registered current documents, and historical roots. `resolveCorpusFiles` enforces the selection. Callers request a corpus; the indexer does not infer authority from recency or path content.

## Message Shapes And Units

Input is one corpus name:

- `canonical`: manifest documents with `canonical` or `supporting` status and Markdown paths;
- `historical`: Markdown under declared historical roots, including workspace evidence;
- `all`: deduplicated union of canonical and historical;
- explicit `dirs`: compatibility override, represented as `corpus: explicit`.

Output is a sorted unique list of absolute Markdown paths.

## Ordering And State Transitions

Manifest parsing precedes selection. Selected paths are filtered for existing Markdown files, deduplicated, and sorted before chunking. Corpus choice remains fixed for one index payload.

## Success, Error, And Degraded Semantics

Unsupported corpus names or manifest schema errors throw and stop index construction. Missing registered files are excluded by retrieval but detected by the documentation audit. Unreadable individual Markdown files produce no chunks.

## Retry, Timeout, Idempotency, And Cancellation

Selection performs synchronous local file reads and has no retry or timeout. Repeating selection on the same tree and manifest returns the same sorted paths. Index timestamps differ across builds, but membership is deterministic.

## Trust And Compatibility Boundaries

Workspace history is untrusted as current engineering truth and enters retrieval only through explicit historical/all selection. Explicit `dirs` is retained for callers that intentionally own root selection; it cannot masquerade as canonical corpus metadata.

## Observability And Recovery

The payload exposes `corpus` and `input_roots`. Rebuild with a corrected manifest or requested corpus after an error. Run `node scripts/dev/audit_documentation.js` to detect broken registrations and root-boundary violations.

## Verification

Focused tests prove canonical exclusion of workspace, explicit historical inclusion, all-mode deduplication, and explicit-directory compatibility. They do not prove the semantic truth of indexed prose.