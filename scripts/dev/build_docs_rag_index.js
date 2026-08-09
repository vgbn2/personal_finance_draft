#!/usr/bin/env node

'use strict';

const path = require('node:path');
const { buildDocsIndex, INDEX_CACHE_PATH } = require('../../shared/lib/ai/docs_rag_indexer.js');

function parseArgs(argv) {
  const args = [...argv];
  let corpus;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag !== '--corpus' || corpus || args.length === 0) {
      throw new Error('Usage: node scripts/dev/build_docs_rag_index.js [--corpus canonical|historical|all]');
    }
    corpus = args.shift();
  }
  if (corpus && !['canonical', 'historical', 'all'].includes(corpus)) {
    throw new Error(`Unsupported documentation corpus: ${corpus}`);
  }
  return { corpus };
}

function main(argv = process.argv.slice(2)) {
  const { corpus } = parseArgs(argv);
  console.log(`[RAG] Building ${corpus || 'default'} documentation index...`);
  const startTime = Date.now();
  const index = buildDocsIndex({ save: true, ...(corpus ? { corpus } : {}) });
  const duration = Date.now() - startTime;

  console.log(`[RAG] Done in ${duration}ms!`);
  console.log(`[RAG] Corpus ${index.corpus}: indexed ${index.file_count} files into ${index.total_docs} chunks (${index.term_count} unique terms).`);
  console.log(`[RAG] Index saved to: ${path.relative(process.cwd(), INDEX_CACHE_PATH)}`);
  return index;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = { main, parseArgs };
