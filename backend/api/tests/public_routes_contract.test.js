'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  generatePublicMarketArtifacts,
  readPublicArtifact,
  ARTIFACTS_DIR,
  DELAY_MS,
} = require('../server/services/public_artifact_publisher');

const publicMarketSummary = require('../server/routes/public/public_market_summary');
const publicFreshness = require('../server/routes/public/public_freshness');
const publicResearchSummary = require('../server/routes/public/public_research_summary');

test('B2 Public Artifact Publisher: generates 24h-delayed signed static artifacts', () => {
  const result = generatePublicMarketArtifacts();
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(path.join(ARTIFACTS_DIR, 'public_market_summary.json')), true);
  assert.equal(fs.existsSync(path.join(ARTIFACTS_DIR, 'public_freshness_status.json')), true);
  assert.equal(fs.existsSync(path.join(ARTIFACTS_DIR, 'public_research_summary.json')), true);

  const summary = readPublicArtifact('public_market_summary');
  assert.equal(summary.ok, true);
  assert.equal(summary.status_code, 200);
  assert.equal(summary.artifact.delay_hours, 24);
  assert.equal(summary.artifact.research_only, true);
  assert.equal(summary.artifact.live_authorized, false);
  assert.ok(summary.artifact.checksum);
});

test('B2 Public Routes: handlers expose correct paths and status mappers', async () => {
  assert.equal(publicMarketSummary.path, '/api/public/market-summary');
  assert.equal(publicFreshness.path, '/api/public/freshness');
  assert.equal(publicResearchSummary.path, '/api/public/research-summary');

  const summaryRes = await publicMarketSummary.handle();
  assert.equal(summaryRes.ok, true);
  assert.equal(publicMarketSummary.status(summaryRes), 200);

  const freshnessRes = await publicFreshness.handle();
  assert.equal(freshnessRes.ok, true);
  assert.equal(publicFreshness.status(freshnessRes), 200);

  const researchRes = await publicResearchSummary.handle();
  assert.equal(researchRes.ok, true);
  assert.equal(publicResearchSummary.status(researchRes), 200);
});

test('B2 Public Artifact Publisher: fails closed on missing artifact', () => {
  const missing = readPublicArtifact('nonexistent_artifact_xyz');
  // Since lazy generation runs for public_market_summary, for completely unknown names it fails closed
  assert.equal(missing.ok, false);
  assert.equal(missing.status_code, 503);
  assert.equal(missing.error_code, 'artifact_unavailable');
});
