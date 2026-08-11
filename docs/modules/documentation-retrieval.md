# Module: Documentation Retrieval And Knowledge Boundaries

> **Status:** Implemented in working-tree source
> **Audience:** maintainers, contributors, documentation authors
> **Canonical owners:** `shared/lib/ai/docs_rag_indexer.js`, `docs/documentation_manifest.json`, `workspace/workspace_manifest.json`
> **Review triggers:** corpus policy, manifest schema, indexing/tokenization, cache format, docs/workspace placement rules

## Purpose And Non-Goals

This module provides local full-text retrieval over the documentation corpus while keeping durable engineering knowledge separate from operational workspace history. Normal retrieval indexes manifest-registered canonical/supporting docs. Historical mining requires an explicit `historical` or `all` corpus.

It does not decide whether an engineering claim is true, generate documentation, or promote workspace evidence automatically.

## Entrypoints And Public Contracts

| Surface | Owner | Contract |
|---|---|---|
| `buildDocsIndex(options)` | `shared/lib/ai/docs_rag_indexer.js` | Builds a TF-IDF index for `canonical`, `historical`, `all`, or explicit `dirs` input. |
| `searchDocs(query, options)` | `shared/lib/ai/docs_rag_indexer.js` | Returns ranked local chunks from a supplied or cached index. |
| `scripts/dev/build_docs_rag_index.js` | script entrypoint | Builds the default manifest-selected corpus and writes the local ignored cache. |
| `scripts/dev/audit_documentation.js` | documentation validator | Checks tree ownership, manifest references, and Atlas record contracts. |

Explicit `dirs: [...]` remains a compatibility override for bounded callers and tests. It is labeled `corpus: explicit` and cache-bound to the normalized input roots.

## Dependencies And Data Flow

```text
docs/documentation_manifest.json
  -> resolveCorpusFiles
  -> Markdown files
  -> chunkMarkdownFile/tokenize
  -> buildDocsIndex
  -> ignored docs_rag_index.json
  -> searchDocs
```

Historical mode reads roots declared by `historical_corpus`; it does not make those records canonical.

## Invariants And Safety Boundaries

- Default lookup does not index `workspace/`.
- Canonical membership comes from the documentation manifest, not directory recency.
- Historical and all-corpus lookup are explicit.
- Indexing is local and read-only except for the ignored cache file when `save !== false`.
- Cache reuse requires matching index version, corpus, and explicit input roots.
- Retrieval relevance is not source verification.

## Failure Modes And Degraded Behavior

| Failure | Visible evidence | Safe behavior | Repair owner |
|---|---|---|---|
| Manifest JSON or schema invalid | thrown error | no index is built | documentation maintainer |
| Registered Markdown file missing | file omitted by the indexer; documentation audit fails | canonical lookup cannot cite it | owning docs section |
| Cache version/corpus/roots mismatch | cache ignored | rebuild requested corpus | retrieval owner |
| Markdown file unreadable | no chunks for that file | remaining corpus remains searchable | file owner |
| Empty/stopword-only query | empty result set | no guessed match | caller |

## Observability

The index payload records `version`, `corpus`, `input_roots`, file/chunk counts, term count, and chunk paths. These prove index construction inputs and shape, not semantic correctness or freshness.

## Recovery And Rollback

Delete or ignore the generated cache and rebuild it with the desired corpus. Reverting corpus policy is a source change to `docs/documentation_manifest.json` or the indexer and requires the focused retrieval and documentation-contract tests.

## Examples

Read-only canonical index:

```js
const { buildDocsIndex } = require('../shared/lib/ai/docs_rag_indexer');
const index = buildDocsIndex({ save: false });
```

Explicit historical mining:

```js
const index = buildDocsIndex({ save: false, corpus: 'historical' });
```

## Tests And Evidence

- `tests/scripts/tools/docs_rag.test.js`
- `tests/scripts/architecture/cli/core/documentation_contract.test.js`
- `node scripts/dev/audit_documentation.js`

Current evidence is working-tree source/test proof based on commit `9fea4a90cbe92cddb0c401db5ef2d3b631427689`. It is not committed-archive, CI, host, deployment, or soak proof.

## Related Code Atlas Records

- `atlas.algorithm.documentation.tfidf-ranking`
- `atlas.structure.documentation.rag-index-payload`
- `atlas.protocol.documentation.corpus-selection`
- `atlas.topology.documentation.retrieval-flow`

## Compatibility And Historical Notes

Before this pilot, default index construction scanned both `docs/` and `workspace/`, allowing session history to dominate ordinary lookup. Explicit `dirs` remains supported for callers that intentionally select roots.

## Change Checklist

- [ ] Manifest and corpus policy remain aligned.
- [ ] Cache identity changes when payload semantics change.
- [ ] Canonical mode excludes workspace history.
- [ ] Historical mining remains explicit and labeled.
- [ ] Focused retrieval and documentation audits pass.
