const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { upsertEnvFile } = require('../../../shared/lib/brokers/common');
const { buildPolymarketReport, resolveSignatureType } = require('../../../shared/lib/brokers/polymarket_env');

test('upsertEnvFile preserves comments and writes quoted values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-env-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, [
    '# existing header',
    'ALPACA_API_KEY=oldkey',
    '',
  ].join('\n'), 'utf8');

  const result = upsertEnvFile({
    ALPACA_API_KEY: 'new key with spaces',
    ALPACA_SECRET_KEY: 'super-secret',
  }, envPath);

  const content = fs.readFileSync(envPath, 'utf8');
  assert.ok(content.includes('# existing header'));
  assert.ok(content.includes('ALPACA_API_KEY="new key with spaces"'));
  assert.ok(content.includes('ALPACA_SECRET_KEY=super-secret'));
  assert.equal(result.env_path, envPath);
  assert.ok(result.updated.includes('ALPACA_API_KEY'));
});

test('polymarket report redacts secrets and derives deposit signature type', () => {
  const report = buildPolymarketReport({
    POLYMARKET_PRIVATE_KEY: '0xabc123',
    POLYMARKET_API_KEY: 'key-123',
    POLYMARKET_API_SECRET: 'secret-123',
    POLYMARKET_API_PASSPHRASE: 'pass-123',
    POLYMARKET_FUNDER_ADDRESS: '0xfeedface',
    POLYMARKET_CLOB_HOST: 'https://clob.polymarket.com',
  });

  assert.equal(report.ok, true);
  assert.equal(report.mode, 2);
  assert.deepEqual(report.validation_errors, []);
  assert.equal(resolveSignatureType({
    POLYMARKET_PRIVATE_KEY: '0xabc123',
    POLYMARKET_FUNDER_ADDRESS: '0xfeedface',
  }), 2);
  const secretFields = report.fields.filter((field) => field.secret);
  assert.ok(secretFields.every((field) => field.value === '[redacted]'));
});
