#!/usr/bin/env node

'use strict';

const path = require('node:path');
const { buildDocsIndex, INDEX_CACHE_PATH } = require('../../shared/lib/ai/docs_rag_indexer.js');

console.log('[RAG] Building reference documentation index...');
const startTime = Date.now();
const index = buildDocsIndex({ save: true });
const duration = Date.now() - startTime;

console.log(`[RAG] Done in ${duration}ms!`);
console.log(`[RAG] Indexed ${index.file_count} files into ${index.total_docs} chunks (${index.term_count} unique terms).`);
console.log(`[RAG] Index saved to: ${path.relative(process.cwd(), INDEX_CACHE_PATH)}`);
