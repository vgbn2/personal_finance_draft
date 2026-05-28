const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const targetDir = path.join(REPO_ROOT, 'scripts', 'test', 'fixtures', 'outputs');

const categories = {
  validation: [],
  backend: [],
  ingestion_and_quotes: [],
  ml_and_backtest: [],
  misc: [],
};

function categoryFor(file) {
  if (file.startsWith('validator_')) return 'validation';
  if (file.startsWith('backend_')) return 'backend';
  if (
    file.includes('quote') ||
    file.includes('stooq') ||
    file.includes('nasa_power') ||
    file.includes('csv') ||
    file.includes('polymarket') ||
    file.includes('google_search') ||
    file.includes('credential') ||
    file.includes('dedupepreferredmarketquotes') ||
    file.includes('prediction_interest_wrapper')
  ) {
    return 'ingestion_and_quotes';
  }
  if (
    file.includes('model') ||
    file.includes('backtest') ||
    file.includes('indicator') ||
    file.includes('tail_risk') ||
    file.includes('strategy')
  ) {
    return 'ml_and_backtest';
  }
  return 'misc';
}

function organizeFixtureOutputs() {
  if (!fs.existsSync(targetDir)) {
    return { targetDir, moved: 0, categories };
  }

  for (const file of fs.readdirSync(targetDir)) {
    if (!file.endsWith('.json')) continue;
    categories[categoryFor(file)].push(file);
  }

  let moved = 0;
  for (const [category, files] of Object.entries(categories)) {
    if (files.length === 0) continue;
    const categoryDir = path.join(targetDir, category);
    fs.mkdirSync(categoryDir, { recursive: true });
    for (const file of files) {
      fs.renameSync(path.join(targetDir, file), path.join(categoryDir, file));
      moved += 1;
    }
  }

  return { targetDir, moved, categories };
}

if (require.main === module) {
  const result = organizeFixtureOutputs();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  categoryFor,
  organizeFixtureOutputs,
};
