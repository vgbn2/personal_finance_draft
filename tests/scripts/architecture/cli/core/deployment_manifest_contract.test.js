const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const DOCKER_COMPOSE = path.join(REPO_ROOT, 'infra', 'docker', 'docker-compose.yml');
const K8S_DEPLOYMENT = path.join(REPO_ROOT, 'infra', 'deployment', 'kubernetes', 'deployment.yaml');
const K8S_CONFIGMAP = path.join(REPO_ROOT, 'infra', 'deployment', 'kubernetes', 'configmap.yaml');
const DEPLOYMENT_DOC = path.join(REPO_ROOT, 'docs', 'operational', 'guides', 'DEPLOYMENT.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('deployment manifests and docs agree on the active web bridge contract', () => {
  const compose = read(DOCKER_COMPOSE);
  const deployment = read(K8S_DEPLOYMENT);
  const configmap = read(K8S_CONFIGMAP);
  const docs = read(DEPLOYMENT_DOC);

  assert.match(compose, /SOVEREIGN_WEB_PORT:\s*8787/);
  assert.match(compose, /SOVEREIGN_CACHE_TTL_MS:\s*30000/);
  assert.match(compose, /SOVEREIGN_CACHE_MAX_ENTRIES:\s*100/);

  assert.match(deployment, /containerPort:\s*8787/);
  assert.match(deployment, /name:\s*sovereign-supabase/);
  assert.match(deployment, /key:\s*url/);
  assert.match(deployment, /key:\s*publishable_key/);
  assert.match(deployment, /key:\s*secret_key/);

  assert.match(configmap, /SOVEREIGN_CACHE_TTL_MS:\s*"30000"/);
  assert.match(configmap, /SOVEREIGN_CACHE_MAX_ENTRIES:\s*"100"/);

  assert.match(docs, /Supabase-backed database\/auth available/i);
  assert.match(docs, /sovereign-supabase/i);
  assert.doesNotMatch(docs, /no database/i);
  assert.doesNotMatch(docs, /no secrets/i);

  console.log(JSON.stringify({
    type: 'deployment_manifest_contract',
    compose_port: 8787,
    cache_ttl_ms: 30000,
    supabase_secret_ref: true,
    docs_aligned: true,
  }, null, 2));
});
