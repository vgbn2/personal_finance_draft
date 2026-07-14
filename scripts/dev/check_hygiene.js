#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

  // B. Check for untracked large archives (*.zip, *.bundle, *.tar.gz, etc.)
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
  }

  // C. Verify build directories are ignored
  const buildDirs = ['backend/core/build/', 'build/', 'dist/', 'node_modules/'];
  for (const dir of buildDirs) {
    const checkIgnore = runGit(['check-ignore', '--no-index', dir]);
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
  const findings = [];
  const allowedLocalSkills = new Set([
    'blast-through',
    'claude',
    'codex',
    'gemini',
    'polymarket-history-backfill',
    'repo-hygiene'
  ]);

  const allowedAgentsSkills = new Set([
    'blast-through',
    'claude',
    'codex',
    'gemini',
    'mass-implement',
    'polymarket-history-backfill',
    'refine-suggestion',
    'session-orchestrator'
  ]);

  // A. Check skills/
  const skillsDir = path.join(WORKSPACE_ROOT, 'skills');
  if (fs.existsSync(skillsDir)) {
    try {
      const dirs = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory());
      for (const d of dirs) {
        if (!allowedLocalSkills.has(d)) {
          findings.push({
            finding: `Stale or non-canonical skill folder: skills/${d}`,
            surface: `skills/${d}`,
            action: `Remove-Item -Recurse 'skills/${d}'`
          });
        }
      }
    } catch (e) {}
  }

  // B. Check .agents/skills/
  const agentsSkillsDir = path.join(WORKSPACE_ROOT, '.agents', 'skills');
  if (fs.existsSync(agentsSkillsDir)) {
    try {
      const dirs = fs.readdirSync(agentsSkillsDir).filter(f => fs.statSync(path.join(agentsSkillsDir, f)).isDirectory());
      for (const d of dirs) {
        if (!allowedAgentsSkills.has(d)) {
          findings.push({
            finding: `Stale or non-canonical agent skill folder: .agents/skills/${d}`,
            surface: `.agents/skills/${d}`,
            action: `Remove-Item -Recurse '.agents/skills/${d}'`
          });
        }
      }
    } catch (e) {}
  }

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

// 5. Documentation & State Alignment
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
