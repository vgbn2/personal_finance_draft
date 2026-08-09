---
id: atlas.topology.documentation.retrieval-flow
kind: topology
title: Documentation Retrieval Flow
status: current
owners:
  source:
    - path: scripts/dev/build_docs_rag_index.js
      symbol: main
    - path: shared/lib/ai/docs_rag_indexer.js
      symbol: buildDocsIndex
    - path: shared/lib/ai/docs_rag_indexer.js
      symbol: searchDocs
  tests:
    - tests/scripts/tools/docs_rag.test.js
  docs:
    - docs/modules/documentation-retrieval.md
review_triggers:
  - retrieval-entrypoint-change
  - corpus-resolution-change
  - index-storage-change
last_verified:
  revision: working-tree
  base_commit: 9fea4a90cbe92cddb0c401db5ef2d3b631427689
  method: source-and-test-review
---

# Documentation Retrieval Flow

## Entrypoints

- `node scripts/dev/build_docs_rag_index.js` builds and saves the default corpus.
- Library callers use `buildDocsIndex`, `loadOrBuildIndex`, and `searchDocs`.
- Focused tests call the library with `save: false` to avoid persistent state.

## Ownership Flow

```text
documentation manifest -> corpus resolver -> Markdown scanner/chunker
  -> TF-IDF index builder -> ignored cache -> query ranker -> result snippets
```

The documentation audit independently validates manifests, tree boundaries, owner paths, and Atlas records.

## Dependency Direction

The script depends on the shared indexer. The indexer reads the manifest and Markdown files but does not import workspace logic. Documentation pages do not control runtime behavior. Search consumers depend on the payload contract, not filesystem traversal details.

## State, I/O, And Side Effects

Input is local repository text. The only default write is the ignored JSON cache under `storage/data/cache/`. No network, provider, credential, trading, or canonical-market-data boundary is crossed.

## Generated Artifacts, Adapters, And Shims

`docs_rag_index.json` is generated and rebuildable. Explicit `dirs` is a compatibility input path for existing callers. Version v1 cache files are incompatible and rebuild automatically.

## Failure Domains And Recovery Ownership

- Manifest/schema/placement failure: documentation owner; run the documentation audit.
- Markdown read failure: owning docs section.
- Cache parse or identity mismatch: retrieval owner; rebuild.
- Irrelevant search result: ranking/content owner; do not treat retrieval as truth.

## Verification

`tests/scripts/tools/docs_rag.test.js` covers entrypoint-level library behavior and corpus boundaries. `tests/scripts/architecture/cli/core/documentation_contract.test.js` covers manifest and root ownership. No host or concurrent-builder soak was run.