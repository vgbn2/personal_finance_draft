#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const WORKSPACE_MANIFEST_CONTENT = JSON.stringify({
  schema_version: 'sovereign.workspace_manifest/v1',
  entrypoint: 'workspace/BOOTSTRAP.md',
  purpose: 'Operational session continuity, active evidence, handoffs, blockers, and migration lifecycle state.',
  section_roots: [
    'workspace/archive',
    'workspace/artifacts',
    'workspace/checklists',
    'workspace/dev_reviews',
    'workspace/governance',
    'workspace/handoff',
    'workspace/history',
    'workspace/plans',
    'workspace/protocols',
    'workspace/reports',
    'workspace/research',
    'workspace/session_memory'
  ],
  allowed_content: [
    'current anchor and scope',
    'status, owner, blocker, and next action',
    'commands and evidence classification',
    'pending facts awaiting source verification',
    'migration lifecycle and retirement conditions',
    'links to canonical docs, source, tests, issues, or commits'
  ],
  forbidden_canonical_kinds: [
    'algorithm',
    'architecture',
    'module',
    'protocol',
    'structure',
    'topology'
  ],
  promotion_ledger: 'workspace/reports/DOCUMENTATION_KNOWLEDGE_INVENTORY.md'
}, null, 2) + '\n';

const SECTION_ROOTS = [
  'archive',
  'artifacts',
  'checklists',
  'dev_reviews',
  'governance',
  'handoff',
  'history',
  'plans',
  'protocols',
  'reports',
  'research',
  'session_memory'
];

function ensureStorageSkeleton(root = REPO_ROOT) {
  const storageDirs = [
    path.join(root, 'storage', 'data', 'cache'),
    path.join(root, 'storage', 'data', 'ts'),
    path.join(root, 'storage', 'data', 'paper_trading'),
    path.join(root, 'storage', 'models'),
    path.join(root, 'storage', 'backups'),
    path.join(root, 'storage', 'logs'),
    path.join(root, 'storage', 'polymarket'),
    path.join(root, 'storage', 'secrets'),
  ];
  for (const dir of storageDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function ensureWorkspaceSkeleton(root = REPO_ROOT) {
  const wsDir = path.join(root, 'workspace');
  if (!fs.existsSync(wsDir)) {
    fs.mkdirSync(wsDir, { recursive: true });
  }

  const manifestPath = path.join(wsDir, 'workspace_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fs.writeFileSync(manifestPath, WORKSPACE_MANIFEST_CONTENT, 'utf8');
  }

  const bootstrapPath = path.join(wsDir, 'BOOTSTRAP.md');
  if (!fs.existsSync(bootstrapPath)) {
    fs.writeFileSync(bootstrapPath, '# Workspace Bootstrap\n\nLocal developer workspace and session continuity root.\n', 'utf8');
  }

  const statePath = path.join(wsDir, 'STATE.md');
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, '# Current Workspace State\n\n## Current Phase\nInitial Development - ACTIVE\n', 'utf8');
  }

  const devReviewPath = path.join(wsDir, 'DEV_REVIEW.md');
  if (!fs.existsSync(devReviewPath)) {
    fs.writeFileSync(devReviewPath, '# Developer Review Ledger\n', 'utf8');
  }

  const promptLogPath = path.join(wsDir, 'PROMPT_LOG.md');
  if (!fs.existsSync(promptLogPath)) {
    fs.writeFileSync(promptLogPath, '# Prompt Log\n', 'utf8');
  }

  const inventoryPath = path.join(wsDir, 'reports', 'DOCUMENTATION_KNOWLEDGE_INVENTORY.md');
  const inventoryDir = path.dirname(inventoryPath);
  if (!fs.existsSync(inventoryDir)) {
    fs.mkdirSync(inventoryDir, { recursive: true });
  }
  if (!fs.existsSync(inventoryPath)) {
    fs.writeFileSync(inventoryPath, '# Documentation Knowledge Inventory\n', 'utf8');
  }

  const governanceDir = path.join(wsDir, 'governance');
  if (!fs.existsSync(governanceDir)) {
    fs.mkdirSync(governanceDir, { recursive: true });
  }
  const governanceFiles = {
    'CODE_OF_CONDUCT.md': '# Code of Conduct\n\nStandards for respectful collaboration, technical truthfulness, and anti-cheating rules.\n',
    'GOVERNANCE.md': '# Governance\n\nMaintainer roles, core approval boundaries, and consensus procedures.\n',
    'MAINTAINERS.md': '# Maintainers & Subsystem Roster\n\nSubsystem domain ownership and review responsibility.\n',
    'SECURITY.md': '# Security Policy\n\nConfidential vulnerability reporting and credential isolation rules.\n',
    'PROJECT_RULES.md': `# Project Rules

This project follows the GSD methodology and the Sovereign Institutional Engineering Standards.

## Truthfulness And Test Integrity

- **Bounded Context Honesty**: The repository can exceed one agent's context. Build a task-local architecture map.
- **Evidence Honesty**: Never claim a command ran, a test passed, a file was read, a host was checked, or a behavior was proved without direct evidence.
- **No Test Cheating**: Do not weaken assertions, widen tolerances, add skips, delete failing coverage, catch and suppress failures, replace the intended path with a mock, or hardcode fixture/expected values merely to make tests pass.
- **Failure Honesty**: A false green is worse than an explicit failure.
`
  };
  for (const [file, content] of Object.entries(governanceFiles)) {
    const filePath = path.join(governanceDir, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  const protocolsDir = path.join(wsDir, 'protocols');
  if (!fs.existsSync(protocolsDir)) {
    fs.mkdirSync(protocolsDir, { recursive: true });
  }
  const geminiPath = path.join(protocolsDir, 'GEMINI.md');
  if (!fs.existsSync(geminiPath)) {
    fs.writeFileSync(
      geminiPath,
      '# Gemini CLI Compatibility\n\nUse `skills/session-orchestrator/SKILL.md` as the only boot, routing, and closeout workflow.\n',
      'utf8',
    );
  }

  for (const sec of SECTION_ROOTS) {
    const secDir = path.join(wsDir, sec);
    if (!fs.existsSync(secDir)) {
      fs.mkdirSync(secDir, { recursive: true });
    }
    const readmePath = path.join(secDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
      fs.writeFileSync(readmePath, `# ${sec.toUpperCase()}\n\nLocal workspace records for ${sec}.\n`, 'utf8');
    }
  }
}

function ensureAll(root = REPO_ROOT) {
  ensureStorageSkeleton(root);
  ensureWorkspaceSkeleton(root);
}

if (require.main === module) {
  ensureAll();
  console.log('✔ Verified storage and workspace skeleton');
}

module.exports = {
  ensureStorageSkeleton,
  ensureWorkspaceSkeleton,
  ensureAll,
};
