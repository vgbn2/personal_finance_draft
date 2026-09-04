'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  runExplorationCycle,
  generateUniqueCandidate,
  computeStrategyFingerprint,
  computeDistance,
  loadExplorerState
} = require('../../../scripts/strategies/auto_strategy_explorer.js');
const { parseStrategyYaml } = require('../../../backend/cli/commands/strategy/strategy_presenter.js');
const { authorizeMcpTool } = require('../../../backend/mcp_server/lib/access_control.js');

test('strategy explorer: generates structurally unique candidate with valid distance score', () => {
  const state = loadExplorerState();
  const candidate = generateUniqueCandidate(state);

  assert.ok(candidate.name, 'candidate has a name');
  assert.ok(candidate.family, 'candidate has a family');
  assert.ok(candidate.model, 'candidate has a model');
  assert.ok(candidate.timeframe, 'candidate has a timeframe');
  assert.ok(Array.isArray(candidate.universe) && candidate.universe.length > 0, 'candidate has non-empty universe');
  assert.ok(candidate.threshold >= 0.50, 'candidate threshold >= 0.50');
  assert.ok(candidate.horizon > 0, 'candidate horizon > 0');

  const fp = computeStrategyFingerprint(candidate);
  assert.strictEqual(fp, candidate.fingerprint, 'fingerprint matches SHA256 deterministic computation');

  if (state.lastStrategy) {
    const distance = computeDistance(candidate, state.lastStrategy);
    assert.ok(distance >= 0.50, `novelty distance ${distance} >= 0.50`);
  }
});

test('strategy explorer: MCP server authorizes explore_strategy tool capability', () => {
  const serviceTokenEnv = {
    SOVEREIGN_MCP_SERVICE_TOKEN: 'sovereign-internal-service-token-v1'
  };
  const decision = authorizeMcpTool('explore_strategy', {}, serviceTokenEnv);
  assert.strictEqual(decision.allowed, true, 'explore_strategy is allowed for authorized service token');
  assert.deepStrictEqual(decision.required, ['research:run'], 'requires research:run capability');
});

test('strategy explorer: one-cycle execution produces valid YAML registry and C++ backtest metrics', async () => {
  const entry = await runExplorationCycle();

  assert.ok(entry, 'cycle produced entry');
  assert.ok(entry.evaluation, 'entry has evaluation');
  assert.strictEqual(entry.evaluation.engine, 'sovereign_cpp_core', 'engine is sovereign_cpp_core');
  assert.strictEqual(typeof entry.evaluation.tradeCount, 'number', 'tradeCount is number');
  assert.strictEqual(typeof entry.evaluation.netReturn, 'number', 'netReturn is number');
  assert.strictEqual(typeof entry.evaluation.maxDrawdown, 'number', 'maxDrawdown is number');
  assert.strictEqual(typeof entry.evaluation.winRate, 'number', 'winRate is number');

  if (entry.registry_file) {
    assert.ok(fs.existsSync(entry.registry_file), `registry YAML file exists at ${entry.registry_file}`);
    const yamlContent = fs.readFileSync(entry.registry_file, 'utf8');
    const parsed = parseStrategyYaml(yamlContent);
    assert.ok(parsed, 'registry file is valid parseable YAML');
  }
});
