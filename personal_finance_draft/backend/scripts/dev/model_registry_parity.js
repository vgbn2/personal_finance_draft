const fs = require('node:fs');
const path = require('node:path');

const { modelCandidates } = require('../../../shared/lib/ml/models');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CPP_REGISTRY_PATH = path.join(REPO_ROOT, 'backend', 'core', 'src', 'ml', 'model_registry.cpp');

function parseCppModelRegistry(source = fs.readFileSync(CPP_REGISTRY_PATH, 'utf8')) {
  const candidates = [];
  const rowPattern = /\{\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/g;
  let match;
  while ((match = rowPattern.exec(source)) !== null) {
    candidates.push({
      name: match[1],
      family: match[2],
      status: match[3],
      description: match[4],
    });
  }
  return candidates;
}

function keyFor(candidate) {
  return `${candidate.name}|${candidate.family}|${candidate.status}`;
}

function compareModelRegistries({ jsCandidates = modelCandidates, cppCandidates = parseCppModelRegistry() } = {}) {
  const jsKeys = new Set(jsCandidates.map(keyFor));
  const cppKeys = new Set(cppCandidates.map(keyFor));
  const onlyInJs = [...jsKeys].filter((key) => !cppKeys.has(key)).sort();
  const onlyInCpp = [...cppKeys].filter((key) => !jsKeys.has(key)).sort();
  const families = [...new Set([...jsCandidates, ...cppCandidates].map((candidate) => candidate.family))].sort();
  return {
    ok: onlyInJs.length === 0 && onlyInCpp.length === 0 && jsCandidates.length === cppCandidates.length,
    js_count: jsCandidates.length,
    cpp_count: cppCandidates.length,
    families,
    only_in_js: onlyInJs,
    only_in_cpp: onlyInCpp,
  };
}

if (require.main === module) {
  const report = compareModelRegistries();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

module.exports = {
  CPP_REGISTRY_PATH,
  compareModelRegistries,
  parseCppModelRegistry,
};
