const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { pruneApiCache } = require('../../../../shared/lib/providers/common');

test('pruneApiCache removes expired entries and bounds the fresh cache', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-api-cache-'));
  const now = Date.now();
  const writeAt = (name, ageMs) => {
    const file = path.join(cacheDir, name);
    fs.writeFileSync(file, name);
    const timestamp = new Date(now - ageMs);
    fs.utimesSync(file, timestamp, timestamp);
    return file;
  };

  try {
    writeAt('expired-a.json', 5000);
    writeAt('expired-b.json', 4000);
    writeAt('fresh-oldest.json', 900);
    const freshMiddle = writeAt('fresh-middle.json', 600);
    const freshNewest = writeAt('fresh-newest.json', 300);
    writeAt('keep.txt', 10000);

    const result = await pruneApiCache({ cacheDir, maxAgeMs: 1000, maxEntries: 2, now });

    assert.equal(result.scanned, 5);
    assert.equal(result.deleted, 3);
    assert.ok(result.freed_bytes > 0);
    assert.equal(fs.existsSync(freshMiddle), true);
    assert.equal(fs.existsSync(freshNewest), true);
    assert.equal(fs.existsSync(path.join(cacheDir, 'fresh-oldest.json')), false);
    assert.equal(fs.existsSync(path.join(cacheDir, 'keep.txt')), true);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

