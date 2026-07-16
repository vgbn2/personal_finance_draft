#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_SOURCE = '49560981^1';
const FILES = [
  'workspace/DEV_REVIEW.md',
  'workspace/PROMPT_LOG.md',
  'workspace/SESSION_MEMORY.md',
  'workspace/STATE.md',
];
const TARGET_SESSION = /\bsession\s+(7[3-9]|8[01])\b/i;
const CONFLICT_MARKER = /^(<<<<<<<|=======|>>>>>>>)(?: |$)/m;
const RECOVERY_HEADING = '## Recovered Merge History - 2026-07-16 session 83';

function parseArgs(argv) {
  let mode = 'dry-run';
  let source = DEFAULT_SOURCE;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') {
      mode = 'write';
    } else if (arg === '--check') {
      mode = 'check';
    } else if (arg === '--source') {
      source = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!source) {
    throw new Error('--source requires a git revision');
  }

  return { mode, source };
}

function readGitFile(source, file) {
  const result = spawnSync('git', ['show', `${source}:${file}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`Unable to read ${source}:${file}: ${result.stderr.trim()}`);
  }
  if (CONFLICT_MARKER.test(result.stdout)) {
    throw new Error(`Refusing to recover conflict markers from ${source}:${file}`);
  }

  return result.stdout.replace(/\r\n/g, '\n');
}

function extractTargetSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];

  for (let start = 0; start < lines.length; start += 1) {
    if (!/^## /.test(lines[start]) || !TARGET_SESSION.test(lines[start])) {
      continue;
    }

    let end = start + 1;
    while (end < lines.length && !/^#{1,2} /.test(lines[end])) {
      end += 1;
    }

    sections.push({
      heading: lines[start],
      text: lines.slice(start, end).join('\n').trimEnd(),
    });
    start = end - 1;
  }

  return sections;
}

function appendRecovery(file, current, source, sections) {
  const provenance = [
    RECOVERY_HEADING,
    '',
    `Source: \`${source}:${file}\`. These sections were restored additively after merge-history loss; existing entries were not rewritten.`,
  ];
  const body = current.includes(RECOVERY_HEADING)
    ? sections.map((section) => section.text)
    : [...provenance, '', ...sections.map((section) => section.text)];
  const separator = current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';

  fs.appendFileSync(path.join(ROOT, file), `${separator}${body.join('\n\n')}\n`, 'utf8');
}

function main() {
  const { mode, source } = parseArgs(process.argv.slice(2));
  let missingTotal = 0;

  for (const file of FILES) {
    const sourceText = readGitFile(source, file);
    const current = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
    const candidates = extractTargetSections(sourceText);
    const missing = candidates.filter((section) => !current.includes(section.text));
    missingTotal += missing.length;

    console.log(`${file}: candidates=${candidates.length} missing=${missing.length}`);
    for (const section of missing) {
      console.log(`  ${section.heading}`);
    }

    if (mode === 'write' && missing.length > 0) {
      appendRecovery(file, current, source, missing);
    }
  }

  if (mode === 'check' && missingTotal > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
