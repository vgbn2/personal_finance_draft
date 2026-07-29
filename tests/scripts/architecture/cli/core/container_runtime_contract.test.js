'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

test('canonical and compatibility Dockerfiles use a non-root build-separated runtime', () => {
  const root = fs.readFileSync(path.join(REPO_ROOT, 'Dockerfile'), 'utf8');
  const canonical = fs.readFileSync(path.join(REPO_ROOT, 'infra', 'docker', 'Dockerfile'), 'utf8');
  assert.equal(root, canonical);
  assert.match(canonical, /^FROM node:22-bookworm AS build$/m);
  assert.match(canonical, /^FROM node:22-bookworm-slim AS runtime$/m);
  assert.match(canonical, /^USER node$/m);
  assert.doesNotMatch(canonical.split('FROM node:22-bookworm-slim AS runtime')[1], /apt-get|build-essential/);
  assert.match(canonical, /COPY --from=build --chown=node:node/);
  assert.doesNotMatch(canonical, /\/app\/native\b/);
  assert.doesNotMatch(canonical, /\/app\/workspace\/STATE\.md\b/);
  assert.match(
    canonical,
    /\/app\/scripts\/data_ops\/backfill_20_years\.js \.\/scripts\/data_ops\/backfill_20_years\.js/,
  );
});
