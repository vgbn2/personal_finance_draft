#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAX_PRODUCTION_NESTING = 3;
const PRODUCTION_ROOTS = new Set(['backend', 'shared', 'Frontend', 'scripts']);
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.cpp', '.hpp', '.h']);
const EXCLUDED_SEGMENTS = new Set([
  'test',
  'tests',
  'fixtures',
  'node_modules',
  'build',
  'dist',
  'target',
  'archive',
  'generated',
]);

function normalizePath(relativePath) {
  return String(relativePath).replace(/\\/g, '/').replace(/^\.\//, '');
}

function isProductionSource(relativePath) {
  const normalized = normalizePath(relativePath);
  const segments = normalized.split('/');
  return PRODUCTION_ROOTS.has(segments[0])
    && SOURCE_EXTENSIONS.has(path.extname(normalized))
    && !segments.some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function changedProductionFiles() {
  const result = spawnSync('git', [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...PRODUCTION_ROOTS,
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git status exited ${result.status}`);
  }
  return [...new Set(result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => normalizePath(line.slice(3).trim()))
    .filter(isProductionSource)
    .filter((relativePath) => fs.existsSync(path.join(REPO_ROOT, relativePath))))]
    .sort();
}

function jsScriptKind(fileName) {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node);
}

function isElseIf(node, parent) {
  return ts.isIfStatement(node)
    && ts.isIfStatement(parent)
    && parent.elseStatement === node;
}

function isControlNode(node, parent) {
  if (ts.isIfStatement(node)) return !isElseIf(node, parent);
  return ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || ts.isWhileStatement(node)
    || ts.isDoStatement(node)
    || ts.isSwitchStatement(node)
    || ts.isTryStatement(node)
    || ts.isCatchClause(node);
}

function analyzeJsSource(content, fileName = 'inline.js') {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    jsScriptKind(fileName),
  );
  let maxDepth = 0;
  let deepestLine = 1;
  let deepestKind = 'source';

  function visit(node, depth, parent) {
    const functionDepth = isFunctionLike(node) ? 0 : depth;
    const nextDepth = functionDepth + (isControlNode(node, parent) ? 1 : 0);
    if (nextDepth > maxDepth) {
      maxDepth = nextDepth;
      deepestLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      deepestKind = ts.SyntaxKind[node.kind];
    }
    ts.forEachChild(node, (child) => visit(child, nextDepth, node));
  }

  visit(sourceFile, 0, null);
  return { maxDepth, deepestLine, deepestKind };
}

function stripCppCommentsAndLiterals(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
    .replace(/R"([^ (\\]*)\([\s\S]*?\)\1"/g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/^\s*#.*$/gm, '');
}

function cppControlCount(line) {
  const withoutElseIf = line.replace(/\belse\s+if\b/g, 'else_if');
  return [...withoutElseIf.matchAll(/\b(?:if|for|while|switch|try|catch)\b/g)].length;
}

function updateCppDepth(state, character, lineNumber) {
  if (character === '{') {
    const introduced = state.pendingControls;
    state.pendingControls = 0;
    state.currentDepth += introduced;
    state.blockControlDepths.push(introduced);
  } else if (character === '}') {
    state.currentDepth -= state.blockControlDepths.pop() || 0;
  } else if (character === ';' && state.pendingControls > 0) {
    state.singleStatementControls = state.pendingControls;
    state.currentDepth += state.singleStatementControls;
    state.pendingControls = 0;
  }

  if (state.currentDepth > state.maxDepth) {
    state.maxDepth = state.currentDepth;
    state.deepestLine = lineNumber;
  }
  if (state.singleStatementControls > 0) {
    state.currentDepth -= state.singleStatementControls;
    state.singleStatementControls = 0;
  }
}

function analyzeCppSource(content) {
  const clean = stripCppCommentsAndLiterals(content);
  const lines = clean.split(/\r?\n/);
  const state = {
    blockControlDepths: [],
    pendingControls: 0,
    currentDepth: 0,
    maxDepth: 0,
    deepestLine: 1,
    singleStatementControls: 0,
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    state.pendingControls += cppControlCount(line);
    for (const character of line) updateCppDepth(state, character, index + 1);
  }

  return {
    maxDepth: state.maxDepth,
    deepestLine: state.deepestLine,
    deepestKind: 'cpp-control',
  };
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const extension = path.extname(filePath);
  return ['.cpp', '.hpp', '.h'].includes(extension)
    ? analyzeCppSource(content)
    : analyzeJsSource(content, filePath);
}

function auditChangedProduction() {
  const files = changedProductionFiles();
  const results = files.map((relativePath) => ({
    file: relativePath,
    ...analyzeFile(path.join(REPO_ROOT, relativePath)),
  }));
  const violations = results.filter((result) => result.maxDepth > MAX_PRODUCTION_NESTING);
  return { files, results, violations };
}

function runAudit() {
  let report;
  try {
    report = auditChangedProduction();
  } catch (error) {
    console.error(`Control-flow audit failed to inspect the working tree: ${error.message}`);
    return 2;
  }

  console.log(
    `[CONTROL FLOW AUDIT] Checked ${report.files.length} changed production source files; `
      + `maximum allowed nesting depth is ${MAX_PRODUCTION_NESTING}.`,
  );
  for (const result of report.results) {
    console.log(`  ${result.file}: depth ${result.maxDepth} (line ${result.deepestLine})`);
  }
  if (report.violations.length === 0) {
    console.log('✔ Changed production control flow stays within the depth-3 contract.');
    return 0;
  }

  console.error(`✘ ${report.violations.length} changed production file(s) exceed depth 3:`);
  for (const violation of report.violations) {
    console.error(
      `  ${violation.file}:${violation.deepestLine} reaches depth ${violation.maxDepth} `
        + `(${violation.deepestKind})`,
    );
  }
  return 1;
}

if (require.main === module) {
  process.exitCode = runAudit();
}

module.exports = {
  MAX_PRODUCTION_NESTING,
  analyzeCppSource,
  analyzeFile,
  analyzeJsSource,
  auditChangedProduction,
  changedProductionFiles,
  cppControlCount,
  isProductionSource,
  runAudit,
  stripCppCommentsAndLiterals,
};
