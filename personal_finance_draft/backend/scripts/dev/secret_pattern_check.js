const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.yml', '.yaml',
  '.toml', '.sh', '.ps1', '.py', '.rs', '.c', '.cpp', '.hpp', '.h', '.txt',
  '.sql', '.env',
]);

const SECRET_ASSIGNMENT_PATTERNS = [
  {
    name: 'sensitive-env-assignment',
    regex: /^(?:export\s+)?(?:[A-Z0-9_]*?(?:PRIVATE_KEY|SECRET|PASS(?:PHRASE)?|API_KEY|SERVICE_ROLE_KEY|PUBLISHABLE_KEY|ACCESS_TOKEN|TOKEN))\s*=\s*(?!["']?(?:\[redacted\]|YOUR_|PLACEHOLDER|REPLACE_ME|changeme|example|TODO|<|undefined|null|none))(.+)$/i,
  },
  {
    name: 'ethereum-private-key',
    regex: /\b0x[a-fA-F0-9]{64}\b/,
  },
  {
    name: 'github-token',
    regex: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: 'openai-or-llm-key',
    regex: /\bsk-[A-Za-z0-9]{20,}\b/,
  },
];

function isTextLike(file) {
  if (file.startsWith('storage/data/cache/')) return false;
  if (file.includes('node_modules/')) return false;
  if (file.includes('/target/')) return false;
  if (file.includes('\\target\\')) return false;
  const ext = path.extname(file).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || path.basename(file) === 'package.json' || path.basename(file) === 'Cargo.lock';
}

function listTrackedFiles() {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations = [];
  lines.forEach((line, idx) => {
    for (const pattern of SECRET_ASSIGNMENT_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(line);
      if (match) {
        violations.push({
          file,
          line: idx + 1,
          pattern: pattern.name,
          excerpt: line.trim(),
        });
        break;
      }
    }
  });
  return violations;
}

function main() {
  const files = listTrackedFiles().filter(isTextLike);
  const violations = [];
  for (const file of files) {
    try {
      violations.push(...scanFile(file));
    } catch (error) {
      // Ignore unreadable or non-UTF-8 files that slipped through filtering.
    }
  }

  if (violations.length === 0) {
    console.log(JSON.stringify({ ok: true, scanned_files: files.length, violations: 0 }));
    return;
  }

  console.error(JSON.stringify({ ok: false, scanned_files: files.length, violations }, null, 2));
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}
