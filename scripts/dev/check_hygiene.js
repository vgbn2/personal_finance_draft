#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { MIRROR_ROOT, compareInventory, readManifest } = require('./sync_repo_skills');

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');

// Helper to run git command
function runGit(args) {
  const result = spawnSync('git', args, { cwd: WORKSPACE_ROOT, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

// 1. Git Status & Ignored Noise Check
function checkGitNoise() {
  const findings = [];

  const forbiddenTrackedArtifacts = runGit(['ls-files', '*.pdb', '*dev.review.txt']);
  if (forbiddenTrackedArtifacts.status !== 0) {
    findings.push({
      finding: `Unable to inspect tracked review/debug artifacts: ${forbiddenTrackedArtifacts.stderr.trim() || `git exit ${forbiddenTrackedArtifacts.status}`}`,
      surface: 'tracked files',
      action: 'Repair the git tracked-file scan before trusting hygiene'
    });
  } else {
    const trackedArtifacts = forbiddenTrackedArtifacts.stdout
      .trim()
      .split(/\r?\n/)
      .filter((relativePath) => relativePath && fs.existsSync(path.join(WORKSPACE_ROOT, relativePath)));
    if (trackedArtifacts.length > 0) {
      findings.push({
        finding: `Tracked review/debug artifact(s): ${trackedArtifacts.join(', ')}`,
        surface: 'tracked files',
        action: 'Move durable review guidance into docs/ and remove generated compiler databases'
      });
    }
  }
  
  // A. Check if latest_backtest.json or strategy_grade_index.json are tracked
  const checkTracked = runGit(['ls-files', 'storage/data/backtests/latest_backtest.json', 'storage/data/strategy_grade_index.json']);
  if (checkTracked.status === 0 && checkTracked.stdout.trim() !== '') {
    const trackedFiles = checkTracked.stdout.trim().split(/\r?\n/).filter(Boolean);
    if (trackedFiles.length > 0) {
      findings.push({
        finding: `Tracked runtime output(s): ${trackedFiles.join(', ')}`,
        surface: 'storage/data/',
        action: `git rm --cached ${trackedFiles.join(' ')}`
      });
    }
  }

  // B. Check for untracked large archives (*.zip, *.bundle, *.tar.gz, etc.) and nested path slippage
  const checkUntracked = runGit(['ls-files', '--others', '--exclude-standard', '.']);
  if (checkUntracked.status === 0) {
    const untrackedFiles = checkUntracked.stdout.trim().split(/\r?\n/).filter(Boolean);
    const archives = untrackedFiles.filter(f => f.match(/\.(zip|bundle|tar\.gz|tgz|rar)$/i));
    if (archives.length > 0) {
      findings.push({
        finding: `Untracked large archive(s) found: ${archives.join(', ')}`,
        surface: 'Project Root',
        action: `Remove-Item ${archives.map(a => `'${a}'`).join(', ')}`
      });
    }

    // Check for nested path slippage (e.g. workspace/home/, docs/docs/, skills/skills/)
    const pathSlippage = untrackedFiles.filter(f => f.match(/^(workspace\/home\/|workspace\/Documents\/|docs\/docs\/|skills\/skills\/)/i));
    if (pathSlippage.length > 0) {
      findings.push({
        finding: `Nested path slippage artifact(s) found: ${pathSlippage.join(', ')}`,
        surface: 'Path Structure',
        action: `Remove-Item -Recurse ${pathSlippage.map(p => `'${p}'`).join(', ')}`
      });
    }

    // Check for temporary scratch files (e.g. *.tmp.js, *.scratch.md)
    const scratchFiles = untrackedFiles.filter(f => f.match(/\.(tmp\.js|scratch\.md|scratch\.js)$/i));
    if (scratchFiles.length > 0) {
      findings.push({
        finding: `Untracked temporary scratch artifact(s): ${scratchFiles.join(', ')}`,
        surface: 'Scratch Artifacts',
        action: `Remove-Item ${scratchFiles.map(s => `'${s}'`).join(', ')}`
      });
    }
  }

  // C. Verify build directories are ignored
  const buildDirs = ['backend/core/build/', 'build/', 'dist/', 'node_modules/'];
  const gitignoreContent = fs.existsSync(path.join(WORKSPACE_ROOT, '.gitignore'))
    ? fs.readFileSync(path.join(WORKSPACE_ROOT, '.gitignore'), 'utf8')
    : '';
  for (const dir of buildDirs) {
    const checkIgnore = runGit(['check-ignore', '--no-index', dir]);
    if (checkIgnore.status === 128 && checkIgnore.stderr.includes('beyond a symbolic link')) {
      if (!gitignoreContent.includes(dir)) {
        findings.push({
          finding: `Directory is not gitignored: ${dir}`,
          surface: '.gitignore',
          action: `echo "${dir}" >> .gitignore`
        });
      }
      continue;
    }
    if (checkIgnore.status !== 0) {
      findings.push({
        finding: `Directory is not gitignored: ${dir}`,
        surface: '.gitignore',
        action: `echo "${dir}" >> .gitignore`
      });
    }
  }

  return {
    pass: findings.length === 0,
    findings
  };
}

// 2. Broken Link & Symlink Scan
function checkSymlinks() {
  const findings = [];

  // Recursive directory scanner for symlinks
  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (e) {
      findings.push({
        finding: `Cannot read directory (possible broken link/junction): ${dir}`,
        surface: dir,
        action: `Remove-Item -Recurse '${dir}'`
      });
      return;
    }

    for (const file of files) {
      const fullPath = path.join(dir, file);
      let lstat;
      try {
        lstat = fs.lstatSync(fullPath);
      } catch (e) {
        continue;
      }

      let isBroken = false;
      if (lstat.isSymbolicLink()) {
        try {
          fs.statSync(fullPath);
        } catch (e) {
          isBroken = true;
        }
      } else if (lstat.isDirectory()) {
        try {
          fs.statSync(fullPath);
        } catch (e) {
          if (e.code === 'ENOENT') {
            isBroken = true;
          }
        }
      }

      if (isBroken) {
        findings.push({
          finding: `Broken symlink/junction: ${path.relative(WORKSPACE_ROOT, fullPath)}`,
          surface: path.relative(WORKSPACE_ROOT, fullPath),
          action: `Remove-Item '${path.relative(WORKSPACE_ROOT, fullPath)}'`
        });
      } else if (lstat.isDirectory()) {
        const rel = path.relative(WORKSPACE_ROOT, fullPath).replace(/\\/g, '/');
        if (!rel.includes('node_modules') && !rel.includes('backend/core/build') && !rel.includes('.git') && !rel.includes('.venv') && !rel.includes('dist')) {
          scanDir(fullPath);
        }
      }
    }
  }

  // Scan data/skills and workspace root
  scanDir(path.join(WORKSPACE_ROOT, 'data', 'skills'));
  
  // Verify submodule/gitlink drift
  const gitStatus = runGit(['status', '.']);
  if (gitStatus.status === 0) {
    if (gitStatus.stdout.includes('new commits') || gitStatus.stdout.includes('modified content')) {
      findings.push({
        finding: `Submodule or gitlink drift detected`,
        surface: 'Submodules',
        action: `git submodule update --init --recursive`
      });
    }
  }

  return {
    pass: findings.length === 0,
    findings
  };
}

// 3. Agent Skills Inventory Hygiene
function checkAgentSkills() {
  let rawFindings;
  try {
    rawFindings = compareInventory(readManifest(), {
      requireMirror: fs.existsSync(MIRROR_ROOT)
    });
  } catch (error) {
    rawFindings = [error instanceof Error ? error.message : String(error)];
  }
  const findings = rawFindings.map((finding) => ({
    finding,
    surface: 'skills/manifest.json and .agents/skills/',
    action: 'Run node scripts/dev/sync_repo_skills.js --write, review any mirror extras, then rerun --check'
  }));

  return {
    pass: findings.length === 0,
    findings
  };
}

// 4. Code Marker & Review Scan
function checkCodeMarkers() {
  const findings = [];
  const searchDirs = ['shared', 'backend/core/src', 'backend/cli'];
  const extFilter = new Set(['.js', '.ts', '.cpp', '.hpp', '.h']);
  const reviewPattern = /dev review|IDE error/i;

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const rel = path.relative(WORKSPACE_ROOT, fullPath).replace(/\\/g, '/');
        if (!rel.includes('node_modules') && !rel.includes('build') && !rel.includes('target')) {
          walk(fullPath);
        }
      } else {
        const ext = path.extname(file);
        if (extFilter.has(ext)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (reviewPattern.test(content)) {
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (reviewPattern.test(line)) {
                findings.push({
                  finding: `Stale comment marker: "${line.trim()}"`,
                  surface: `${path.relative(WORKSPACE_ROOT, fullPath)}:${idx + 1}`,
                  action: `Remove comment on line ${idx + 1} of ${path.relative(WORKSPACE_ROOT, fullPath)}`
                });
              }
            });
          }
        }
      }
    }
  }

  for (const dir of searchDirs) {
    walk(path.join(WORKSPACE_ROOT, dir));
  }

  // Check for TODO/FIXME newly introduced in git diff
  const diffResult = runGit(['diff', 'HEAD', '.']);
  if (diffResult.status === 0) {
    const diffLines = diffResult.stdout.split('\n');
    let currentFile = '';
    diffLines.forEach((line) => {
      if (line.startsWith('+++ b/')) {
        currentFile = line.substring(6).trim();
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        const ext = path.extname(currentFile);
        if (extFilter.has(ext)) {
          const addedContent = line.substring(1);
          if (addedContent.includes('TODO') || addedContent.includes('FIXME')) {
            findings.push({
              finding: `Newly introduced TODO/FIXME: "${addedContent.trim()}"`,
              surface: currentFile || 'modified files',
              action: 'Resolve the TODO/FIXME before committing'
            });
          }
        }
      }
    });
  }

  return {
    pass: findings.length === 0,
    findings
  };
}

// 5. Clean-clone and package-script integrity
function checkRepositoryIntegrity() {
  const findings = [];
  const markerPattern = '^(<<<<<<<|=======|>>>>>>>)';
  const markerScopes = ['backend', 'shared', 'config', 'scripts', 'tests'];

  for (const [label, args] of [
    ['committed HEAD', ['grep', '-n', '-E', markerPattern, 'HEAD', '--', ...markerScopes]],
    ['working tree', ['grep', '-n', '-E', markerPattern, '--', ...markerScopes]],
  ]) {
    const result = runGit(args);
    if (result.status === 0) {
      const matches = result.stdout.trim().split(/\r?\n/).filter(Boolean);
      findings.push({
        finding: `${label} contains conflict markers: ${matches.slice(0, 4).join(', ')}`,
        surface: label,
        action: 'Resolve conflict markers and verify the committed archive'
      });
    } else if (result.status !== 1) {
      findings.push({
        finding: `Unable to scan ${label} for conflict markers: ${result.stderr.trim() || `git exit ${result.status}`}`,
        surface: label,
        action: 'Repair the git marker scan before trusting hygiene'
      });
    }
  }

  const requiredTrackedFiles = [
    'shared/lib/runtime/env.js',
    'shared/lib/data/ingestion.js',
    'shared/lib/data/macro_store.js',
    'shared/lib/ml/models.js',
    'tests/run_node_tests.js',
    'tests/fixtures/backend_history_sample.json',
    'tests/fixtures/real_bars_btc.json',
  ];

  for (const relativePath of requiredTrackedFiles) {
    const result = runGit(['ls-files', '--error-unmatch', relativePath]);
    if (result.status !== 0) {
      findings.push({
        finding: `Load-bearing clean-clone file is untracked or missing: ${relativePath}`,
        surface: relativePath,
        action: `Track ${relativePath} after verifying its current caller and provenance`
      });
    }
  }

  const packageFiles = [
    'package.json',
    'backend/api/package.json',
    'backend/gateway/package.json',
    'backend/mcp_server/package.json',
    'Frontend/dashboard/package.json',
  ];
  const scriptTargetPattern = /(?:^|\s)([^\s"';&|]+\.(?:js|mjs|cjs|ts|sh))(?=$|\s|[;&|])/g;

  for (const packageFile of packageFiles) {
    const packagePath = path.join(WORKSPACE_ROOT, packageFile);
    if (!fs.existsSync(packagePath)) continue;
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const packageRoot = path.dirname(packagePath);

    for (const [scriptName, command] of Object.entries(pkg.scripts || {})) {
      for (const match of String(command).matchAll(scriptTargetPattern)) {
        const target = match[1];
        const normalized = target.replace(/\\/g, '/');
        if (normalized.includes('*') || normalized.includes('/dist/') || normalized.startsWith('dist/')) continue;
        if (!fs.existsSync(path.resolve(packageRoot, target))) {
          findings.push({
            finding: `${packageFile} script ${scriptName} references missing target ${target}`,
            surface: packageFile,
            action: `Restore ${target} or correct the ${scriptName} package script`
          });
        }
      }
    }
  }

  return {
    pass: findings.length === 0,
    findings
  };
}

// 6. Documentation & State Alignment
function checkDocsAlignment() {
  const findings = [];
  const statePath = path.join(WORKSPACE_ROOT, 'workspace', 'STATE.md');
  const devReviewPath = path.join(WORKSPACE_ROOT, 'workspace', 'DEV_REVIEW.md');
  const promptLogPath = path.join(WORKSPACE_ROOT, 'workspace', 'PROMPT_LOG.md');

  if (!fs.existsSync(statePath)) {
    findings.push({
      finding: 'Missing workspace/STATE.md',
      surface: 'workspace/STATE.md',
      action: 'Create workspace/STATE.md to track project state'
    });
  }

  if (!fs.existsSync(devReviewPath)) {
    findings.push({
      finding: 'Missing workspace/DEV_REVIEW.md',
      surface: 'workspace/DEV_REVIEW.md',
      action: 'Create workspace/DEV_REVIEW.md to log developer review findings'
    });
  }

  if (!fs.existsSync(promptLogPath)) {
    findings.push({
      finding: 'Missing workspace/PROMPT_LOG.md',
      surface: 'workspace/PROMPT_LOG.md',
      action: 'Create workspace/PROMPT_LOG.md to log prompt and command runs'
    });
  }

  if (fs.existsSync(statePath)) {
    const stateContent = fs.readFileSync(statePath, 'utf8');
    const phaseMatch = stateContent.match(/^## Current Phase\r?\n([^\r\n]+)/m);
    if (!phaseMatch) {
      findings.push({
        finding: 'workspace/STATE.md does not specify an active ## Current Phase',
        surface: 'workspace/STATE.md',
        action: 'Add "## Current Phase" section to workspace/STATE.md'
      });
    }
  }

  return {
    pass: findings.length === 0,
    findings
  };
}

function main() {
  console.log("# Repository Hygiene Audit Report\n");
  console.log(`Generated At: ${new Date().toISOString()}\n`);

  const results = {
    'Git Noise': checkGitNoise(),
    'Symlinks': checkSymlinks(),
    'Agent Skills': checkAgentSkills(),
    'Code Markers': checkCodeMarkers(),
    'Repository Integrity': checkRepositoryIntegrity(),
    'Docs Alignment': checkDocsAlignment()
  };

  console.log("| Category | Status (Pass/Fail) | Finding / Action Required | File / Surface |");
  console.log("| :--- | :---: | :--- | :--- |");

  let allPass = true;
  const fixInstructions = [];

  for (const [category, res] of Object.entries(results)) {
    const status = res.pass ? '✅ **Pass**' : '❌ **Fail**';
    if (!res.pass) {
      allPass = false;
      res.findings.forEach((f) => {
        console.log(`| **${category}** | ${status} | ${f.finding} | ${f.surface} |`);
        if (f.action) {
          fixInstructions.push(`- **${category}** (${f.surface}): \`${f.action}\``);
        }
      });
    } else {
      console.log(`| **${category}** | ${status} | No issues found | - |`);
    }
  }

  console.log("\n");

  if (allPass) {
    console.log("🎉 **All hygiene checks passed! Your workspace is pristine.**\n");
    process.exit(0);
  } else {
    console.log("⚠️  **Hygiene checks failed. Please address the findings below:**\n");
    console.log(fixInstructions.join('\n'));
    console.log("\n");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
