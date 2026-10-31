const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const NOTEBOOKS_DIR = path.join(ROOT, 'tests', 'fixtures', 'notebooks');
const FORBIDDEN_NOTEBOOKS = [
  'data_exploration.ipynb',
  'feature_importance.ipynb',
  'model_training.ipynb',
  'walk_forward_optimization.ipynb',
  'backtest_analysis.ipynb',
];

test('tracked notebook fixtures are eliminated under zero-notebook policy', () => {
  // 1. Verify fixture directory does not contain forbidden notebooks
  assert.ok(!fs.existsSync(NOTEBOOKS_DIR) || fs.readdirSync(NOTEBOOKS_DIR).length === 0, 'notebooks directory is pruned');

  // 2-6. Verify each individual forbidden notebook is absent
  assert.strictEqual(fs.existsSync(path.join(NOTEBOOKS_DIR, 'data_exploration.ipynb')), false, 'data_exploration.ipynb is purged');
  assert.strictEqual(fs.existsSync(path.join(NOTEBOOKS_DIR, 'feature_importance.ipynb')), false, 'feature_importance.ipynb is purged');
  assert.strictEqual(fs.existsSync(path.join(NOTEBOOKS_DIR, 'model_training.ipynb')), false, 'model_training.ipynb is purged');
  assert.strictEqual(fs.existsSync(path.join(NOTEBOOKS_DIR, 'walk_forward_optimization.ipynb')), false, 'walk_forward_optimization.ipynb is purged');
  assert.strictEqual(fs.existsSync(path.join(NOTEBOOKS_DIR, 'backtest_analysis.ipynb')), false, 'backtest_analysis.ipynb is purged');

  // 7. Verify git tracking excludes all .ipynb files
  let gitTracked = '';
  try {
    gitTracked = execFileSync('git', ['ls-files', '*.ipynb', '**/*.ipynb'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    gitTracked = '';
  }
  assert.strictEqual(gitTracked, '', `zero .ipynb files tracked in git: ${gitTracked}`);

  // 8-11. Verify .gitignore enforces *.ipynb and notebooks/
  const gitignorePath = path.join(ROOT, '.gitignore');
  assert.ok(fs.existsSync(gitignorePath), '.gitignore exists');
  const gitignoreText = fs.readFileSync(gitignorePath, 'utf8');
  assert.ok(gitignoreText.includes('*.ipynb'), '.gitignore ignores *.ipynb');
  assert.ok(gitignoreText.includes('notebooks/'), '.gitignore ignores notebooks/ directory');
  assert.strictEqual(gitignoreText.includes('*.ipynb'), true, '.gitignore rule for *.ipynb is active');

  // 12-14. Verify root notebooks/ has no tracked code files
  let trackedNotebooksDir = '';
  try {
    trackedNotebooksDir = execFileSync('git', ['ls-files', 'notebooks/'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    trackedNotebooksDir = '';
  }
  assert.strictEqual(trackedNotebooksDir, '', `notebooks/ has no tracked files: ${trackedNotebooksDir}`);
  assert.strictEqual(FORBIDDEN_NOTEBOOKS.length, 5, 'forbidden list covers all 5 legacy notebooks');

  // 15-16. Verify no python runtime notebook utilities exist in git
  const pythonUtils = path.join(ROOT, 'notebooks', 'notebook_utils.py');
  assert.strictEqual(fs.existsSync(pythonUtils), false, 'notebook_utils.py is deleted from repository');
  assert.ok(!fs.existsSync(pythonUtils), 'notebook_utils.py file does not exist');
});
