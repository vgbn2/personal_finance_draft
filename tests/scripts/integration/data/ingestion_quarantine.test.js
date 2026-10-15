'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  QUARANTINE_REASONS,
  validateIngestRecord,
  quarantineRecord,
  readQuarantineRecords,
  computePayloadHash,
} = require('../../../../shared/lib/data/quarantine');
const { runIngestBatch, FAMILIES_MANIFEST } = require('../../../../shared/lib/data/ingestion');

describe('Ingestion Staging & Quarantine Engine', () => {
  let tempQuarantineDir;

  before(() => {
    tempQuarantineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign_quarantine_test_'));
  });

  after(() => {
    try {
      if (tempQuarantineDir && fs.existsSync(tempQuarantineDir)) {
        fs.rmSync(tempQuarantineDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test('validateIngestRecord passes valid market observation', () => {
    const valid = {
      timestamp: new Date().toISOString(),
      open: 100.5,
      high: 105.0,
      low: 99.0,
      close: 102.3,
      value: 1000000,
    };
    const result = validateIngestRecord(valid, 'equities');
    assert.equal(result.valid, true);
  });

  test('validateIngestRecord detects NON_FINITE_PRICE', () => {
    const nanPrice = { close: NaN, open: 100 };
    assert.equal(validateIngestRecord(nanPrice).reason, QUARANTINE_REASONS.NON_FINITE_PRICE);

    const negativePrice = { close: -5.0, open: 100 };
    assert.equal(validateIngestRecord(negativePrice).reason, QUARANTINE_REASONS.NON_FINITE_PRICE);

    const infPrice = { close: Infinity, open: 100 };
    assert.equal(validateIngestRecord(infPrice).reason, QUARANTINE_REASONS.NON_FINITE_PRICE);
  });

  test('validateIngestRecord accepts finite signed macro values only', () => {
    assert.equal(validateIngestRecord({ value: -0.25 }, 'macro').valid, true);
    assert.equal(validateIngestRecord({ value: 0 }, 'macro').valid, true);
    assert.equal(
      validateIngestRecord({ value: Number.NaN }, 'macro').reason,
      QUARANTINE_REASONS.NON_FINITE_PRICE,
    );
    assert.equal(
      validateIngestRecord({ close: -0.25 }, 'macro').reason,
      QUARANTINE_REASONS.NON_FINITE_PRICE,
    );
    assert.equal(
      validateIngestRecord({ value: -0.25 }, 'equities').reason,
      QUARANTINE_REASONS.NON_FINITE_PRICE,
    );
  });

  test('validateIngestRecord detects NEGATIVE_SPREAD', () => {
    const inverted = { bid: 105.0, ask: 95.0, timestamp: Date.now() };
    const result = validateIngestRecord(inverted);
    assert.equal(result.valid, false);
    assert.equal(result.reason, QUARANTINE_REASONS.NEGATIVE_SPREAD);
  });

  test('validateIngestRecord detects TIME_JUMP on future timestamps and malformed dates', () => {
    const malformed = { close: 100, timestamp: 'invalid-date-string' };
    assert.equal(validateIngestRecord(malformed).reason, QUARANTINE_REASONS.TIME_JUMP);

    const futureTime = Date.now() + 10 * 60 * 1000; // 10 minutes in future (> 5m threshold)
    const futureRecord = { close: 100, timestamp: futureTime };
    assert.equal(validateIngestRecord(futureRecord).reason, QUARANTINE_REASONS.TIME_JUMP);
  });

  test('validateIngestRecord detects MALFORMED_ROW on non-object input', () => {
    assert.equal(validateIngestRecord(null).reason, QUARANTINE_REASONS.MALFORMED_ROW);
    assert.equal(validateIngestRecord('string-row').reason, QUARANTINE_REASONS.MALFORMED_ROW);
    assert.equal(validateIngestRecord([1, 2, 3]).reason, QUARANTINE_REASONS.MALFORMED_ROW);
  });

  test('quarantineRecord persists forensic JSONL with hash and reason code', () => {
    const badRecord = { symbol: 'BADCOIN', close: -99.9, timestamp: Date.now() };
    const event = quarantineRecord(
      badRecord,
      QUARANTINE_REASONS.NON_FINITE_PRICE,
      'Negative close price detected',
      {
        family: 'crypto',
        symbol: 'BADCOIN',
        storageDir: tempQuarantineDir,
        now: '2026-10-08T10:00:00Z',
      }
    );

    assert.equal(event.family, 'crypto');
    assert.equal(event.symbol, 'BADCOIN');
    assert.equal(event.reason_code, QUARANTINE_REASONS.NON_FINITE_PRICE);
    assert.equal(event.payload_hash, computePayloadHash(badRecord));

    // Verify written file
    const records = readQuarantineRecords({
      family: 'crypto',
      storageDir: tempQuarantineDir,
    });
    assert.equal(records.length, 1);
    assert.equal(records[0].symbol, 'BADCOIN');
    assert.equal(records[0].reason_code, QUARANTINE_REASONS.NON_FINITE_PRICE);
  });

  test('runIngestBatch isolates bad records without failing batch', async () => {
    // Custom test config isolating crypto family
    const mockConfig = {
      crypto: {
        enabled: true,
        symbols: ['TEST_PAIR'],
        providers: ['binance'],
        timeframes: ['1d'],
      },
    };

    // Save original fetcher
    const cryptoManifest = FAMILIES_MANIFEST.find((f) => f.id === 'crypto');
    const originalFetcher = cryptoManifest.fetcher;

    try {
      // Stub fetcher to return 1 valid and 2 corrupted records
      cryptoManifest.fetcher = async () => [
        { open: 100, high: 105, low: 98, close: 102, timestamp: Date.now() - 1000 },
        { open: 100, high: 105, low: 98, close: -1, timestamp: Date.now() - 1000 }, // Bad: negative close
        { open: 100, high: 105, low: 98, close: 102, timestamp: 'bad-date' }, // Bad: unparseable time
      ];

      const snapshot = await runIngestBatch(mockConfig, {
        family: 'crypto',
        quarantineDir: tempQuarantineDir,
      });

      assert.equal(snapshot.sources.length, 1);
      assert.equal(snapshot.quarantine_count, 2);
      assert.equal(snapshot.sources[0].close, 102);

      // Verify records in quarantine
      const quarantined = readQuarantineRecords({
        family: 'crypto',
        storageDir: tempQuarantineDir,
      });
      // Previous test had 1 + this batch added 2 = 3
      assert.equal(quarantined.length, 3);
    } finally {
      cryptoManifest.fetcher = originalFetcher;
    }
  });
});
