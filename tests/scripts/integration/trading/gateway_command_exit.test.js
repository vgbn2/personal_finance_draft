const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const {
  createPolymarketReadAdapter,
  main,
  runGatewayEntrypoint,
} = require('../../../../backend/gateway/src/index.ts');

async function invokeMain(args, surface = 'gateway_public') {
  const originalArgv = process.argv;
  const originalSurface = process.env.SOVEREIGN_ENVIRONMENT_SURFACE;
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  const calls = [];
  process.argv = [process.execPath, 'gateway-fixture', ...args];
  process.env.SOVEREIGN_ENVIRONMENT_SURFACE = surface;
  process.exitCode = undefined;
  console.log = (...values) => calls.push(['log', ...values]);
  console.error = (...values) => calls.push(['error', ...values]);
  try {
    await runGatewayEntrypoint(main);
    return { calls, exitCode: process.exitCode };
  } finally {
    process.argv = originalArgv;
    if (originalSurface === undefined) delete process.env.SOVEREIGN_ENVIRONMENT_SURFACE;
    else process.env.SOVEREIGN_ENVIRONMENT_SURFACE = originalSurface;
    process.exitCode = originalExitCode;
    console.log = originalLog;
    console.error = originalError;
  }
}

test('gateway entrypoint makes an uncaught command rejection observable', async () => {
  const originalExitCode = process.exitCode;
  const originalError = console.error;
  const errors = [];
  process.exitCode = undefined;
  console.error = (...values) => errors.push(values);
  try {
    await runGatewayEntrypoint(async () => {
      throw new Error('fixture rejection');
    });
    assert.equal(process.exitCode, 1);
    assert.match(String(errors[0][0]), /fixture rejection/);
  } finally {
    process.exitCode = originalExitCode;
    console.error = originalError;
  }
});

test('Polymarket read factory preserves explicit funder and signature options', () => {
  const readAdapter = createPolymarketReadAdapter({
    funderAddress: '0xfixture-funder',
    signatureType: 3,
  });
  assert.deepEqual(readAdapter.getAccountIdentity(), {
    funderAddress: '0xfixture-funder',
    signatureType: 3,
  });
  assert.equal(typeof readAdapter.isConfigured, 'function');
});

test('main reports invalid process input and unknown top-level commands with nonzero exit status', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-command-exit-'));
  const invalidEnvelope = path.join(tempDir, 'invalid-envelope.json');
  const invalidJson = path.join(tempDir, 'invalid-json.json');
  const emptyBatch = path.join(tempDir, 'empty-batch.json');
  fs.writeFileSync(invalidEnvelope, JSON.stringify({ unsupported: true }));
  fs.writeFileSync(invalidJson, '{"orders":[');
  fs.writeFileSync(emptyBatch, JSON.stringify({ orders: [] }));

  for (const filePath of [invalidEnvelope, invalidJson]) {
    const result = await invokeMain(['process', filePath, '--json'], 'execution');
    assert.equal(result.exitCode, 1);
    assert.match(JSON.stringify(result.calls), /Error reading proposed orders/);
  }

  const empty = await invokeMain(['process', emptyBatch, '--json'], 'execution');
  assert.equal(empty.exitCode, undefined);
  assert.match(JSON.stringify(empty.calls), /Found 0 orders/);

  const missing = await invokeMain(['process', path.join(tempDir, 'missing.json'), '--json'], 'execution');
  assert.equal(missing.exitCode, undefined);
  assert.match(JSON.stringify(missing.calls), /Skipping/);

  const unknown = await invokeMain(['unknown-command', '--json']);
  assert.equal(unknown.exitCode, 1);
  assert.match(JSON.stringify(unknown.calls), /Unknown command/);

  const unknownPolymarket = await invokeMain(['polymarket', 'unknown-command', '--json']);
  assert.equal(unknownPolymarket.exitCode, 1);
  assert.match(JSON.stringify(unknownPolymarket.calls), /Unknown polymarket subcommand/);
});
