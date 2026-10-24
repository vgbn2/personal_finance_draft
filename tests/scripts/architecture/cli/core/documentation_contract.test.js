'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  auditDocumentation,
  parseAtlasFrontmatter,
} = require('../../../../../scripts/dev/audit_documentation.js');
const {
  analyzeDocs,
  KNOWN_FENCE_LANGS,
} = require('../../../../../scripts/dev/filter_docs.js');

function write(root, relativePath, content = '# Fixture\n') {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function validRecord(overrides = {}) {
  const id = overrides.id || 'atlas.algorithm.docs.term-frequency';
  const kind = overrides.kind || 'algorithm';
  const sourcePath = overrides.sourcePath || 'shared/source.js';
  const testPath = overrides.testPath || 'tests/source.test.js';
  const docsPath = overrides.docsPath || 'docs/modules/docs-retrieval.md';
  return `---
id: ${id}
kind: ${kind}
title: Term Frequency
status: current
owners:
  source:
    - path: ${sourcePath}
      symbol: buildIndex
  tests:
    - ${testPath}
  docs:
    - ${docsPath}
review_triggers:
  - algorithm-contract-change
last_verified:
  revision: working-tree
  base_commit: 01234567
  method: source-and-test-review
---

# Term Frequency

## Purpose And Ownership

Purpose.

## Inputs And Outputs

Inputs.

## Mathematical Definition

Definition.

## Implementation Outline

Outline.

## Preconditions, Invariants, And Postconditions

Invariants.

## Complexity

Complexity.

## Numerical Behavior

Behavior.

## Reference Vectors

Vectors.

## Verification And Change Safety

Verification.
`;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'documentation-contract-'));
  const sectionRoots = [
    'docs/atlas',
    'docs/atlas/algorithms',
    'docs/atlas/structures',
    'docs/atlas/protocols',
    'docs/atlas/topology',
    'docs/modules',
  ];
  for (const sectionRoot of sectionRoots) write(root, `${sectionRoot}/README.md`);
  for (const workspaceRoot of ['workspace/reports', 'workspace/handoff']) {
    write(root, `${workspaceRoot}/README.md`);
  }
  write(root, 'workspace/BOOTSTRAP.md');
  write(root, 'workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md');
  write(root, 'shared/source.js', 'function buildIndex() {}\n');
  write(root, 'tests/source.test.js');
  write(root, 'docs/modules/docs-retrieval.md');
  write(root, 'docs/atlas/algorithms/term-frequency.md', validRecord());
  write(root, 'docs/documentation_manifest.json', JSON.stringify({
    schema_version: 'sovereign.documentation_manifest/v1',
    default_corpus: 'canonical',
    section_roots: ['docs/atlas', 'docs/modules'],
    atlas: {
      record_roots: {
        algorithm: 'docs/atlas/algorithms',
        structure: 'docs/atlas/structures',
        protocol: 'docs/atlas/protocols',
        topology: 'docs/atlas/topology',
      },
      id_pattern: '^atlas\\.(algorithm|structure|protocol|topology)\\.[a-z0-9-]+(?:\\.[a-z0-9-]+)+$',
      working_tree_revision: 'working-tree',
    },
    documents: [
      {
        path: 'docs/modules/docs-retrieval.md',
        source_paths: ['shared/source.js'],
      },
      {
        path: 'docs/atlas/algorithms/term-frequency.md',
        type: 'atlas',
        id: 'atlas.algorithm.docs.term-frequency',
        kind: 'algorithm',
        source_paths: ['shared/source.js'],
      },
    ],
  }, null, 2));
  write(root, 'workspace/workspace_manifest.json', JSON.stringify({
    schema_version: 'sovereign.workspace_manifest/v1',
    entrypoint: 'workspace/BOOTSTRAP.md',
    section_roots: ['workspace/reports', 'workspace/handoff'],
    promotion_ledger: 'workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md',
  }, null, 2));
  return root;
}

test('live repository documentation audit passes', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const result = spawnSync('node', ['scripts/dev/audit_documentation.js'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('Atlas frontmatter parser reads typed owners and working-tree evidence', () => {
  const metadata = parseAtlasFrontmatter(validRecord());
  assert.equal(metadata.id, 'atlas.algorithm.docs.term-frequency');
  assert.equal(metadata.kind, 'algorithm');
  assert.deepEqual(metadata.sourcePaths, ['shared/source.js']);
  assert.deepEqual(metadata.sourceSymbols, ['buildIndex']);
  assert.deepEqual(metadata.testPaths, ['tests/source.test.js']);
  assert.deepEqual(metadata.docsPaths, ['docs/modules/docs-retrieval.md']);
  assert.equal(metadata.revision, 'working-tree');
  assert.equal(metadata.baseCommit, '01234567');
});

test('documentation audit accepts a complete separated-tree fixture', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(auditDocumentation({ root }), []);
});

test('documentation audit validates active local Markdown links but preserves historical file URI evidence', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/guide/active.md', '[module](../modules/docs-retrieval.md)\n');
  write(root, 'workspace/history/evidence.md', '[old host](file:///C:/legacy/source.js)\n');

  assert.deepEqual(auditDocumentation({ root }), []);
});

test('documentation audit rejects missing and absolute active Markdown links', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/guide/bad.md', [
    '[missing](../modules/missing.md)',
    '[machine](C:/Users/legacy/docs.md)',
  ].join('\n'));

  const findings = auditDocumentation({ root });
  assert.ok(findings.some((item) => item.rule === 'DOC-LINK-MISSING'));
  assert.ok(findings.some((item) => item.rule === 'DOC-LINK-ABSOLUTE'));
});

test('documentation audit rejects duplicate ids and broken current owners', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/atlas/algorithms/duplicate.md', validRecord({
    sourcePath: 'shared/missing.js',
    testPath: 'tests/missing.test.js',
  }));

  const findings = auditDocumentation({ root });
  assert.ok(findings.some((item) => item.rule === 'DOC-ATLAS-ID'));
  assert.ok(findings.some((item) => item.rule === 'DOC-ATLAS-PATH' && item.message.includes('shared/missing.js')));
  assert.ok(findings.some((item) => item.rule === 'DOC-ATLAS-PATH' && item.message.includes('tests/missing.test.js')));
});

test('documentation audit rejects Atlas records under workspace', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'workspace/reports/canonical-algorithm.md', validRecord());

  const findings = auditDocumentation({ root });
  assert.ok(findings.some((item) => item.rule === 'DOC-WORKSPACE-CANONICAL'));
});

test('documentation audit rejects record kind outside its owning Atlas section', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/atlas/algorithms/term-frequency.md', validRecord({
    id: 'atlas.protocol.docs.term-frequency',
    kind: 'protocol',
  }));

  const findings = auditDocumentation({ root });
  assert.ok(findings.some((item) => item.rule === 'DOC-ATLAS-KIND'));
  assert.ok(findings.some((item) => item.rule === 'DOC-ATLAS-MANIFEST'));
});

test('documentation audit rejects unregistered Atlas records', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/atlas/algorithms/unregistered.md', validRecord({
    id: 'atlas.algorithm.docs.unregistered',
  }));

  const findings = auditDocumentation({ root });
  assert.ok(findings.some((item) => item.rule === 'DOC-ATLAS-MANIFEST' && item.file.endsWith('unregistered.md')));
});

test('filter_docs rejects unknown fence language tags', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/tutorials/bad_fence.md', [
    '# Bad Fence Tutorial',
    '```unknownlang',
    'const x = 1;',
    '```',
  ].join('\n'));

  const results = analyzeDocs({ repoRoot: root });
  assert.equal(results.badFenceLangs.length, 1);
  assert.equal(results.badFenceLangs[0].lang, 'unknownlang');
});

test('filter_docs rejects bare code fences without language tags', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/tutorials/bare_fence.md', [
    '# Bare Fence Tutorial',
    '```',
    'echo "hello"',
    '```',
  ].join('\n'));

  const results = analyzeDocs({ repoRoot: root });
  assert.equal(results.badFenceLangs.length, 1);
  assert.equal(results.badFenceLangs[0].lang, '(none)');
});

test('filter_docs accepts all known fence languages', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const validFences = [
    '# Multi Language Tutorial',
    '```bash',
    'npm test',
    '```',
    '```json',
    '{"ok": true}',
    '```',
    '```cpp',
    'int main() { return 0; }',
    '```',
    '```mermaid',
    'graph TD; A-->B;',
    '```',
  ].join('\n');
  write(root, 'docs/tutorials/valid_fences.md', validFences);

  const results = analyzeDocs({ repoRoot: root });
  assert.equal(results.badFenceLangs.length, 0);
  assert.ok(KNOWN_FENCE_LANGS.has('bash'));
  assert.ok(KNOWN_FENCE_LANGS.has('json'));
  assert.ok(KNOWN_FENCE_LANGS.has('cpp'));
  assert.ok(KNOWN_FENCE_LANGS.has('go'));
  assert.ok(KNOWN_FENCE_LANGS.has('mermaid'));
});

test('master architecture report is registered and starts with a newcomer-safe reading path', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const reportPath = 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.md';
  const report = fs.readFileSync(path.join(repoRoot, reportPath), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/documentation_manifest.json'), 'utf8'));
  const mkdocs = fs.readFileSync(path.join(repoRoot, 'mkdocs.yml'), 'utf8');

  const record = manifest.documents.find((document) => document.path === reportPath);
  assert.ok(record, 'master report must be registered in the documentation manifest');
  assert.equal(record.status, 'canonical');
  assert.equal(record.owner, 'architecture');
  assert.match(mkdocs, /End-to-End Architecture Report: Reports\/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT\.md/);

  for (const heading of [
    '## Table of Contents',
    '## Executive Summary',
    '## Chapter 1. Introduction, Problem Statement & Market Invariants',
    '## Appendix A. Operational Runbook: Bare-Metal Cold Disaster Recovery',
    '## Appendix B. Complete Platform Mathematical Invariants & Verification Matrix',
  ]) {
    assert.ok(report.includes(heading), `missing canonical section heading: ${heading}`);
  }
});

test('master architecture report uses pinned, scoped and print-safe visual assets', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const mkdocs = fs.readFileSync(path.join(repoRoot, 'mkdocs.yml'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const css = fs.readFileSync(path.join(repoRoot, 'docs/stylesheets/architecture-report.css'), 'utf8');
  const javascript = fs.readFileSync(path.join(repoRoot, 'docs/javascripts/mermaid-report.js'), 'utf8');

  assert.match(mkdocs, /cdn\.jsdelivr\.net\/npm\/mermaid@11\.17\.2\/dist\/mermaid\.min\.js/);
  assert.match(mkdocs, /stylesheets\/architecture-report\.css/);
  assert.match(mkdocs, /javascripts\/mermaid-report\.js/);
  assert.match(packageJson.scripts['docs:build'], /mkdocs-material@sha256:[a-f0-9]{64}/);
  assert.match(css, /\.architecture-report-page/);
  assert.match(css, /@page\s*{[\s\S]*size:\s*A4 portrait/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(javascript, /SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT/);
  assert.match(javascript, /securityLevel:\s*'strict'/);
});

test('architecture report PDF verification passes and detects input drift', (t) => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const { verifyReportPdf } = require(path.join(repoRoot, 'scripts/dev/verify_architecture_report_pdf.js'));

  // 1. Current repo state passes verification
  const currentResult = verifyReportPdf({ root: repoRoot });
  assert.equal(currentResult.ok, true, `Verification must pass on current repository state: ${currentResult.errors?.join('; ')}`);
  assert.ok(currentResult.pageCount >= 20, `Page count must be >= 20, got ${currentResult.pageCount}`);

  // 2. Drift detection: simulated manifest with tampered hash
  const manifestPath = path.join(repoRoot, 'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.pdf.manifest.json');
  const originalManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-drift-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const tamperedManifest = {
    ...originalManifest,
    inputs: {
      ...originalManifest.inputs,
      'docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.md': '0000000000000000000000000000000000000000000000000000000000000000',
    },
  };
  const tempManifestPath = path.join(tempDir, 'manifest.json');
  fs.writeFileSync(tempManifestPath, JSON.stringify(tamperedManifest, null, 2));

  const driftResult = verifyReportPdf({
    root: repoRoot,
    manifestPath: tempManifestPath,
  });
  assert.equal(driftResult.ok, false, 'Must fail when an input hash has drifted');
  assert.ok(driftResult.errors.some((e) => e.includes('Input drifted: docs/Reports/SOVEREIGN_END_TO_END_ARCHITECTURE_REPORT.md')));
});

test('sovereign technical manual and cybersecurity specification is registered and conforms to ST typography contracts', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const manualPath = 'docs/Reports/SOVEREIGN_TECHNICAL_MANUAL_AND_CYBERSECURITY_SPECIFICATION.md';
  const manual = fs.readFileSync(path.join(repoRoot, manualPath), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/documentation_manifest.json'), 'utf8'));
  const mkdocs = fs.readFileSync(path.join(repoRoot, 'mkdocs.yml'), 'utf8');
  const css = fs.readFileSync(path.join(repoRoot, 'docs/stylesheets/architecture-report.css'), 'utf8');
  const pdfScript = fs.readFileSync(path.join(repoRoot, 'scripts/dev/build_technical_manual_pdf.js'), 'utf8');

  // Registration contracts
  const record = manifest.documents.find((document) => document.path === manualPath);
  assert.ok(record, 'technical manual must be registered in the documentation manifest');
  assert.equal(record.status, 'canonical');
  assert.equal(record.owner, 'architecture');
  assert.match(mkdocs, /Technical Manual & Cybersecurity Specification: Reports\/SOVEREIGN_TECHNICAL_MANUAL_AND_CYBERSECURITY_SPECIFICATION\.md/);

  // Content structure contracts
  for (const heading of [
    '# SOVEREIGN TRADING PLATFORM',
    '<div class="stm32-toc-title">Contents</div>',
    '## Executive Summary & Document Control',
    '# 1. Introduction & Executive Summary',
    '# 2. System Architecture & Component Design',
    '# 10. Appendix & Related Documents',
  ]) {
    assert.ok(manual.includes(heading), `missing canonical section heading: ${heading}`);
  }

  // ST typography and print layout contracts
  assert.match(css, /font-family:\s*Helvetica,\s*Arial,\s*"Liberation Sans",\s*sans-serif\s*!important;/);
  assert.match(css, /\.architecture-report-page table tr:nth-child\(even\) td/);
  assert.match(css, /\.architecture-report-page \.stm32-toc-wrapper/);
  assert.match(pdfScript, /displayHeaderFooter:\s*true/);
  assert.match(pdfScript, /SOVEREIGN TECHNICAL MANUAL/);
  assert.match(pdfScript, /SV-TM-001/);
});

