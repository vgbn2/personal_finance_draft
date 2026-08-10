#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOCUMENTATION_MANIFEST = 'docs/documentation_manifest.json';
const WORKSPACE_MANIFEST = 'workspace/workspace_manifest.json';
const ACTIVE_LINK_ROOTS = ['docs'];
const ACTIVE_LINK_PAGES = ['workspace/README.md'];
const HISTORICAL_LINK_ROOTS = ['docs/archive', 'docs/memory', 'workspace'];
const MARKDOWN_LINK_PATTERN = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
const RECORD_HEADINGS = {
  algorithm: [
    'Purpose And Ownership',
    'Inputs And Outputs',
    'Mathematical Definition',
    'Implementation Outline',
    'Preconditions, Invariants, And Postconditions',
    'Complexity',
    'Numerical Behavior',
    'Reference Vectors',
    'Verification And Change Safety',
  ],
  structure: [
    'Identity And Owner',
    'Shape And Field Semantics',
    'State Transitions And Invariants',
    'Producer And Consumer Topology',
    'Persistence And Compatibility',
    'Concurrency And Recovery',
    'Cost Model',
    'Verification',
  ],
  protocol: [
    'Participants, Authority, And Boundary',
    'Message Shapes And Units',
    'Ordering And State Transitions',
    'Success, Error, And Degraded Semantics',
    'Retry, Timeout, Idempotency, And Cancellation',
    'Trust And Compatibility Boundaries',
    'Observability And Recovery',
    'Verification',
  ],
  topology: [
    'Entrypoints',
    'Ownership Flow',
    'Dependency Direction',
    'State, I/O, And Side Effects',
    'Generated Artifacts, Adapters, And Shims',
    'Failure Domains And Recovery Ownership',
    'Verification',
  ],
};

function relative(root, absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, '/');
}

function finding(rule, file, message, severity = 'error') {
  return { rule, file, message, severity };
}

function readJson(root, relativePath, findings) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    findings.push(finding('DOC-JSON', relativePath, `cannot parse JSON: ${error.message}`));
    return null;
  }
}

function walkFiles(root, relativeRoot, predicate = () => true) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && predicate(absolute)) files.push(absolute);
    }
  }

  walk(absoluteRoot);
  return files.sort();
}

function isHistoricalLinkPath(recordPath) {
  return HISTORICAL_LINK_ROOTS.some((root) => recordPath === root || recordPath.startsWith(`${root}/`));
}

function activeMarkdownFiles(root) {
  const files = ACTIVE_LINK_ROOTS.flatMap((linkRoot) => (
    walkFiles(root, linkRoot, (filePath) => filePath.endsWith('.md'))
  ));
  for (const page of ACTIVE_LINK_PAGES) {
    const absolutePath = path.join(root, page);
    if (fs.existsSync(absolutePath)) files.push(absolutePath);
  }
  const activePages = new Set(ACTIVE_LINK_PAGES);
  return files
    .filter((absolutePath) => {
      const recordPath = relative(root, absolutePath);
      return activePages.has(recordPath) || !isHistoricalLinkPath(recordPath);
    })
    .sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

function localMarkdownTarget(rawTarget) {
  const target = String(rawTarget || '').trim();
  if (!target || target.startsWith('#')) return { kind: 'skip' };
  if (/^(https?:|mailto:)/i.test(target)) return { kind: 'skip' };
  if (/^file:/i.test(target)) return { kind: 'file-uri', target };
  const pathTarget = target.split('#', 1)[0].split(/\s+/, 1)[0].replace(/^<|>$/g, '');
  if (!pathTarget) return { kind: 'skip' };
  if (path.isAbsolute(pathTarget) || /^[a-zA-Z]:[\\/]/.test(pathTarget)) {
    return { kind: 'absolute', target };
  }
  return { kind: 'local', target: pathTarget };
}

function validateActiveMarkdownLinks(root, findings) {
  for (const absolutePath of activeMarkdownFiles(root)) {
    const recordPath = relative(root, absolutePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
      const link = localMarkdownTarget(match[1]);
      if (link.kind === 'skip') continue;
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      if (link.kind === 'file-uri' || link.kind === 'absolute') {
        findings.push(finding('DOC-LINK-ABSOLUTE', recordPath, `active documentation link must be repository-relative: ${link.target}`));
        continue;
      }
      const resolved = path.resolve(path.dirname(absolutePath), link.target);
      if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
        findings.push(finding('DOC-LINK-OUTSIDE', recordPath, `active documentation link escapes repository: ${link.target}`));
      } else if (!fs.existsSync(resolved)) {
        findings.push(finding('DOC-LINK-MISSING', recordPath, `active documentation link target does not exist: ${link.target}`));
      }
    }
  }
}

function parseAtlasFrontmatter(content) {
  const block = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!block) return null;

  const metadata = {
    sourcePaths: [],
    sourceSymbols: [],
    testPaths: [],
    docsPaths: [],
    reviewTriggers: [],
    frontmatterEnd: block[0].length,
  };
  let section = null;
  let ownerGroup = null;

  for (const line of block[1].split(/\r?\n/)) {
    const topLevel = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
    if (topLevel) {
      section = topLevel[1];
      ownerGroup = null;
      if (topLevel[2]) metadata[section] = topLevel[2];
      continue;
    }

    if (section === 'owners') {
      const group = line.match(/^  (source|tests|docs):\s*$/);
      if (group) {
        ownerGroup = group[1];
        continue;
      }
      const sourcePath = line.match(/^    - path:\s*(.+?)\s*$/);
      if (ownerGroup === 'source' && sourcePath) {
        metadata.sourcePaths.push(sourcePath[1]);
        continue;
      }
      const sourceSymbol = line.match(/^      symbol:\s*(.+?)\s*$/);
      if (ownerGroup === 'source' && sourceSymbol) {
        metadata.sourceSymbols.push(sourceSymbol[1]);
        continue;
      }
      const ownerPath = line.match(/^    -\s+(.+?)\s*$/);
      if (ownerGroup === 'tests' && ownerPath) metadata.testPaths.push(ownerPath[1]);
      if (ownerGroup === 'docs' && ownerPath) metadata.docsPaths.push(ownerPath[1]);
      continue;
    }

    if (section === 'review_triggers') {
      const trigger = line.match(/^  -\s+(.+?)\s*$/);
      if (trigger) metadata.reviewTriggers.push(trigger[1]);
      continue;
    }

    if (section === 'last_verified') {
      const value = line.match(/^  ([a-z_]+):\s*(.+?)\s*$/);
      if (value) {
        const key = value[1] === 'base_commit' ? 'baseCommit' : value[1];
        metadata[key] = value[2];
      }
    }
  }

  return metadata;
}

function checkPath(root, ownerPath, recordPath, rule, findings) {
  if (!ownerPath || ownerPath.includes('<') || path.isAbsolute(ownerPath) || ownerPath.includes('..')) {
    findings.push(finding(rule, recordPath, `invalid repository-relative owner path: ${ownerPath || '<missing>'}`));
    return;
  }
  if (!fs.existsSync(path.join(root, ownerPath))) {
    findings.push(finding(rule, recordPath, `owner path does not exist: ${ownerPath}`));
  }
}

function validateAtlasRecord(root, manifest, absolutePath, ids, findings, registeredRecords) {
  const recordPath = relative(root, absolutePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const metadata = parseAtlasFrontmatter(content);
  if (!metadata) {
    findings.push(finding('DOC-ATLAS-FRONTMATTER', recordPath, 'Atlas record must start with YAML frontmatter'));
    return;
  }

  const expectedKind = Object.entries(manifest.atlas.record_roots)
    .find(([, recordRoot]) => recordPath.startsWith(`${recordRoot}/`))?.[0];
  const idPattern = new RegExp(manifest.atlas.id_pattern);
  if (!metadata.id || !idPattern.test(metadata.id)) {
    findings.push(finding('DOC-ATLAS-ID', recordPath, `invalid Atlas id: ${metadata.id || '<missing>'}`));
  } else if (ids.has(metadata.id)) {
    findings.push(finding('DOC-ATLAS-ID', recordPath, `duplicate Atlas id also used by ${ids.get(metadata.id)}`));
  } else {
    ids.set(metadata.id, recordPath);
  }

  const registration = registeredRecords.get(recordPath);
  if (!registration) {
    findings.push(finding('DOC-ATLAS-MANIFEST', recordPath, 'Atlas record is not registered in the documentation manifest'));
  } else {
    if (registration.id !== metadata.id) {
      findings.push(finding('DOC-ATLAS-MANIFEST', recordPath, `manifest id ${registration.id || '<missing>'} does not match ${metadata.id || '<missing>'}`));
    }
    if (registration.kind !== metadata.kind) {
      findings.push(finding('DOC-ATLAS-MANIFEST', recordPath, `manifest kind ${registration.kind || '<missing>'} does not match ${metadata.kind || '<missing>'}`));
    }
  }

  if (metadata.kind !== expectedKind || !RECORD_HEADINGS[metadata.kind]) {
    findings.push(finding('DOC-ATLAS-KIND', recordPath, `kind ${metadata.kind || '<missing>'} does not match ${expectedKind}`));
    return;
  }
  if (!metadata.title || metadata.title.includes('<')) {
    findings.push(finding('DOC-ATLAS-TITLE', recordPath, 'record requires a concrete title'));
  }
  if (!['current', 'historical'].includes(metadata.status)) {
    findings.push(finding('DOC-ATLAS-STATUS', recordPath, `invalid status: ${metadata.status || '<missing>'}`));
  }

  if (metadata.status === 'current') {
    if (metadata.sourcePaths.length === 0 || metadata.testPaths.length === 0 || metadata.docsPaths.length === 0) {
      findings.push(finding('DOC-ATLAS-OWNERS', recordPath, 'current record requires source, test, and module-doc owners'));
    }
    if (metadata.sourceSymbols.length < metadata.sourcePaths.length) {
      findings.push(finding('DOC-ATLAS-SYMBOL', recordPath, 'each current source owner requires a symbol'));
    }
  } else if (!/^> \*\*Historical — non-authoritative:/m.test(content.slice(metadata.frontmatterEnd))) {
    findings.push(finding('DOC-ATLAS-HISTORICAL', recordPath, 'historical record requires a visible non-authoritative banner'));
  }

  for (const ownerPath of [...metadata.sourcePaths, ...metadata.testPaths, ...metadata.docsPaths]) {
    checkPath(root, ownerPath, recordPath, 'DOC-ATLAS-PATH', findings);
  }
  if (metadata.reviewTriggers.length === 0) {
    findings.push(finding('DOC-ATLAS-TRIGGER', recordPath, 'record requires at least one review trigger'));
  }
  if (!metadata.revision || !metadata.method) {
    findings.push(finding('DOC-ATLAS-VERIFIED', recordPath, 'last_verified requires revision and method'));
  }
  if (metadata.revision === manifest.atlas.working_tree_revision && !metadata.baseCommit) {
    findings.push(finding('DOC-ATLAS-VERIFIED', recordPath, 'working-tree verification requires base_commit'));
  }

  for (const heading of RECORD_HEADINGS[metadata.kind]) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = content.match(new RegExp(`^## ${escaped}\\s*$`, 'gm')) || [];
    if (matches.length !== 1) {
      findings.push(finding('DOC-ATLAS-HEADING', recordPath, `expected exactly one "## ${heading}" heading`));
    }
  }
}

function validateDocumentationManifest(root, manifest, findings) {
  if (manifest.schema_version !== 'sovereign.documentation_manifest/v1') {
    findings.push(finding('DOC-MANIFEST-SCHEMA', DOCUMENTATION_MANIFEST, 'unsupported schema_version'));
  }
  const sectionRoots = manifest.section_roots || [];
  for (const sectionRoot of sectionRoots) {
    checkPath(root, `${sectionRoot}/README.md`, DOCUMENTATION_MANIFEST, 'DOC-SECTION-INDEX', findings);
  }

  const documentPaths = new Set();
  for (const document of manifest.documents || []) {
    if (documentPaths.has(document.path)) {
      findings.push(finding('DOC-MANIFEST-DUPLICATE', DOCUMENTATION_MANIFEST, `duplicate document path: ${document.path}`));
    }
    documentPaths.add(document.path);
    checkPath(root, document.path, DOCUMENTATION_MANIFEST, 'DOC-MANIFEST-PATH', findings);
    for (const sourcePath of document.source_paths || []) {
      if (sourcePath === 'workspace' || sourcePath.startsWith('workspace/')) {
        findings.push(finding('DOC-WORKSPACE-OWNER', document.path, `canonical source cannot be workspace: ${sourcePath}`));
      } else {
        checkPath(root, sourcePath, document.path, 'DOC-MANIFEST-SOURCE', findings);
      }
    }
    for (const testPath of document.test_paths || []) {
      checkPath(root, testPath, document.path, 'DOC-MANIFEST-TEST', findings);
    }
  }

  const registeredAtlasIds = new Set(
    (manifest.documents || [])
      .filter((document) => document.type === 'atlas' && document.id)
      .map((document) => document.id),
  );
  for (const document of manifest.documents || []) {
    for (const atlasId of document.atlas_ids || []) {
      if (!registeredAtlasIds.has(atlasId)) {
        findings.push(finding('DOC-MANIFEST-ATLAS', document.path, `unknown Atlas id: ${atlasId}`));
      }
    }
  }
}

function validateWorkspace(root, workspaceManifest, findings) {
  if (workspaceManifest.schema_version !== 'sovereign.workspace_manifest/v1') {
    findings.push(finding('DOC-WORKSPACE-SCHEMA', WORKSPACE_MANIFEST, 'unsupported schema_version'));
  }
  checkPath(root, workspaceManifest.entrypoint, WORKSPACE_MANIFEST, 'DOC-WORKSPACE-PATH', findings);
  checkPath(root, workspaceManifest.promotion_ledger, WORKSPACE_MANIFEST, 'DOC-WORKSPACE-PATH', findings);
  for (const sectionRoot of workspaceManifest.section_roots || []) {
    checkPath(root, sectionRoot, WORKSPACE_MANIFEST, 'DOC-WORKSPACE-PATH', findings);
    checkPath(root, `${sectionRoot}/README.md`, WORKSPACE_MANIFEST, 'DOC-WORKSPACE-INDEX', findings);
  }

  for (const absolutePath of walkFiles(root, 'workspace', (filePath) => filePath.endsWith('.md'))) {
    const content = fs.readFileSync(absolutePath, 'utf8');
    if (/^---\r?\n[\s\S]*?^kind:\s*(algorithm|structure|protocol|topology)\s*$/m.test(content)) {
      findings.push(finding('DOC-WORKSPACE-CANONICAL', relative(root, absolutePath), 'workspace must not define Atlas records'));
    }
  }
}

function auditDocumentation(options = {}) {
  const root = options.root || REPO_ROOT;
  const findings = [];
  const manifest = readJson(root, DOCUMENTATION_MANIFEST, findings);
  const workspaceManifest = readJson(root, WORKSPACE_MANIFEST, findings);
  if (!manifest || !workspaceManifest) return findings;

  validateDocumentationManifest(root, manifest, findings);
  validateWorkspace(root, workspaceManifest, findings);
  validateActiveMarkdownLinks(root, findings);

  const ids = new Map();
  const registeredRecords = new Map(
    (manifest.documents || [])
      .filter((document) => document.type === 'atlas')
      .map((document) => [document.path, document]),
  );
  const recordRoots = Object.values(manifest.atlas?.record_roots || {});
  for (const recordRoot of recordRoots) {
    for (const absolutePath of walkFiles(root, recordRoot, (filePath) => {
      const name = path.basename(filePath);
      return filePath.endsWith('.md') && name !== 'README.md' && name !== 'TEMPLATE.md';
    })) {
      validateAtlasRecord(root, manifest, absolutePath, ids, findings, registeredRecords);
    }
  }
  for (const registeredPath of registeredRecords.keys()) {
    if (!fs.existsSync(path.join(root, registeredPath))) {
      findings.push(finding('DOC-ATLAS-MANIFEST', registeredPath, 'registered Atlas record does not exist'));
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
}

function main() {
  const findings = auditDocumentation();
  if (findings.length > 0) {
    for (const item of findings) {
      console.error(`${item.severity.toUpperCase()} ${item.rule} ${item.file}: ${item.message}`);
    }
    process.exit(1);
  }
  console.log('Documentation audit passed: trees, manifests, owners, and Atlas records are consistent.');
}

if (require.main === module) main();

module.exports = {
  DOCUMENTATION_MANIFEST,
  RECORD_HEADINGS,
  WORKSPACE_MANIFEST,
  auditDocumentation,
  parseAtlasFrontmatter,
};
