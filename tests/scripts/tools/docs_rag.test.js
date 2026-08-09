'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  tokenize,
  chunkMarkdownFile,
  resolveCorpusFiles,
  buildDocsIndex,
  searchDocs,
} = require('../../../shared/lib/ai/docs_rag_indexer.js');

test('tokenize removes code formatting, stopwords, and punctuation', () => {
  const tokens = tokenize('The `Polymarket` client uses `sig1` signature type and Gamma API.');
  assert.ok(tokens.includes('polymarket'));
  assert.ok(tokens.includes('client'));
  assert.ok(tokens.includes('sig1'));
  assert.ok(tokens.includes('gamma'));
  assert.ok(!tokens.includes('the'));
  assert.ok(!tokens.includes('and'));
});

test('chunkMarkdownFile splits headings cleanly', () => {
  const testFile = path.join(__dirname, '..', '..', '..', 'docs', 'README.md');
  const chunks = chunkMarkdownFile(testFile);
  assert.ok(Array.isArray(chunks));
  assert.ok(chunks.length > 0);
  assert.ok(chunks[0].file);
  assert.ok(chunks[0].header);
  assert.ok(chunks[0].content);
});

test('default corpus indexes manifest-registered current docs without workspace history', () => {
  const index = buildDocsIndex({ save: false });
  assert.equal(index.corpus, 'canonical');
  assert.ok(index.file_count > 0);
  assert.ok(index.chunks.every((chunk) => !chunk.file.startsWith('workspace/')));
  assert.ok(index.chunks.some((chunk) => chunk.file === 'docs/README.md'));
});

test('historical and all corpus modes include workspace only when requested', () => {
  const historical = resolveCorpusFiles('historical').map((file) => path.relative(path.join(__dirname, '..', '..', '..'), file).replaceAll(path.sep, '/'));
  const all = resolveCorpusFiles('all');
  const canonical = resolveCorpusFiles('canonical');

  assert.ok(historical.some((file) => file.startsWith('workspace/')));
  assert.ok(!canonical.some((file) => file.includes(`${path.sep}workspace${path.sep}`)));
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.length >= canonical.length);
  assert.ok(all.length >= historical.length);
});

test('explicit directory callers retain broad scan compatibility', () => {
  const index = buildDocsIndex({ save: false, dirs: ['docs'] });
  assert.equal(index.corpus, 'explicit');
  assert.ok(index.chunks.some((chunk) => chunk.file === 'docs/README.md'));
});

test('RAG builder CLI parses explicit historical corpus without ambiguity', () => {
  const { parseArgs } = require('../../../scripts/dev/build_docs_rag_index.js');
  assert.deepEqual(parseArgs(['--corpus', 'historical']), { corpus: 'historical' });
  assert.deepEqual(parseArgs([]), { corpus: undefined });
  assert.throws(() => parseArgs(['--corpus', 'unknown']), /Unsupported documentation corpus/);
  assert.throws(() => parseArgs(['--unknown']), /Usage:/);
});

test('searchDocs returns relevant search hits for architecture terms', () => {
  const index = buildDocsIndex({ save: false });
  const searchResult = searchDocs('Polymarket', { index, limit: 3 });
  assert.ok(searchResult.ok);
  assert.equal(searchResult.query, 'Polymarket');
  assert.ok(searchResult.results.length > 0);
  assert.ok(searchResult.results[0].file);
  assert.ok(searchResult.results[0].snippet);
});
