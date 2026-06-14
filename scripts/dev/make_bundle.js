#!/usr/bin/env node
'use strict';

/*
 * make_bundle.js — repeatable git-bundle generator for transferring this repo to
 * another machine (e.g. an old Ubuntu PC) with full version history.
 *
 * The git root is the CODEPTIT monorepo (personal_finance_draft is a subdir), so a
 * `git bundle` necessarily covers the whole monorepo. The monorepo also contains
 * embedded git repos (gitlinks with no .gitmodules) — notably
 * personal_finance_draft/backend/polymarket-cli — whose CONTENTS are NOT carried by
 * the parent's `--all` bundle (only the commit pointer is). This script therefore
 * also emits a companion bundle per populated embedded repo so the destination clone
 * is complete and restorable.
 *
 * Output is written OUTSIDE the working tree by default (a sibling of the git root)
 * so it never bloats the next bundle and is never flagged by check_hygiene.js.
 *
 * Usage:
 *   node scripts/dev/make_bundle.js [--out <dir>] [--embedded pfd|all|none] [--dry-run]
 *   npm run bundle
 *
 *   --out <dir>        Output directory (default: <gitRoot>/../portable_exports).
 *   --embedded <mode>  Which embedded repos to also bundle:
 *                        pfd  (default) only those under personal_finance_draft/
 *                        all  every populated embedded repo in the monorepo
 *                        none skip embedded repos entirely
 *   --dry-run          Print what would be produced without writing bundles.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PFD_PREFIX = 'personal_finance_draft/';

function git(args, opts = {}) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    ...opts,
  });
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function fail(msg) {
  console.error(`[make_bundle] ERROR: ${msg}`);
  process.exit(1);
}

function getOpt(argv, name, def) {
  const i = argv.indexOf(name);
  return i === -1 || i + 1 >= argv.length ? def : argv[i + 1];
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 35).join('\n'));
    return;
  }

  const embeddedMode = getOpt(argv, '--embedded', 'pfd');
  if (!['pfd', 'all', 'none'].includes(embeddedMode)) {
    fail(`--embedded must be one of pfd|all|none (got "${embeddedMode}")`);
  }
  const dryRun = argv.includes('--dry-run');

  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) fail('not inside a git repository');
  const gitRoot = top.stdout;
  const repoName = path.basename(gitRoot);

  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const defaultOut = path.resolve(gitRoot, '..', 'portable_exports');
  const outDir = path.resolve(getOpt(argv, '--out', defaultOut));

  if (outDir === gitRoot || outDir.startsWith(gitRoot + path.sep)) {
    console.warn(
      `[make_bundle] WARNING: output dir is INSIDE the repo (${outDir}).\n` +
        '  Archives written there are flagged by check_hygiene.js and bloat future bundles.\n' +
        '  Recommend --out to a path outside the repo.',
    );
  }

  const head = git(['-C', gitRoot, 'rev-parse', 'HEAD']);
  const branch = git(['-C', gitRoot, 'rev-parse', '--abbrev-ref', 'HEAD']);

  console.log(`[make_bundle] git root : ${gitRoot}`);
  console.log(`[make_bundle] HEAD     : ${head.stdout} (${branch.stdout})`);
  console.log(`[make_bundle] output   : ${outDir}`);
  console.log(`[make_bundle] embedded : ${embeddedMode}${dryRun ? '  [DRY RUN]' : ''}`);

  // Enumerate embedded gitlinks (mode 160000) in the parent repo index.
  const lsFiles = git(['-C', gitRoot, 'ls-files', '-s']);
  if (lsFiles.status !== 0) fail(`git ls-files failed: ${lsFiles.stderr}`);
  let gitlinks = lsFiles.stdout
    .split(/\r?\n/)
    .filter((l) => l.startsWith('160000'))
    .map((l) => l.split('\t')[1])
    .filter(Boolean);

  if (embeddedMode === 'none') gitlinks = [];
  else if (embeddedMode === 'pfd') gitlinks = gitlinks.filter((p) => p.startsWith(PFD_PREFIX));

  // Resolve which embedded gitlinks are populated local repos with commits.
  const embedded = [];
  const skippedLinks = [];
  for (const rel of gitlinks) {
    const abs = path.join(gitRoot, rel);
    if (!fs.existsSync(path.join(abs, '.git'))) {
      skippedLinks.push({ rel, reason: 'no .git (empty placeholder)' });
      continue;
    }
    const count = git(['-C', abs, 'rev-list', '--count', 'HEAD']);
    if (count.status !== 0 || !count.stdout || count.stdout === '0') {
      skippedLinks.push({ rel, reason: 'no commits' });
      continue;
    }
    embedded.push({ rel, abs, commits: Number(count.stdout) });
  }

  if (dryRun) {
    console.log(`\n[make_bundle] would write main bundle: ${path.join(outDir, `${repoName}-${stamp}.bundle`)}`);
    console.log(`[make_bundle] would write ${embedded.length} embedded bundle(s):`);
    for (const e of embedded) console.log(`  - ${e.rel} (${e.commits} commits)`);
    if (skippedLinks.length) {
      console.log(`[make_bundle] would skip ${skippedLinks.length} gitlink(s):`);
      for (const s of skippedLinks) console.log(`  - ${s.rel}: ${s.reason}`);
    }
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const embeddedDir = path.join(outDir, 'embedded');
  if (embedded.length) fs.mkdirSync(embeddedDir, { recursive: true });

  // 1. Main monorepo bundle (all refs).
  const mainBundle = path.join(outDir, `${repoName}-${stamp}.bundle`);
  console.log(`\n[make_bundle] creating main bundle (--all) ...`);
  const mk = git(['-C', gitRoot, 'bundle', 'create', mainBundle, '--all'], { stdio: 'inherit' });
  if (mk.status !== 0) fail('git bundle create (main) failed');
  const vfy = git(['-C', gitRoot, 'bundle', 'verify', mainBundle]);
  if (vfy.status !== 0) fail(`main bundle failed verification: ${vfy.stderr}`);

  // 2. Companion bundle per populated embedded repo.
  const manifestEmbedded = [];
  for (const e of embedded) {
    const slug = e.rel.replace(/[\\/]/g, '__');
    const dest = path.join(embeddedDir, `${slug}.bundle`);
    console.log(`[make_bundle] bundling embedded ${e.rel} (${e.commits} commits) ...`);
    const r = git(['-C', e.abs, 'bundle', 'create', dest, '--all'], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.warn(`[make_bundle] WARNING: failed to bundle embedded ${e.rel}; skipping`);
      continue;
    }
    const v = git(['-C', e.abs, 'bundle', 'verify', dest]);
    if (v.status !== 0) {
      console.warn(`[make_bundle] WARNING: embedded bundle ${e.rel} failed verification; skipping`);
      continue;
    }
    manifestEmbedded.push({
      path: e.rel,
      bundle: path.join('embedded', `${slug}.bundle`),
      commits: e.commits,
      bytes: fs.statSync(dest).size,
    });
  }

  // 3. Manifest + restore doc.
  const manifest = {
    generated_at: new Date().toISOString(),
    git_root: gitRoot,
    repo_name: repoName,
    head: head.stdout,
    branch: branch.stdout,
    embedded_mode: embeddedMode,
    main_bundle: path.basename(mainBundle),
    main_bundle_bytes: fs.statSync(mainBundle).size,
    embedded: manifestEmbedded,
    skipped_gitlinks: skippedLinks,
  };
  fs.writeFileSync(path.join(outDir, 'bundle_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'RESTORE_UBUNTU.md'), renderRestoreDoc(manifest, repoName));

  // Summary.
  const totalBytes =
    manifest.main_bundle_bytes + manifestEmbedded.reduce((s, e) => s + e.bytes, 0);
  console.log('\n[make_bundle] DONE');
  console.log(`  main     : ${path.basename(mainBundle)}  (${humanSize(manifest.main_bundle_bytes)})`);
  console.log(`  embedded : ${manifestEmbedded.length} bundle(s)`);
  for (const e of manifestEmbedded) console.log(`             ${e.path}  (${humanSize(e.bytes)})`);
  if (skippedLinks.length) {
    console.log(`  skipped  : ${skippedLinks.length} gitlink(s) (empty/no commits)`);
  }
  console.log(`  total    : ${humanSize(totalBytes)} in ${outDir}`);
  console.log(`  restore  : see ${path.join(outDir, 'RESTORE_UBUNTU.md')}`);
}

function renderRestoreDoc(manifest, repoName) {
  const lines = [];
  lines.push(`# Restore on Ubuntu — ${repoName}`);
  lines.push('');
  lines.push(`Generated: ${manifest.generated_at}`);
  lines.push(`Source HEAD: \`${manifest.head}\` (${manifest.branch})`);
  lines.push('');
  lines.push('Transfer this whole folder (the `.bundle` files + `embedded/`) to the Ubuntu PC');
  lines.push('via USB or `scp`, then run the steps below.');
  lines.push('');
  lines.push('## 1. Clone the monorepo');
  lines.push('');
  lines.push('```bash');
  lines.push(`git clone ${manifest.main_bundle} ${repoName}`);
  lines.push(`cd ${repoName}`);
  lines.push(`git checkout ${manifest.branch}`);
  lines.push('# (optional) keep the bundle as a remote to pull future updates from a new bundle:');
  lines.push(`#   git remote add bundle /path/to/${manifest.main_bundle}`);
  lines.push('```');
  lines.push('');

  if (manifest.embedded.length) {
    lines.push('## 2. Restore embedded repos');
    lines.push('');
    lines.push('These directories are embedded git repos (gitlinks) whose contents are NOT in the');
    lines.push('main bundle. Clone each companion bundle into its path so the tree is complete:');
    lines.push('');
    lines.push('```bash');
    for (const e of manifest.embedded) {
      lines.push(`rm -rf "${e.path}" && git clone "/path/to/exports/${e.bundle}" "${e.path}"`);
    }
    lines.push('```');
    lines.push('');
    lines.push('> Adjust `/path/to/exports/` to where you copied this folder on Ubuntu.');
    lines.push('');
  } else {
    lines.push('## 2. Embedded repos');
    lines.push('');
    lines.push('No embedded-repo bundles were produced for this export (`--embedded` mode:');
    lines.push(`\`${manifest.embedded_mode}\`). Re-run with \`--embedded all\` if you need every`);
    lines.push('sub-project, or `--embedded pfd` for just the trading platform deps.');
    lines.push('');
  }

  lines.push('## 3. Install + build (the platform lives in `personal_finance_draft/`)');
  lines.push('');
  lines.push('```bash');
  lines.push('cd personal_finance_draft');
  lines.push('npm install            # node_modules is gitignored, not in the bundle');
  lines.push('# C++ core (needed for ML / backtest / correlation; Node alone is enough to ingest data):');
  lines.push('cmake -S backend/core -B backend/core/build -DCMAKE_BUILD_TYPE=Release \\');
  lines.push('      -DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON');
  lines.push('cmake --build backend/core/build --config Release');
  lines.push('export SOVEREIGN_BACKEND_BIN="$PWD/backend/core/build/sovereign_wealth"');
  lines.push('```');
  lines.push('');
  lines.push('## 4. Re-ingest market data on Ubuntu (no 8.6 GB transfer needed)');
  lines.push('');
  lines.push('`storage/data` is gitignored and NOT in the bundle. Re-populate it locally — most');
  lines.push('providers are keyless:');
  lines.push('');
  lines.push('| Data | Provider | Key needed? |');
  lines.push('|------|----------|-------------|');
  lines.push('| Crypto deep 5m/1m | Binance public | No |');
  lines.push('| Indices/commodities/FX/equities daily | Yahoo | No |');
  lines.push('| FX | Frankfurter/ECB | No |');
  lines.push('| Equities native intraday (5m/1m) | Alpaca | Yes (`ALPACA_API_KEY`/`SECRET`) |');
  lines.push('| Macro / secondary | TwelveData, FRED, Finnhub | Yes (optional) |');
  lines.push('');
  lines.push('```bash');
  lines.push('# Set keys only for the providers you need (crypto/indices/FX work without any):');
  lines.push('cp .env.example .env   # if present; otherwise create .env with your keys');
  lines.push('');
  lines.push('# Cache-aware orchestrator (recommended): deep-fetch missing, refresh stale, skip fresh');
  lines.push('node backend/cli/sovereign_cli.js backfill-daemon --once');
  lines.push('');
  lines.push('# Or targeted deep backfills (crypto 5m/1m to 2017 is multi-hour):');
  lines.push('node backend/cli/sovereign_cli.js crypto-deep-backfill --symbol BTCUSDT --days 7');
  lines.push('```');
  lines.push('');
  lines.push('## 5. Verify');
  lines.push('');
  lines.push('```bash');
  lines.push('npm test                                   # JS suite');
  lines.push('node backend/cli/sovereign_cli.js status --json   # data freshness snapshot');
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

main();
