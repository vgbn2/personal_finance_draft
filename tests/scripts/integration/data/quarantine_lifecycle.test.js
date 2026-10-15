'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  quarantineRecord,
  getQuarantineMetrics,
  pruneQuarantineRecords,
  QUARANTINE_REASONS,
} = require('../../../../shared/lib/data/quarantine');

const { runMaintenance } = require('../../../../shared/lib/data/db_pruning');
const systemStatusRoute = require('../../../../backend/api/server/routes/system/system');

test('Quarantine Storage Lifecycle: metrics aggregation, retention pruning, and API route telemetry', async () => {
  const testDir = path.join(
    __dirname,
    '../../../../storage/data/test_quarantine_' + Date.now()
  );

  try {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    const now = new Date('2026-10-14T12:00:00.000Z');

    // 1. Seed 4 quarantined files with varying age:
    //    File A: 45 days old (2026-08-30) -> Should be pruned
    //    File B: 35 days old (2026-09-09) -> Should be pruned
    //    File C: 10 days old (2026-10-04) -> Should be kept
    //    File D: Today (2026-10-14)       -> Should be kept
    const dateOld45 = new Date('2026-08-30T10:00:00.000Z');
    const dateOld35 = new Date('2026-09-09T10:00:00.000Z');
    const dateRecent10 = new Date('2026-10-04T10:00:00.000Z');
    const dateToday = now;

    quarantineRecord(
      { symbol: 'BTC/USD', close: NaN },
      QUARANTINE_REASONS.NON_FINITE_PRICE,
      'Close is NaN',
      { storageDir: testDir, family: 'crypto', now: dateOld45 }
    );

    quarantineRecord(
      { symbol: 'AAPL', bid: 150, ask: 145 },
      QUARANTINE_REASONS.NEGATIVE_SPREAD,
      'Inverted spread',
      { storageDir: testDir, family: 'equities', now: dateOld35 }
    );

    quarantineRecord(
      { symbol: 'EURUSD', timestamp: 'invalid-time' },
      QUARANTINE_REASONS.TIME_JUMP,
      'Invalid timestamp',
      { storageDir: testDir, family: 'fx', now: dateRecent10 }
    );

    quarantineRecord(
      { symbol: 'ETH/USD', close: -50 },
      QUARANTINE_REASONS.NON_FINITE_PRICE,
      'Negative price',
      { storageDir: testDir, family: 'crypto', now: dateToday }
    );

    // 2. Test getQuarantineMetrics before pruning
    const metricsBefore = getQuarantineMetrics({ storageDir: testDir });

    console.log(
      `[Quarantine Metrics Before Pruning] TotalQuarantined=${metricsBefore.total_quarantined} ` +
      `FileCount=${metricsBefore.file_count} ByReason=${JSON.stringify(metricsBefore.by_reason)} ` +
      `ByFamily=${JSON.stringify(metricsBefore.by_family)} LatestAnomaly=${metricsBefore.latest_anomaly?.symbol}`
    );

    assert.strictEqual(metricsBefore.total_quarantined, 4, 'Total quarantined must be 4');
    assert.strictEqual(metricsBefore.file_count, 4, 'File count must be 4');
    assert.strictEqual(metricsBefore.by_reason[QUARANTINE_REASONS.NON_FINITE_PRICE], 2);
    assert.strictEqual(metricsBefore.by_reason[QUARANTINE_REASONS.NEGATIVE_SPREAD], 1);
    assert.strictEqual(metricsBefore.by_reason[QUARANTINE_REASONS.TIME_JUMP], 1);
    assert.strictEqual(metricsBefore.by_family.crypto, 2);
    assert.strictEqual(metricsBefore.by_family.equities, 1);
    assert.strictEqual(metricsBefore.by_family.fx, 1);
    assert.strictEqual(metricsBefore.latest_anomaly.symbol, 'ETH/USD');
    assert.strictEqual(metricsBefore.latest_anomaly.reason_code, QUARANTINE_REASONS.NON_FINITE_PRICE);

    // 3. Test pruneQuarantineRecords with daysToKeep = 30
    const pruneResult = pruneQuarantineRecords(30, { storageDir: testDir, now });

    console.log(
      `[Quarantine Pruning Execution] PrunedFiles=${pruneResult.pruned_files} ` +
      `FreedBytes=${pruneResult.freed_bytes} RetentionDays=30`
    );

    assert.strictEqual(pruneResult.pruned_files, 2, 'Files older than 30 days must be pruned (2 files)');
    assert.ok(pruneResult.freed_bytes > 0, 'Freed bytes must be positive');

    // Verify remaining files on disk
    const remainingFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.jsonl'));
    console.log(`[Remaining Files on Disk] ${JSON.stringify(remainingFiles)}`);
    assert.strictEqual(remainingFiles.length, 2, 'Exactly 2 recent files must remain');
    assert.ok(remainingFiles.some((f) => f.includes('2026-10-04')));
    assert.ok(remainingFiles.some((f) => f.includes('2026-10-14')));

    // 4. Test getQuarantineMetrics after pruning
    const metricsAfter = getQuarantineMetrics({ storageDir: testDir });
    assert.strictEqual(metricsAfter.total_quarantined, 2, 'Total quarantined must now be 2');
    assert.strictEqual(metricsAfter.file_count, 2, 'File count must now be 2');

    // 5. Test API System Status Endpoint Integration
    const statusPayload = systemStatusRoute.handle();
    assert.ok(statusPayload.components, 'System status payload must contain components');
    assert.ok(statusPayload.components.quarantine, 'System status must contain quarantine component');
    assert.equal(
      typeof statusPayload.components.quarantine.total_quarantined,
      'number',
      'total_quarantined must be a numeric field'
    );
    assert.equal(
      typeof statusPayload.components.quarantine.by_reason,
      'object',
      'by_reason must be an object'
    );

    console.log(
      `[API System Status Quarantine Check] Component Present=true ` +
      `TotalQuarantined=${statusPayload.components.quarantine.total_quarantined} Status=PASS`
    );
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
});
