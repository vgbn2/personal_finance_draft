#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');

// Internal domain modules that MUST NEVER be stubbed/mocked in tests
const FORBIDDEN_MOCK_TARGETS = [
  'validation',
  'ts_index_storage',
  'backtest',
  'paper_ledger',
  'strategy',
  'cli_executor',
  'equity_session',
  'quote_router',
];

function listTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTestFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.test.js') || entry.name.endsWith('.bench.js'))) {
      files.push(fullPath);
    }
  }
  return files;
}

function auditFile(filePath) {
  const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNum = index + 1;

    // Rule 1: Check for stubbing/mocking internal domain modules
    for (const target of FORBIDDEN_MOCK_TARGETS) {
      const mockRegex = new RegExp(`(?:t\\.mock|sinon\\.stub|jest\\.spyOn|require\\.cache)[^\\n]*\\b${target}\\b`, 'i');
      if (mockRegex.test(line) && !line.includes('// audit-ignore-mock')) {
        violations.push({
          rule: 'RULE_1_INTERNAL_MOCKING',
          line: lineNum,
          message: `Forbidden stubbing/mocking of internal domain module '${target}'`,
          snippet: line.trim(),
        });
      }
    }

    // Rule 3: Check for empty catch blocks after try blocks containing assertions
    if (/\btry\s*\{/.test(line)) {
      // Look ahead up to 15 lines for catch block with empty or silent body
      const slice = lines.slice(index, Math.min(lines.length, index + 15)).join('\n');
      if (/\bassert\b/.test(slice) && /catch\s*\([^)]*\)\s*\{\s*\}/.test(slice)) {
        violations.push({
          rule: 'RULE_3_SILENT_ERROR_SWALLOWING',
          line: lineNum,
          message: 'Silent error swallowing: try/catch block wraps assertions without rethrowing or failing',
          snippet: line.trim(),
        });
      }
    }

    // Rule 4: Check for direct file reads pointing to storage/data/cache instead of tests/fixtures/
    if (/(?:readFileSync|readFile|readSnapshot|readJson|createReadStream)\s*\([^)]*storage[/\\]data[/\\]cache/i.test(line) && !line.includes('// audit-ignore-cache')) {
      violations.push({
        rule: 'RULE_4_CACHE_DEPENDENCE',
        line: lineNum,
        message: 'Test reads gitignored storage/data/cache directly; use tests/fixtures/ for deterministic test inputs',
        snippet: line.trim(),
      });
    }
  }

  return { file: relPath, violations };
}

function runAudit() {
  const testFiles = listTestFiles(TESTS_DIR);
  let totalViolations = 0;
  const results = [];

  for (const testFile of testFiles) {
    const audit = auditFile(testFile);
    if (audit.violations.length > 0) {
      results.push(audit);
      totalViolations += audit.violations.length;
    }
  }

  console.log(`[TEST INTEGRITY AUDIT] Scanned ${testFiles.length} test files...`);

  if (totalViolations > 0) {
    console.error(`\x1b[31m✘ Found ${totalViolations} test integrity violation(s) across ${results.length} file(s):\x1b[0m\n`);
    for (const res of results) {
      console.error(`\x1b[1m${res.file}\x1b[0m:`);
      for (const v of res.violations) {
        console.error(`  [Line ${v.line}] [${v.rule}] ${v.message}`);
        console.error(`    \x1b[90m${v.snippet}\x1b[0m`);
      }
    }
    process.exit(1);
  }

  console.log(`\x1b[32m✔ 100% Test Integrity Passed across ${testFiles.length} test files (0 rule violations).\x1b[0m`);
  process.exit(0);
}

runAudit();
