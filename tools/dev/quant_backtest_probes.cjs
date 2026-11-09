// Run from repository root: node tools/dev/quant_backtest_probes.cjs
// Exit 1 preserves evidence of the outstanding contracts; never invokes AI or deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const Module = require('node:module');
const root = process.cwd();
const discovery = require(path.join(root, 'shared/lib/strategy/interval_discovery'));
const { runBacktest } = require(path.join(root, 'shared/lib/strategy/backtest'));
const probes = {
  'QB-01': () => {
    const frame = { features: [{ symbol: 'AAPL' }] };
    const options = { engine: 'cpp_native', timeframe: '1h', threshold: 0.6, horizon: 5, costBps: 5, monteCarloRuns: 0 };
    const a = runBacktest(frame, { ...options, model: 'momentum_baseline_v0' });
    const b = runBacktest(frame, { ...options, model: 'knn_pattern_v0' });
    console.log(JSON.stringify({ engines: [a.engine, b.engine], trades: [a.metrics?.trades, b.metrics?.trades], sameMetrics: JSON.stringify(a.metrics) === JSON.stringify(b.metrics) }));
    assert.equal(a.engine, 'sovereign_cpp_core');
    assert.equal(b.engine, 'sovereign_cpp_core');
    assert.ok(a.metrics.trades > 0);
    assert.notDeepEqual(a.metrics, b.metrics, 'selected models produce identical native metrics; inspect serialization');
  },
  'QB-02': () => {
    const tmp = fs.mkdtempSync('/tmp/opencode/ledger-audit-');
    try {
      const relative = 'workspace/RESEARCH_LEDGER.jsonl';
      for (const dir of ['local', 'remote']) fs.mkdirSync(path.join(tmp, dir, 'workspace'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'local', relative), 'local-record\n');
      const expected = 'remote-record-1\nremote-record-2\n';
      fs.writeFileSync(path.join(tmp, 'remote', relative), expected);
      const script = fs.readFileSync('tools/operational/sync_local_deploy.sh', 'utf8');
      const block = script.match(/TAR_EXCLUDES=\(([\s\S]*?)\n\)/)[1];
      const excludes = [...block.matchAll(/--exclude='([^']+)'/g)].map(m => '--exclude=' + m[1]);
      const archive = cp.execFileSync('tar', ['-C', path.join(tmp, 'local'), ...excludes, '-cf', '-', '.']);
      cp.execFileSync('tar', ['-C', path.join(tmp, 'remote'), '-xf', '-'], { input: archive });
      assert.equal(fs.readFileSync(path.join(tmp, 'remote', relative), 'utf8'), expected);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  },
  'QB-03': () => {
    const filename = path.join(root, 'tools/agent/quant_research_harness.js');
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    loaded._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.auditParse = parseCliArgs;', filename);
    const args = loaded.exports.auditParse(['node', 'harness', '--family', 'mean_reversion']);
    const random = Math.random;
    let spec;
    try {
      Math.random = () => 0;
      spec = discovery.generateCandidateSpec({ archetype: args.archetype, seed: 'audit' });
    } finally { Math.random = random; }
    console.log(JSON.stringify({ requested: 'mean_reversion', actual: spec.family, archetype: spec.archetype }));
    assert.equal(spec.family, 'mean_reversion');
  },
};
for (const [id, probe] of Object.entries(probes)) {
  try { probe(); console.log(`${id}: contract passed`); }
  catch (error) { console.error(`${id}: ${error.message}`); process.exitCode = 1; }
}
