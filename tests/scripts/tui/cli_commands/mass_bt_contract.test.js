'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'backend', 'cli', 'sovereign_cli.js');
const { renderMassBtMatrix } = require('../../../../backend/cli/commands/research/research_mass_bt.js');
const manifest = require('../../../../backend/cli/tui/manifest.js');

test('mass-bt CLI command executes and outputs structured JSON payload in sample mode', () => {
  const result = spawnSync(process.execPath, [
    CLI_PATH, 'mass-bt', '--sample', '--json',
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.type, 'mass_bt_matrix');
  assert.equal(payload.engine, 'sovereign_cpp_core');
  assert.equal(Array.isArray(payload.timeframes), true);
  assert.equal(Array.isArray(payload.matrix), true);
  assert.equal(payload.matrix.length > 0, true);

  const firstStrategy = payload.matrix[0];
  assert.ok(firstStrategy.name);
  assert.ok(firstStrategy.timeframes);
});

test('renderMassBtMatrix outputs Excel-like grid borders and clean ANSI table', () => {
  const mockPayload = {
    type: 'mass_bt_matrix',
    engine: 'sovereign_cpp_core',
    position_size_pct: 0.1,
    timeframes: ['5m', '15m', '30m', '1h', '4h', '1d'],
    total_evaluated: 12,
    runtime_ms: 250,
    matrix: [
      {
        name: 'crypto_breadth_momentum',
        best_tf: '4h',
        timeframes: {
          '5m': { net_return: 0.143 },
          '15m': { net_return: 0.884 },
          '30m': { net_return: 1.421 },
          '1h': { net_return: 1.781 },
          '4h': { net_return: 3.124 },
          '1d': { net_return: 1.433 },
        },
      },
    ],
  };

  const rendered = renderMassBtMatrix(mockPayload);
  assert.match(rendered, /SOVEREIGN MASS BACKTEST MATRIX/);
  assert.match(rendered, /STRATEGY NAME/);
  assert.match(rendered, /crypto_breadth_momentum/);
  assert.match(rendered, /\+14\.3%/);
  assert.equal(rendered.includes('â'), false);
});

test('TUI menu manifest registers mass-bt command under research section', () => {
  const researchCmds = (manifest.commands && manifest.commands.research) || manifest.research || [];
  const massBtCmd = researchCmds.find((c) => c.id === 'mass-bt');

  assert.ok(massBtCmd, 'mass-bt command missing from TUI research menu');
  assert.equal(massBtCmd.label.includes('Mass Backtest Matrix'), true);
  assert.ok(massBtCmd.flags['--timeframes']);
  assert.ok(massBtCmd.flags['--position-size-pct']);
});
