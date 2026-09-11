#!/usr/bin/env node
'use strict';

// scripts/dev/filter_docs.js
// Standalone documentation filter, health scorecard, and zero-tolerance CI gate.
// ponytail: stdlib only (node:fs, node:path), zero dependencies.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');
const MANIFEST_PATH = path.join(DOCS_ROOT, 'documentation_manifest.json');

const STALE_PATTERNS = [
  { pattern: /codebase_org\.md/, label: 'deleted file: codebase_org.md' },
  { pattern: /backend\/core\/src\/wealth\//, label: 'deleted path: backend/core/src/wealth/' },
  { pattern: /deployment\/(heroku|kubernetes|terraform)/, label: 'phantom path: deployment/{heroku,k8s,terraform}' },
  { pattern: /frontend_prompt\.md/, label: 'deleted prototype: frontend_prompt.md' },
  { pattern: /legacy_math\.md/, label: 'deleted prototype: legacy_math.md' },
];

const BOX_BORDER_REGEX = /^\s*(\+[-=]{4,}\+|[┌+][─═]{4,}[┐+]|\|[\s\S]*\|)\s*$/;
const BOX_LINE_MIN_LEN = 80;

function parseArgs(argv) {
  const options = {
    uncataloged: false,
    stale: false,
    deadLinks: false,
    diagrams: false,
    type: null,
    status: null,
    pathPrefix: null,
    json: false,
    summary: false,
    strict: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--uncataloged') options.uncataloged = true;
    else if (arg === '--stale') options.stale = true;
    else if (arg === '--dead-links') options.deadLinks = true;
    else if (arg === '--diagrams') options.diagrams = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--summary') options.summary = true;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--type' && i + 1 < argv.length) options.type = argv[++i];
    else if (arg === '--status' && i + 1 < argv.length) options.status = argv[++i];
    else if (arg === '--path' && i + 1 < argv.length) options.pathPrefix = argv[++i];
    else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  // If no specific filter flag is passed, default to summary mode
  if (!options.uncataloged && !options.stale && !options.deadLinks && !options.diagrams && !options.strict && !options.json) {
    options.summary = true;
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: node scripts/dev/filter_docs.js [options]

Options:
  --summary       Print aggregated documentation health scorecard (default)
  --uncataloged   List active markdown files missing from documentation_manifest.json
  --stale         Scan for references to deleted or phantom paths
  --dead-links    Validate all relative markdown links
  --diagrams      Flag ASCII box-art diagrams (>80 cols or box borders)
  --type <type>   Filter manifest documents by Diataxis type
  --status <s>    Filter manifest documents by status (canonical, supporting, etc.)
  --path <prefix> Filter documents by path prefix (e.g. docs/engineering/specs)
  --json          Output structured JSON payload
  --strict        Zero-tolerance CI gate (exit 1 on ANY defect)
`);
}

function findMarkdownFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findMarkdownFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function classifyQuadrant(relPath) {
  if (relPath.startsWith('docs/archive/') || relPath.startsWith('docs/memory/') || relPath.startsWith('docs/guide/')) {
    return 'Archive / Historical';
  }
  if (relPath.startsWith('docs/codebase_tour/')) {
    return 'Quadrant 1: Tutorials & Tours';
  }
  if (relPath.startsWith('docs/operational/') || relPath.includes('RUNBOOK') || relPath.includes('QUICKSTART') || relPath.includes('CONTRIBUTING')) {
    return 'Quadrant 2: How-To Guides & Runbooks';
  }
  if (relPath.startsWith('docs/engineering/specs/') || relPath.startsWith('docs/sections/') || relPath.startsWith('docs/reference/') || relPath.startsWith('docs/atlas/')) {
    return 'Quadrant 3: Reference & Specifications';
  }
  if (relPath.startsWith('docs/engineering/architecture/') || relPath === 'docs/ARCHITECTURE.md') {
    return 'Quadrant 4: Explanation & Architecture';
  }
  return 'General / Orientation';
}

function analyzeDocs(options) {
  let manifest = { documents: [] };
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch {
      manifest = { documents: [] };
    }
  }

  const catalogedSet = new Set(manifest.documents.map(d => d.path.replaceAll('\\', '/')));
  const allMdFiles = findMarkdownFiles(DOCS_ROOT);

  // Also include root README if present
  const rootReadme = path.join(REPO_ROOT, 'README.md');
  if (fs.existsSync(rootReadme)) {
    allMdFiles.unshift(rootReadme);
  }

  const results = {
    totalFiles: 0,
    quadrants: {},
    uncataloged: [],
    stale: [],
    deadLinks: [],
    diagrams: [],
  };

  for (const fullPath of allMdFiles) {
    const relPath = path.relative(REPO_ROOT, fullPath).replaceAll('\\', '/');

    if (options.pathPrefix && !relPath.startsWith(options.pathPrefix)) {
      continue;
    }

    results.totalFiles++;
    const quad = classifyQuadrant(relPath);
    if (!results.quadrants[quad]) {
      results.quadrants[quad] = { files: 0, defects: 0 };
    }
    results.quadrants[quad].files++;

    // 1. Uncataloged check (skip archive / memory / historical corpus)
    const historicalRoots = manifest.historical_corpus?.roots || ['docs/archive', 'docs/memory', 'docs/guide'];
    const isArchived = historicalRoots.some(r => relPath === r || relPath.startsWith(r + '/'));
    if (!isArchived && !catalogedSet.has(relPath)) {
      results.uncataloged.push(relPath);
      results.quadrants[quad].defects++;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    // 2. Stale path references check
    for (let lineNum = 1; lineNum <= lines.length; lineNum++) {
      const line = lines[lineNum - 1];
      for (const sp of STALE_PATTERNS) {
        if (sp.pattern.test(line)) {
          results.stale.push({
            file: relPath,
            line: lineNum,
            issue: sp.label,
            snippet: line.trim().slice(0, 100),
          });
          results.quadrants[quad].defects++;
        }
      }
    }

    // 3. Dead relative link check
    const linkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    const fileDir = path.dirname(fullPath);

    while ((match = linkRegex.exec(content)) !== null) {
      let target = match[2].trim();
      if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('#')) {
        continue;
      }
      // Strip anchor and search params
      target = target.split('#')[0].split('?')[0];
      if (!target) continue;

      let resolved;
      if (target.startsWith('/')) {
        resolved = path.join(REPO_ROOT, target);
      } else {
        resolved = path.resolve(fileDir, target);
      }

      if (!fs.existsSync(resolved)) {
        results.deadLinks.push({
          file: relPath,
          target: match[2],
          resolved: path.relative(REPO_ROOT, resolved).replaceAll('\\', '/'),
        });
        results.quadrants[quad].defects++;
      }
    }

    // 4. ASCII box-art diagram check
    let inCodeBlock = false;
    let blockLang = '';
    let boxLineStreak = 0;
    let maxBlockWidth = 0;
    let blockStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          blockLang = line.trim().slice(3).trim().toLowerCase();
          boxLineStreak = 0;
          maxBlockWidth = 0;
          blockStartLine = i + 1;
        } else {
          // Block ends
          if (blockLang !== 'mermaid' && (boxLineStreak >= 3 || (maxBlockWidth >= BOX_LINE_MIN_LEN && boxLineStreak >= 1))) {
            results.diagrams.push({
              file: relPath,
              line: blockStartLine,
              lang: blockLang || 'text',
              maxWidth: maxBlockWidth,
              boxLines: boxLineStreak,
            });
            results.quadrants[quad].defects++;
          }
          inCodeBlock = false;
        }
        continue;
      }

      if (inCodeBlock && blockLang !== 'mermaid') {
        if (line.length > maxBlockWidth) maxBlockWidth = line.length;
        if (BOX_BORDER_REGEX.test(line) || (line.includes('+--') && line.includes('--+'))) {
          boxLineStreak++;
        }
      }
    }
  }

  return results;
}

function main() {
  const options = parseArgs(process.argv);
  const results = analyzeDocs(options);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    if (options.strict && (results.uncataloged.length > 0 || results.stale.length > 0 || results.deadLinks.length > 0 || results.diagrams.length > 0)) {
      process.exit(1);
    }
    return;
  }

  if (options.summary) {
    console.log('\n================================================================================');
    console.log('                    SOVEREIGN DOCUMENTATION HEALTH SCORECARD');
    console.log('================================================================================');

    for (const [qName, qStats] of Object.entries(results.quadrants)) {
      const status = qStats.defects === 0 ? '100% OK' : `${qStats.defects} defects`;
      console.log(`${qName.padEnd(34)} | Files: ${String(qStats.files).padStart(3)} | Status: ${status}`);
    }

    console.log('--------------------------------------------------------------------------------');
    console.log(`Uncataloged: ${results.uncataloged.length} | Stale: ${results.stale.length} | Dead Links: ${results.deadLinks.length} | Diagrams: ${results.diagrams.length}`);
    const clean = results.uncataloged.length === 0 && results.stale.length === 0 && results.deadLinks.length === 0 && results.diagrams.length === 0;
    console.log(`Overall Health: ${clean ? 'CLEAN (Passes verify:strict)' : 'FAIL (Defects present)'}`);
    console.log('================================================================================\n');
  }

  if (options.uncataloged && results.uncataloged.length > 0) {
    console.log(`\n[UNCATALOGED FILES] (${results.uncataloged.length}):`);
    for (const f of results.uncataloged) console.log(`  - ${f}`);
  }

  if (options.stale && results.stale.length > 0) {
    console.log(`\n[STALE REFERENCES] (${results.stale.length}):`);
    for (const s of results.stale) console.log(`  - ${s.file}:${s.line} [${s.issue}] "${s.snippet}"`);
  }

  if (options.deadLinks && results.deadLinks.length > 0) {
    console.log(`\n[DEAD LINKS] (${results.deadLinks.length}):`);
    for (const d of results.deadLinks) console.log(`  - ${d.file} -> target: "${d.target}" (missing: ${d.resolved})`);
  }

  if (options.diagrams && results.diagrams.length > 0) {
    console.log(`\n[ASCII BOX DIAGRAMS] (${results.diagrams.length}):`);
    for (const dg of results.diagrams) console.log(`  - ${dg.file}:${dg.line} (width: ${dg.maxWidth}, box lines: ${dg.boxLines})`);
  }

  if (options.strict) {
    const defectCount = results.uncataloged.length + results.stale.length + results.deadLinks.length + results.diagrams.length;
    if (defectCount > 0) {
      console.error(`\n[ERROR] docs:filter --strict failed with ${defectCount} defect(s).`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeDocs,
  classifyQuadrant,
};
