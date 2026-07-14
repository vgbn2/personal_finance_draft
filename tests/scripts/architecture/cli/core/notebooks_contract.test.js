const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const NOTEBOOKS_DIR = path.join(ROOT, 'tests', 'fixtures', 'notebooks');
const NOTEBOOKS = [
  'data_exploration.ipynb',
  'feature_importance.ipynb',
  'model_training.ipynb',
  'walk_forward_optimization.ipynb',
  'backtest_analysis.ipynb',
];

function readNotebook(file) {
  return JSON.parse(fs.readFileSync(path.join(NOTEBOOKS_DIR, file), 'utf8'));
}

function cellSource(cell) {
  return Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
}

test('tracked notebook fixtures are parseable and carry the research ladder contract', () => {
  assert.ok(fs.existsSync(NOTEBOOKS_DIR), 'fixture notebooks directory exists');

  for (const file of NOTEBOOKS) {
    const nb = readNotebook(file);
    assert.equal(nb.nbformat, 4, `${file} uses nbformat 4`);
    assert.ok(Array.isArray(nb.cells) && nb.cells.length >= 6, `${file} has the expected cell count`);

    const codeCells = nb.cells.filter((cell) => cell.cell_type === 'code');
    assert.ok(codeCells.length >= 3, `${file} has code cells`);
    assert.ok(codeCells.some((cell) => cellSource(cell).includes('notebook_utils')), `${file} imports shared notebook helpers`);
    assert.ok(codeCells.some((cell) => cellSource(cell).includes('print_verdict(')), `${file} ends with an explicit verdict`);

    const verdictCell = [...codeCells].reverse().find((cell) => cellSource(cell).includes('print_verdict('));
    assert.ok(verdictCell, `${file} has a code cell that prints the verdict`);

    const notebookText = JSON.stringify(nb);
    if (file === 'model_training.ipynb') {
      assert.ok(notebookText.includes('strategy_draft'), `${file} emits a strategy draft`);
    }
    if (file === 'walk_forward_optimization.ipynb') {
      assert.ok(notebookText.includes('stability threshold'), `${file} checks walk-forward stability`);
    }
    if (file === 'data_exploration.ipynb') {
      assert.ok(notebookText.includes('stale 1d rows remain'), `${file} exposes freshness gating`);
    }
  }
});
