#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_LOG_PATH = path.join(REPO_ROOT, 'storage', 'logs', 'rag', 'test_failures.jsonl');

const ERROR_KEYWORD_TAXONOMY = {
  MODULE_RESOLUTION: [
    'Cannot find module',
    'ERR_MODULE_NOT_FOUND',
    'MODULE_NOT_FOUND',
    'failed to load',
  ],
  ASSERTION_FAILURE: [
    'AssertionError',
    'ERR_TEST_FAILURE',
    'falsy value',
    'should exist',
    '!==',
    'deepEqual',
  ],
  ASYNC_UNHANDLED: [
    'UnhandledPromiseRejection',
    'unhandledRejection',
    'Unhandled rejection',
    'promise rejection',
  ],
  TIMEOUT: [
    'timed out',
    'TimeoutError',
    'test timed out',
  ],
  TYPE_ERROR: [
    'TypeError',
    'Cannot read property',
    'Cannot read properties',
    'is not a function',
  ],
  PROCESS_CRASH: [
    'SIGSEGV',
    'Segmentation fault',
    'fatal error',
    'out of memory',
    'heap limit',
  ],
  CONFIG_INTEGRITY: [
    'unclassified',
    'manifest mismatch',
    'checksum mismatch',
    'must be defined',
  ],
};

const TEST_SOURCE_KEYWORD_RULES = [
  {
    rule: 'RULE_TEST_ISOLATION_ONLY',
    pattern: /\b(?:test|it|describe)\.only\s*\(|\b(?:fit|fdescribe)\s*\(/g,
    message: 'Test specifies .only or fit/fdescribe; isolates suite and masks other test failures',
  },
  {
    rule: 'RULE_TEST_SILENT_SKIP',
    pattern: /\b(?:test|it|describe)\.skip\s*\(|\b(?:xit|xdescribe)\s*\(/g,
    message: 'Test specifies .skip or xit/xdescribe; silently skips execution and masks regressions',
  },
  {
    rule: 'RULE_DEBUGGER_STATEMENT',
    pattern: /\bdebugger\s*;/g,
    message: 'Debugger statement found; breaks automated non-interactive CI execution',
  },
  {
    rule: 'RULE_UNAWAITED_REJECTS',
    pattern: /(?<!await\s+)assert\.rejects\s*\(/g,
    message: 'assert.rejects() called without await; causes unhandled promise rejections and false passes',
  },
  {
    rule: 'RULE_TAUTOLOGICAL_ASSERTION',
    pattern: /\bassert(?:\.ok|\.equal|\.strictEqual)?\s*\(\s*(?:true|false|1|0)\s*(?:,\s*(?:true|false|1|0)\s*)?\)/g,
    message: 'Tautological dummy assertion gives false confidence without verifying behavior',
  },
];

function loadTestResults(filePath = DEFAULT_LOG_PATH) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return { error: 'MALFORMED_RECORD', line_number: index + 1, raw: line };
      }
    });
}

function spotKeywordsInResults(records = [], options = {}) {
  const taxonomy = { ...ERROR_KEYWORD_TAXONOMY, ...(options.customTaxonomy || {}) };
  const userKeywords = options.keywords || [];
  const matches = [];
  const categoryCounts = {};
  const fileCounts = {};

  for (const record of records) {
    if (!record || record.error === 'MALFORMED_RECORD') continue;
    const targetText = [
      record.test_name,
      record.message,
      record.stack,
      record.failure_type,
      record.error_code,
      record.file,
    ].filter(Boolean).join(' ');

    const matchedCategories = new Set();
    const matchedKeywords = new Set();

    for (const [category, keywords] of Object.entries(taxonomy)) {
      let matched = false;
      for (const kw of keywords) {
        if (targetText.toLowerCase().includes(kw.toLowerCase())) {
          matchedCategories.add(category);
          matchedKeywords.add(kw);
          matched = true;
        }
      }
      if (matched) {
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      }
    }

    let userMatched = false;
    for (const kw of userKeywords) {
      if (targetText.toLowerCase().includes(kw.toLowerCase())) {
        matchedCategories.add('USER_KEYWORD');
        matchedKeywords.add(kw);
        userMatched = true;
      }
    }
    if (userMatched) {
      categoryCounts.USER_KEYWORD = (categoryCounts.USER_KEYWORD || 0) + 1;
    }

    if (matchedKeywords.size > 0) {
      const entry = {
        test_name: record.test_name,
        file: record.file,
        line: record.line,
        categories: Array.from(matchedCategories),
        keywords: Array.from(matchedKeywords),
        message: record.message?.slice(0, 300),
        revision: record.revision,
        recorded_at: record.recorded_at,
      };
      matches.push(entry);
      if (record.file) {
        fileCounts[record.file] = (fileCounts[record.file] || 0) + 1;
      }
    }
  }

  return {
    totalRecords: records.length,
    matchedRecords: matches.length,
    categoryCounts,
    fileCounts,
    matches,
  };
}

function spotKeywordsInSource(sourceText, fileName = 'inline.test.js') {
  if (sourceText.includes('audit-ignore-test-scanner')) return [];
  const violations = [];
  const lines = sourceText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Skip comment-only lines or lines marked with audit-ignore-keyword
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line) || line.includes('audit-ignore-keyword')) continue;

    for (const rule of TEST_SOURCE_KEYWORD_RULES) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        violations.push({
          rule: rule.rule,
          line: i + 1,
          fileName,
          snippet: line.trim(),
          message: rule.message,
        });
      }
    }
  }

  return violations;
}

function auditTestFileSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return spotKeywordsInSource(content, filePath);
}

function runCli() {
  const args = process.argv.slice(2);
  const logIndex = args.indexOf('--log');
  const logPath = logIndex !== -1 && args[logIndex + 1] ? args[logIndex + 1] : DEFAULT_LOG_PATH;
  const kwIndex = args.indexOf('--keyword');
  const userKeywords = [];
  if (kwIndex !== -1 && args[kwIndex + 1]) {
    userKeywords.push(args[kwIndex + 1]);
  }

  console.log(`[TEST RESULTS AUDIT] Reading log from ${path.relative(REPO_ROOT, logPath)}...`);
  const records = loadTestResults(logPath);
  console.log(`[TEST RESULTS AUDIT] Loaded ${records.length} failure records.`);

  const analysis = spotKeywordsInResults(records, { keywords: userKeywords });
  console.log(`[TEST RESULTS AUDIT] Matched records: ${analysis.matchedRecords}/${analysis.totalRecords}`);
  console.log('\n[ERROR CATEGORIES]:');
  for (const [cat, count] of Object.entries(analysis.categoryCounts)) {
    console.log(`  - ${cat.padEnd(20)}: ${count}`);
  }

  if (Object.keys(analysis.fileCounts).length > 0) {
    console.log('\n[TOP AFFECTED FILES]:');
    const sortedFiles = Object.entries(analysis.fileCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [file, count] of sortedFiles) {
      console.log(`  - ${file}: ${count}`);
    }
  }

  return 0;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  DEFAULT_LOG_PATH,
  ERROR_KEYWORD_TAXONOMY,
  TEST_SOURCE_KEYWORD_RULES,
  auditTestFileSource,
  loadTestResults,
  runCli,
  spotKeywordsInResults,
  spotKeywordsInSource,
};
