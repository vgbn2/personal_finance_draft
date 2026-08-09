---
id: atlas.structure.documentation.rag-index-payload
kind: structure
title: Documentation Retrieval Index Payload
status: current
owners:
  source:
    - path: shared/lib/ai/docs_rag_indexer.js
      symbol: buildDocsIndex
    - path: shared/lib/ai/docs_rag_indexer.js
      symbol: loadOrBuildIndex
  tests:
    - tests/scripts/tools/docs_rag.test.js
  docs:
    - docs/modules/documentation-retrieval.md
review_triggers:
  - cache-schema-change
  - corpus-identity-change
last_verified:
  revision: working-tree
  base_commit: 9fea4a90cbe92cddb0c401db5ef2d3b631427689
  method: source-and-test-review
---

# Documentation Retrieval Index Payload

## Identity And Owner

`buildDocsIndex` owns the in-memory and serialized `sovereign.docs_rag/v2` payload. `loadOrBuildIndex` owns compatibility checks before cache reuse.

## Shape And Field Semantics

- `version`: cache schema identifier.
- `corpus`: `canonical`, `historical`, `all`, or `explicit`.
- `input_roots`: sorted roots for explicit scans; empty for manifest corpora.
- `created_at`: ISO-8601 construction timestamp.
- `total_docs`: chunk count; retained legacy field name.
- `file_count`: selected Markdown file count.
- `term_count`: vocabulary size.
- `terms`: token to `{df, idf}` map.
- `chunks`: ordered `{id, file, header, line, content, tokenCount}` records.

Chunk `file` paths are repository-relative and IDs are contiguous array indexes.

## State Transitions And Invariants

The payload is created as one complete object. Search treats it as immutable. A cache is reusable only when version, corpus, explicit roots, and chunk-array shape match the request.

## Producer And Consumer Topology

`buildDocsIndex` produces the payload. `scripts/dev/build_docs_rag_index.js` persists it. `loadOrBuildIndex` reads or rebuilds it. `searchDocs` consumes `terms` and `chunks`.

## Persistence And Compatibility

The default cache path is `storage/data/cache/docs_rag_index.json`, an ignored local artifact. Version v2 adds corpus identity and prevents a v1 broad docs+workspace index from serving canonical requests. No migration is needed; incompatible caches rebuild.

## Concurrency And Recovery

Writes use synchronous file operations without a cross-process lock. Concurrent builders can race but produce rebuildable cache state; the file is not canonical data. A parse failure causes a rebuild. Operators may delete the cache safely.

## Cost Model

Payload size grows with chunk content plus vocabulary. Index construction retains all chunk contents in memory and serializes them once. This is suitable for the local documentation corpus but not an unbounded log archive.

## Verification

`tests/scripts/tools/docs_rag.test.js` proves corpus labels, canonical exclusion of workspace, explicit-root compatibility, and successful search. Cache corruption/race soak is not qualified.