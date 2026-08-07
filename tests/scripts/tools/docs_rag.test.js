'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  tokenize,
  chunkMarkdownFile,
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

test('searchDocs returns relevant search hits for architecture terms', () => {
  const index = buildDocsIndex({ save: false, dirs: ['docs'] });
  const searchResult = searchDocs('Polymarket', { index, limit: 3 });
  assert.ok(searchResult.ok);
  assert.equal(searchResult.query, 'Polymarket');
  assert.ok(searchResult.results.length > 0);
  assert.ok(searchResult.results[0].file);
  assert.ok(searchResult.results[0].snippet);
});
