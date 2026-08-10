#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');
const CPP_TESTS_DIR = path.join(REPO_ROOT, 'backend', 'core', 'test');

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

const CACHE_READERS = new Set([
  'readFileSync',
  'readFile',
  'readSnapshot',
  'readJson',
  'createReadStream',
]);

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath, predicate));
    else if (entry.isFile() && predicate(entry.name)) files.push(fullPath);
  }
  return files;
}

function listJsTestFiles() {
  return listFiles(
    TESTS_DIR,
    (name) => name.endsWith('.test.js') || name.endsWith('.bench.js'),
  );
}

function listCppTestFiles() {
  const tracked = spawnSync('git', [
    'ls-files',
    '--',
    'backend/core/test',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (tracked.status !== 0) {
    throw new Error(`native test discovery failed: ${tracked.error?.message || tracked.stderr || 'git ls-files failed'}`);
  }

  const cppFiles = tracked.stdout
    .split(/\r?\n/)
    .filter((relativePath) => relativePath.endsWith('_test.cpp'))
    .map((relativePath) => path.join(REPO_ROOT, relativePath))
    .sort();
  if (cppFiles.length === 0) throw new Error('native test discovery found no tracked C++ tests');

  const rootCmake = path.join(REPO_ROOT, 'backend', 'core', 'CMakeLists.txt');
  let cmake;
  try {
    cmake = fs.readFileSync(rootCmake, 'utf8');
  } catch (error) {
    throw new Error(`native test registration discovery failed: ${error.message}`);
  }
  const registrations = [...cmake.matchAll(/add_sovereign_test\(([^\s]+)\s+(test\/[^\s)]+_test\.cpp)\)/g)];
  const registered = new Set(registrations
    .map((match) => path.resolve(path.dirname(rootCmake), match[2])));
  const unregistered = cppFiles.filter((filePath) => !registered.has(filePath));
  if (unregistered.length > 0) {
    throw new Error(`native test registration mismatch: ${unregistered.map((filePath) => path.relative(REPO_ROOT, filePath)).join(', ')}`);
  }

  const mirrorPath = path.join(REPO_ROOT, 'backend', 'core', 'test', 'CMakeLists.txt');
  let mirror;
  try {
    mirror = fs.readFileSync(mirrorPath, 'utf8');
  } catch (error) {
    throw new Error(`native test mirror discovery failed: ${error.message}`);
  }
  const mirroredTargets = new Set([...mirror.matchAll(/^\s+([a-z0-9_]+_test)\s*$/gmi)]
    .map((match) => match[1]));
  const rootTargets = registrations.map((match) => match[1]);
  const missingMirrorTargets = rootTargets.filter((target) => !mirroredTargets.has(target));
  const extraMirrorTargets = [...mirroredTargets].filter((target) => !rootTargets.includes(target));
  if (missingMirrorTargets.length > 0 || extraMirrorTargets.length > 0) {
    throw new Error(`native test target mirror mismatch: missing=${missingMirrorTargets.join(',') || 'none'} extra=${extraMirrorTargets.join(',') || 'none'}`);
  }
  return cppFiles;
}

function changedCppTestFiles() {
  return listCppTestFiles();
}

function loaderIgnoreReason(text) {
  const match = text.match(/audit-ignore-loader:[ \t]*([^\r\n*][^\r\n*]*)/);
  return match && match[1].trim() ? match[1].trim() : null;
}

function isRequireCacheAccess(expression) {
  return ts.isElementAccessExpression(expression)
    && ts.isPropertyAccessExpression(expression.expression)
    && ts.isIdentifier(expression.expression.expression)
    && expression.expression.expression.text === 'require'
    && expression.expression.name.text === 'cache';
}

function isModuleLoadAccess(expression) {
  return ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'Module'
    && expression.name.text === '_load';
}

function isLoaderFake(value) {
  return ts.isObjectLiteralExpression(value)
    || ts.isFunctionExpression(value)
    || ts.isArrowFunction(value);
}

function inspectLoaderReplacement(node, text, add) {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
  const target = isRequireCacheAccess(node.left) ? 'require.cache' : (isModuleLoadAccess(node.left) ? 'Module._load' : null);
  if (!target || !isLoaderFake(node.right)) return;
  if (loaderIgnoreReason(text)) return;
  add(
    'RULE_1_LOADER_REPLACEMENT',
    node,
    `${target} replaces a loaded module; use a focused production-path fixture or an audit-ignore-loader reason`,
  );
}

function inspectMalformedLoaderIgnore(node, text, add) {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
  if (!isRequireCacheAccess(node.left) && !isModuleLoadAccess(node.left)) return;
  if (!text.includes('audit-ignore-loader:') || loaderIgnoreReason(text)) return;
  add('RULE_1_LOADER_IGNORE', node, 'audit-ignore-loader requires a non-empty reason');
}

function lineNumber(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function sourceSnippet(sourceFile, node) {
  return node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 240);
}

function callName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    return `${callName(expression.expression)}.${expression.name.text}`;
  }
  return expression.getText();
}

function containsAssertion(node) {
  let found = false;
  function visit(current) {
    if (found) return;
    if (ts.isCallExpression(current)) {
      const name = callName(current.expression);
      if (name === 'assert' || name.startsWith('assert.')) {
        found = true;
        return;
      }
    }
    ts.forEachChild(current, visit);
  }
  visit(node);
  return found;
}

function equalityWrappedInBooleanAssertion(node) {
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return false;
  const name = callName(node.expression);
  if (name !== 'assert' && name !== 'assert.ok') return false;
  const argument = node.arguments[0];
  if (!ts.isBinaryExpression(argument)) return false;
  return [
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ].includes(argument.operatorToken.kind);
}

function stringLiterals(node) {
  const values = [];
  function visit(current) {
    if (ts.isStringLiteralLike(current)) values.push(current.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return values;
}

function inspectMockCall(node, name, text, add) {
  const isMockOperation = [
    't.mock',
    'sinon.stub',
    'jest.spyOn',
  ].some((prefix) => name === prefix || name.startsWith(`${prefix}.`));
  if (!isMockOperation || text.includes('audit-ignore-mock')) return;

  for (const target of FORBIDDEN_MOCK_TARGETS) {
    if (!new RegExp(`\\b${target}\\b`, 'i').test(text)) continue;
    add(
      'RULE_1_INTERNAL_MOCKING',
      node,
      `Forbidden stubbing/mocking of internal domain module '${target}'`,
    );
  }
}

function inspectStrictAssertion(node, add) {
  if (!equalityWrappedInBooleanAssertion(node)) return;
  add(
    'RULE_2_STRICT_ASSERTION',
    node,
    'Boolean-wrapped equality hides the expected/actual contract; use assert.equal or assert.notEqual',
  );
}

function inspectCacheRead(node, name, text, add) {
  if (!CACHE_READERS.has(name.split('.').at(-1))) return;
  const cachePath = stringLiterals(node).some((value) => (
    /storage[/\\]data[/\\]cache/i.test(value)
  ));
  if (!cachePath || text.includes('audit-ignore-cache')) return;
  add(
    'RULE_4_CACHE_DEPENDENCE',
    node,
    'Test reads gitignored storage/data/cache directly; use tests/fixtures for deterministic inputs',
  );
}

function inspectSilentCatch(node, add) {
  if (!ts.isTryStatement(node) || !containsAssertion(node.tryBlock)) return;
  const catchBlock = node.catchClause?.block;
  if (!catchBlock || catchBlock.statements.length !== 0) return;
  add(
    'RULE_3_SILENT_ERROR_SWALLOWING',
    node,
    'Silent catch block wraps assertions without rethrowing or failing the test',
  );
}

function auditJsSource(content, fileName = 'inline.test.js') {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const violations = [];
  const add = (rule, node, message) => violations.push({
    rule,
    line: lineNumber(sourceFile, node),
    message,
    snippet: sourceSnippet(sourceFile, node),
  });

  function visit(node) {
    const text = sourceFile.getFullText().slice(node.getFullStart(), node.getEnd());
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      inspectMockCall(node, name, text, add);
      inspectStrictAssertion(node, add);
      inspectCacheRead(node, name, text, add);
    }
    inspectLoaderReplacement(node, text, add);
    inspectMalformedLoaderIgnore(node, text, add);
    inspectSilentCatch(node, add);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function stripCppCommentsAndStrings(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function auditCppSource(content) {
  const clean = stripCppCommentsAndStrings(content);
  const violations = [];
  const lines = clean.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (/\bassert\s*\(/.test(lines[index])) {
      violations.push({
        rule: 'RULE_2_CPP_RELEASE_ASSERTION',
        line: index + 1,
        message: 'C++ test uses assert(), which is removed from Release builds by NDEBUG',
        snippet: lines[index].trim(),
      });
    }
  }
  return violations;
}

function auditFile(filePath) {
  const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = filePath.endsWith('.cpp')
    ? auditCppSource(content)
    : auditJsSource(content, relPath);
  return { file: relPath, violations };
}

function collectAuditResults() {
  const jsFiles = listJsTestFiles();
  const cppFiles = listCppTestFiles();
  const results = [...jsFiles, ...cppFiles]
    .map(auditFile)
    .filter((audit) => audit.violations.length > 0);
  return {
    jsFiles,
    cppFiles,
    results,
    totalViolations: results.reduce((sum, audit) => sum + audit.violations.length, 0),
  };
}

function runAudit() {
  let report;
  try {
    report = collectAuditResults();
  } catch (error) {
    console.error(`✘ Test integrity discovery failed: ${error.message}`);
    return 1;
  }
  console.log(
    `[TEST INTEGRITY AUDIT] Scanned ${report.jsFiles.length} JS test/benchmark files `
      + `and ${report.cppFiles.length} registered C++ test files...`,
  );

  if (report.totalViolations === 0) {
    console.log(
      `✔ Test integrity passed: 4 JS rules plus Release-safe assertions in registered C++ tests `
        + `(${report.jsFiles.length + report.cppFiles.length} files, 0 violations).`,
    );
    return 0;
  }

  console.error(
    `✘ Found ${report.totalViolations} test integrity violation(s) across ${report.results.length} file(s):\n`,
  );
  for (const audit of report.results) {
    console.error(`${audit.file}:`);
    for (const violation of audit.violations) {
      console.error(`  [Line ${violation.line}] [${violation.rule}] ${violation.message}`);
      console.error(`    ${violation.snippet}`);
    }
  }
  return 1;
}

if (require.main === module) {
  process.exitCode = runAudit();
}

module.exports = {
  FORBIDDEN_MOCK_TARGETS,
  auditCppSource,
  auditFile,
  auditJsSource,
  changedCppTestFiles,
  collectAuditResults,
  equalityWrappedInBooleanAssertion,
  listCppTestFiles,
  listJsTestFiles,
  runAudit,
  stripCppCommentsAndStrings,
};
