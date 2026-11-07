'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadEnvSchema,
  validateSecretKey,
  validateSecretsBatch,
  parseBatchInput,
  listSecrets,
  writeSecrets,
} = require('../../../shared/lib/settings/secrets');
const { commandSecret } = require('../../../frontend/cli-tui/commands/settings/secret');

test('Secret Management - Schema Loading & Type Rules', () => {
  const schema = loadEnvSchema();
  assert.ok(schema.allowedKeys.has('SOVEREIGN_WEB_PORT'), 'Must contain SOVEREIGN_WEB_PORT');
  assert.ok(schema.allowedKeys.has('ALPACA_LIVE_BASE_URL'), 'Must contain ALPACA_LIVE_BASE_URL');
  assert.ok(schema.allowedKeys.has('SOVEREIGN_DISABLE_MT5_AUTO_PATH'), 'Must contain SOVEREIGN_DISABLE_MT5_AUTO_PATH');
  assert.ok(schema.allowedKeys.has('FRED_API_KEY'), 'Must contain FRED_API_KEY');

  assert.equal(schema.rules.get('SOVEREIGN_WEB_PORT'), 'port');
  assert.equal(schema.rules.get('ALPACA_LIVE_BASE_URL'), 'url');
  assert.equal(schema.rules.get('SOVEREIGN_DISABLE_MT5_AUTO_PATH'), 'boolean');
});

test('Secret Management - Strict Validation Gates', () => {
  const schema = loadEnvSchema();

  // 1. Unrecognized key
  const unk = validateSecretKey('UNRECOGNIZED_SECRET_KEY', 'foo', schema);
  assert.equal(unk.ok, false);
  assert.match(unk.error, /Key 'UNRECOGNIZED_SECRET_KEY' is not defined in .env.example template/);

  // 2. Port validation (1-65535)
  assert.equal(validateSecretKey('SOVEREIGN_WEB_PORT', '8080', schema).ok, true);
  assert.equal(validateSecretKey('SOVEREIGN_WEB_PORT', '0', schema).ok, false);
  assert.equal(validateSecretKey('SOVEREIGN_WEB_PORT', '70000', schema).ok, false);
  assert.equal(validateSecretKey('SOVEREIGN_WEB_PORT', 'invalid-port', schema).ok, false);

  // 3. Boolean validation
  assert.equal(validateSecretKey('SOVEREIGN_DISABLE_MT5_AUTO_PATH', 'true', schema).ok, true);
  assert.equal(validateSecretKey('SOVEREIGN_DISABLE_MT5_AUTO_PATH', 'FALSE', schema).ok, true);
  assert.equal(validateSecretKey('SOVEREIGN_DISABLE_MT5_AUTO_PATH', '1', schema).ok, true);
  assert.equal(validateSecretKey('SOVEREIGN_DISABLE_MT5_AUTO_PATH', 'maybe', schema).ok, false);

  // 4. URL validation
  assert.equal(validateSecretKey('ALPACA_LIVE_BASE_URL', 'https://api.alpaca.markets', schema).ok, true);
  assert.equal(validateSecretKey('ALPACA_LIVE_BASE_URL', 'http://127.0.0.1:8000', schema).ok, true);
  assert.equal(validateSecretKey('ALPACA_LIVE_BASE_URL', 'ftp://bad-proto', schema).ok, false);
  assert.equal(validateSecretKey('ALPACA_LIVE_BASE_URL', 'not a url', schema).ok, false);
});

test('Secret Management - Atomic Batch Validation', () => {
  const schema = loadEnvSchema();
  const validBatch = [
    ['SOVEREIGN_WEB_PORT', '8080'],
    ['SOVEREIGN_DISABLE_MT5_AUTO_PATH', 'true'],
    ['FRED_API_KEY', 'my-api-key'],
  ];
  assert.equal(validateSecretsBatch(validBatch, schema).ok, true);

  const mixedBatch = [
    ['SOVEREIGN_WEB_PORT', '8080'],
    ['INVALID_KEY_NAME', 'value'],
    ['ALPACA_LIVE_BASE_URL', 'bad url'],
  ];
  const res = validateSecretsBatch(mixedBatch, schema);
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 2);
  assert.match(res.errors[0], /INVALID_KEY_NAME/);
  assert.match(res.errors[1], /ALPACA_LIVE_BASE_URL/);
});

test('Secret Management - Batch Input Parsing (JSON & Dotenv)', () => {
  // Dotenv lines
  const envText = `
    SOVEREIGN_WEB_PORT=9000
    # A comment line
    FRED_API_KEY="quoted-key-value"
  `;
  const envEntries = parseBatchInput(envText);
  assert.deepEqual(envEntries, [
    ['SOVEREIGN_WEB_PORT', '9000'],
    ['FRED_API_KEY', 'quoted-key-value'],
  ]);

  // JSON object
  const jsonText = JSON.stringify({
    SOVEREIGN_WEB_PORT: 9000,
    FRED_API_KEY: 'json-key',
  });
  const jsonEntries = parseBatchInput(jsonText);
  assert.deepEqual(jsonEntries, [
    ['SOVEREIGN_WEB_PORT', 9000],
    ['FRED_API_KEY', 'json-key'],
  ]);

  // JSON array of objects
  const jsonArr = JSON.stringify([
    { key: 'SOVEREIGN_WEB_PORT', value: '9000' },
    { key: 'FRED_API_KEY', value: 'arr-key' },
  ]);
  const arrEntries = parseBatchInput(jsonArr);
  assert.deepEqual(arrEntries, [
    ['SOVEREIGN_WEB_PORT', '9000'],
    ['FRED_API_KEY', 'arr-key'],
  ]);
});

test('Secret Management - Atomic Write & POSIX 0600 Permissions', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-secret-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const envFile = path.join(root, '.env');
  fs.writeFileSync(envFile, '# Initial .env header\nFRED_API_KEY=original\n', { mode: 0o644 });

  const entries = [
    ['FRED_API_KEY', 'updated_key'],
    ['SOVEREIGN_WEB_PORT', '9999'],
  ];

  const result = writeSecrets(entries, envFile);
  assert.equal(result.ok, true);

  // Check file stat mode
  const stat = fs.statSync(envFile);
  const modeOctal = (stat.mode & 0o777).toString(8);
  assert.equal(modeOctal, '600', 'File permissions must be POSIX 0600');

  // Verify content
  const content = fs.readFileSync(envFile, 'utf8');
  assert.match(content, /# Initial .env header/);
  assert.match(content, /FRED_API_KEY=updated_key/);
  assert.match(content, /SOVEREIGN_WEB_PORT=9999/);

  // Check listSecrets
  const listed = listSecrets(envFile);
  assert.equal(listed.length, 2);
  const fred = listed.find((item) => item.key === 'FRED_API_KEY');
  assert.ok(fred);
  assert.notEqual(fred.value, 'updated_key', 'Value must be redacted');
});

test('Secret Management - CLI Integration & Atomic Rejection', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-secret-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const envFile = path.join(root, '.env');
  fs.writeFileSync(envFile, 'FRED_API_KEY=initial\n', { mode: 0o600 });

  // 1. Success set
  const exitCode1 = await commandSecret(['set', 'SOVEREIGN_WEB_PORT', '8080', '--env-file', envFile, '--json']);
  assert.equal(exitCode1, 0);
  assert.match(fs.readFileSync(envFile, 'utf8'), /SOVEREIGN_WEB_PORT=8080/);

  // 2. Rejected set (invalid key)
  const exitCode2 = await commandSecret(['set', 'INVALID_VAR', 'val', '--env-file', envFile, '--json']);
  assert.equal(exitCode2, 1);

  // 3. Rejected batch - atomic abort test (must not write any keys)
  const batchFile = path.join(root, 'batch.env');
  fs.writeFileSync(batchFile, 'SOVEREIGN_DISABLE_MT5_AUTO_PATH=true\nNON_EXISTENT_KEY=bar\n');
  const beforeContent = fs.readFileSync(envFile, 'utf8');

  const exitCode3 = await commandSecret(['set', '--batch', batchFile, '--env-file', envFile, '--json']);
  assert.equal(exitCode3, 1);
  const afterContent = fs.readFileSync(envFile, 'utf8');
  assert.equal(beforeContent, afterContent, 'Target .env must be untouched when batch validation fails');

  // 4. List command
  const exitCode4 = await commandSecret(['list', '--env-file', envFile, '--json']);
  assert.equal(exitCode4, 0);
});

test('Secret Management - Unsanitized Input & Shell Metacharacter Protection', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereign-secret-sanitize-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const schema = loadEnvSchema();

  // 1. Rejection of null bytes
  const nullCheck = validateSecretKey('FRED_API_KEY', 'bad\0val', schema);
  assert.equal(nullCheck.ok, false);
  assert.match(nullCheck.error, /null byte/);

  // 2. Rejection of hex or float ports
  assert.equal(validateSecretKey('SOVEREIGN_WEB_PORT', '0x10', schema).ok, false);
  assert.equal(validateSecretKey('SOVEREIGN_WEB_PORT', '80.5', schema).ok, false);

  // 3. Shell metacharacters escaping in serialization
  const envFile = path.join(root, '.env');
  const canaryFile = path.join(root, 'CANARY');
  const payloadVal = `$(touch ${canaryFile})`;
  const backtickVal = `\`touch ${canaryFile}\``;

  writeSecrets([
    ['FRED_API_KEY', payloadVal],
    ['GATEIO_API_KEY', backtickVal],
  ], envFile);

  const envContent = fs.readFileSync(envFile, 'utf8');
  assert.match(envContent, /FRED_API_KEY="\\\$\(touch/);
  assert.match(envContent, /GATEIO_API_KEY="\\`touch/);

  // Verify roundtrip read
  const listed = listSecrets(envFile);
  assert.equal(listed.length, 2);

  // Sourcing in subshell must NOT execute the commands
  const cp = require('node:child_process');
  cp.execFileSync('bash', ['-c', `source ${envFile}`], { encoding: 'utf8' });
  assert.equal(fs.existsSync(canaryFile), false, 'Shell command must not execute on sourcing');
});

test('Secret Management - Serialization & Deserialization Roundtrip', () => {
  const { serializeEnvValue, parseEnvLine } = require('../../../shared/lib/brokers/common');
  const samples = [
    'plain',
    'with spaces and #hash',
    'with"double"and\'single\'quotes',
    'with$dollar and `backtick`',
    'with\\backslash and \\\\two',
    'with\\nliteral_backslash_n',
    'with\nreal_newline',
    'C:\\Program Files\\MetaTrader 5',
  ];

  for (const orig of samples) {
    const serialized = serializeEnvValue(orig);
    const parsed = parseEnvLine(`KEY=${serialized}`);
    assert.equal(parsed.value, orig, `Roundtrip failed for ${JSON.stringify(orig)}`);
  }
});

