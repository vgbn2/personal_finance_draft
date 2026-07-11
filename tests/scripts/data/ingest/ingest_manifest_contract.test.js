'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const manifests = require(path.join(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/manifests.js'));
const ingestPath = require.resolve(path.join(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data'));
const ingestIndexPath = require.resolve(path.join(REPO_ROOT, 'backend/scripts/data_ops/ingest_market_data/index.js'));

const UNIMPLEMENTED_FAMILIES = [
  ['pmi', 'spglobal'],
  ['flight', 'opensky'],
  ['crypto_tx', 'blockchair'],
  ['holdings', 'sec'],
  ['onchain', 'blockchair'],
  ['breadth', 'yahoo'],
];

test('enabled placeholder ingest families fail explicitly instead of returning empty records', async () => {
  for (const [familyId, provider] of UNIMPLEMENTED_FAMILIES) {
    const family = manifests.FAMILIES_MANIFEST.find((entry) => entry.id === familyId);
    assert.ok(family, `expected family manifest for ${familyId}`);
    assert.deepEqual(family.availability, { status: 'not_implemented', provider });
    assert.deepEqual(manifests.getIngestFamilyAvailability(familyId), {
      available: false,
      family: familyId,
      status: 'not_implemented',
      provider,
    });

    await assert.rejects(
      () => family.fetcher(provider, 'sample', ['1d'], {}, {}),
      (error) => {
        assert.equal(error.code, 'not_implemented');
        assert.equal(error.provider, provider);
        assert.equal(error.family, familyId);
        assert.match(error.message, /not implemented/);
        return true;
      },
      `${familyId} must reject with not_implemented`,
    );
  }
});

test('ingestMarketData dry-run returns a read-only plan before provider fetch and persistence', async () => {
  const originalWriteFile = fsPromises.writeFile;
  const originalMkdir = fsPromises.mkdir;
  const writeCalls = [];
  const mkdirCalls = [];

  fsPromises.writeFile = async (filePath, ...args) => {
    writeCalls.push(String(filePath));
    throw new Error(`dry-run attempted writeFile: ${filePath}`);
  };
  fsPromises.mkdir = async (dirPath, ...args) => {
    mkdirCalls.push(String(dirPath));
    throw new Error(`dry-run attempted mkdir: ${dirPath}`);
  };
  delete require.cache[ingestPath];
  delete require.cache[ingestIndexPath];

  try {
    const { ingestMarketData } = require(ingestPath);
    const snapshot = await ingestMarketData({ family: 'pmi', dryRun: true });

    assert.equal(snapshot.mode, 'dry_run');
    assert.equal(snapshot.dry_run, true);
    assert.equal(snapshot.sources.length, 0);
    assert.equal(snapshot.errors.length, 0);
    assert.ok(snapshot.dry_run_plan);
    assert.equal(snapshot.dry_run_plan.target_family, 'pmi');
    assert.equal(snapshot.dry_run_plan.planned_fetches, 0);
    assert.deepEqual(snapshot.dry_run_plan.families.map((family) => ({
      family: family.family,
      available: family.available,
      reason: family.reason,
      planned_fetches: family.planned_fetches,
    })), [{
      family: 'pmi',
      available: false,
      reason: 'not_implemented',
      planned_fetches: 0,
    }]);
    assert.equal(writeCalls.length, 0, 'dry-run must not write cache snapshots');
    assert.equal(mkdirCalls.length, 0, 'dry-run must not create cache directories');
    assert.ok(snapshot.provider_checks.some((check) =>
      check.family === 'pmi' &&
      check.provider === 'spglobal' &&
      check.status === 'skipped' &&
      check.reason === 'not_implemented'
    ));
    assert.ok(snapshot.provider_checks.some((check) => check.reason === 'dry_run'));
  } finally {
    fsPromises.writeFile = originalWriteFile;
    fsPromises.mkdir = originalMkdir;
    delete require.cache[ingestPath];
    delete require.cache[ingestIndexPath];
  }
});

test('direct unavailable-family ingest fails before provider or persistence work', async () => {
  const originalWriteFile = fsPromises.writeFile;
  const originalMkdir = fsPromises.mkdir;
  const writeCalls = [];
  const mkdirCalls = [];

  fsPromises.writeFile = async (filePath) => {
    writeCalls.push(String(filePath));
    throw new Error(`unavailable ingest attempted writeFile: ${filePath}`);
  };
  fsPromises.mkdir = async (dirPath) => {
    mkdirCalls.push(String(dirPath));
    throw new Error(`unavailable ingest attempted mkdir: ${dirPath}`);
  };
  delete require.cache[ingestPath];
  delete require.cache[ingestIndexPath];

  try {
    const { ingestMarketData } = require(ingestPath);
    const snapshot = await ingestMarketData({ family: 'pmi' });

    assert.equal(snapshot.mode, 'not_implemented');
    assert.equal(snapshot.sources.length, 0);
    assert.equal(snapshot.errors.length, 1);
    assert.deepEqual(snapshot.errors[0], {
      code: 'not_implemented',
      family: 'pmi',
      provider: 'spglobal',
      message: 'spglobal pmi provider is not implemented',
    });
    assert.equal(writeCalls.length, 0);
    assert.equal(mkdirCalls.length, 0);
  } finally {
    fsPromises.writeFile = originalWriteFile;
    fsPromises.mkdir = originalMkdir;
    delete require.cache[ingestPath];
    delete require.cache[ingestIndexPath];
  }
});
