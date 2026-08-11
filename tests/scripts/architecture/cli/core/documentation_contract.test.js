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
