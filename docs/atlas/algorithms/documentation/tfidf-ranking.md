---
id: atlas.algorithm.documentation.tfidf-ranking
kind: algorithm
title: Documentation TF-IDF Ranking
status: current
owners:
  source:
    - path: shared/lib/ai/docs_rag_indexer.js
      symbol: buildDocsIndex
    - path: shared/lib/ai/docs_rag_indexer.js
      symbol: searchDocs
  tests:
    - tests/scripts/tools/docs_rag.test.js
  docs:
    - docs/modules/documentation-retrieval.md
review_triggers:
  - tokenization-change
  - ranking-formula-change
  - chunking-change
last_verified:
  revision: working-tree
  base_commit: 9fea4a90cbe92cddb0c401db5ef2d3b631427689
  method: source-and-test-review
---

# Documentation TF-IDF Ranking

## Purpose And Ownership

`buildDocsIndex` constructs a small local term index over Markdown chunks; `searchDocs` ranks chunks for a query. This is a retrieval aid, not semantic verification.

## Inputs And Outputs

Input documents are UTF-8 Markdown files selected by corpus policy. `tokenize` lowercases text, removes fenced/inline code formatting and punctuation, removes configured stopwords, and retains tokens longer than one character. Output scores are dimensionless ranking values rounded to four decimals.

## Mathematical Definition

For `N` chunks and a token appearing in `df(t)` chunks:

```text
idf(t) = ln((N + 1) / (df(t) + 1)) + 1
tf(t, c) = count(t in c) / token_count(c)
score(c, q) = sum(tf(t, c) * idf(t)) for each token t in query q
```

The `+1` smoothing keeps all terms finite and positive, including terms present in every chunk.

## Implementation Outline

```text
select corpus files
chunk each Markdown file at headings
normalize each chunk into tokens
count one document-frequency occurrence per unique token per chunk
compute smoothed inverse document frequency
for each query token and chunk:
  count term occurrences
  accumulate normalized term frequency times inverse document frequency
sort descending and return the requested limit
```

## Preconditions, Invariants, And Postconditions

- Every chunk ID equals its array index.
- Document frequency counts chunks, not files.
- Query terms absent from the index contribute zero.
- Empty or stopword-only queries return no results.
- Ranking never establishes that a matched claim is current or correct.

## Complexity

Let `C` be chunks, `T` total indexed tokens, `Q` query tokens, and `K` requested results.

- Index construction: `O(T)` expected time and `O(V + C)` metadata plus chunk content, where `V` is unique vocabulary.
- Current search implementation: `O(Q * T + C log C)` because each query token retokenizes and scans every chunk before sorting scored chunks.
- The algorithm is appropriate for the bounded local corpus; larger corpora should add postings and stored token frequencies rather than changing the scoring contract silently.

## Numerical Behavior

JavaScript `Number` arithmetic is used. Scores are finite for finite token counts because smoothed `idf` has positive finite arguments and term frequency divides by at least one. Final rounding affects presentation/order only when unrounded scores differ below four-decimal resolution after mapping; JavaScript stable sort preserves insertion order for exact equal comparator values.

## Reference Vectors

For `N = 2`, a term present in one chunk has `idf = ln(3/2) + 1`. If it appears twice in a four-token chunk, its contribution is `0.5 * (ln(3/2) + 1)`. A term present in both chunks has `idf = 1`.

The focused tests also verify that a Polymarket query returns a real indexed documentation hit.

## Verification And Change Safety

`tests/scripts/tools/docs_rag.test.js` covers tokenization, chunking, corpus separation, explicit-directory compatibility, and search results. Formula or tokenization changes require a new reference vector and cache-version review.