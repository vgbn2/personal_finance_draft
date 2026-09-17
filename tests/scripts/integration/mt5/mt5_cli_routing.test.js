'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  maskLogin,
  inspectMt5Setup,
  renderMt5Diagnostics,
  renderMt5ProfileList,
} = require('../../../../backend/cli/commands/trade/trade_mt5.js');

const {
  upsertMt5Profile,
  listMt5Profiles,
  getMt5Profile,
} = require('../../../../shared/lib/profiles/mt5_profiles.js');

test('MT5 CLI Routing: maskLogin hides middle digits of account number', () => {
  assert.equal(maskLogin(''), 'n/a');
  assert.equal(maskLogin(null), 'n/a');
  assert.equal(maskLogin('123'), '***');
  assert.equal(maskLogin('1234'), '****');
  assert.equal(maskLogin('12345678'), '12***78');
  assert.equal(maskLogin('9988776655'), '99***55');
});

test('MT5 CLI Routing: inspectMt5Setup with real vault profiles on disk', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sov-mt5-inspect-test-'));
  const tempTerminal = path.join(tempDir, 'terminal64.exe');
  fs.writeFileSync(tempTerminal, 'dummy-binary-content');

  try {
    const opts = { baseDir: tempDir };

    // 1. Missing profile test
    const report1 = inspectMt5Setup('propfirm', null, '', false);
    assert.equal(report1.ok, false);
    assert.equal(report1.checks.find((c) => c.key === 'profile')?.ok, false);
    assert.equal(report1.checks.find((c) => c.key === 'login')?.ok, false);

    // 2. Real partial profile on disk: saved without password
    upsertMt5Profile({
      slot: 'test',
      label: 'Demo Account Without Password',
      login: '66554433',
      server: 'ICMarketsSC-Demo',
      terminalPath: '/nonexistent/terminal64.exe',
      password: '', // no password
    }, opts);

    const actualPartial = getMt5Profile('test', opts);
    assert.ok(actualPartial, 'Actual profile must exist in vault');
    assert.equal(actualPartial.has_password, false);

    const report2 = inspectMt5Setup('test', actualPartial, actualPartial.terminal_path, true);
    assert.equal(report2.ok, false);
    assert.equal(report2.checks.find((c) => c.key === 'login')?.ok, true);
    assert.equal(report2.checks.find((c) => c.key === 'password')?.ok, false);
    assert.equal(report2.checks.find((c) => c.key === 'terminal')?.ok, false);

    // 3. Real full profile on disk: saved with encrypted password and existing terminal binary
    upsertMt5Profile({
      slot: 'live',
      label: 'ICMarkets Live Production',
      login: '11223344',
      server: 'ICMarketsSC-Live01',
      terminalPath: tempTerminal,
      password: 'ActualEncryptedPassword99!',
    }, opts);

    const actualFull = getMt5Profile('live', opts);
    assert.ok(actualFull, 'Actual full profile must exist in vault');
    assert.equal(actualFull.has_password, true);

    const report3 = inspectMt5Setup('live', actualFull, actualFull.terminal_path, true);
    assert.equal(report3.ok, true);
    assert.equal(report3.login, '11***44');
    assert.equal(report3.server, 'ICMarketsSC-Live01');
    assert.ok(report3.next_action.includes('sovereign mt5 connect'));

    // Verify diagnostic text rendering with actual report
    const renderedDiag = renderMt5Diagnostics(report3);
    assert.ok(renderedDiag.includes('MT5 Doctor'));
    assert.ok(renderedDiag.includes('11***44'));
    assert.ok(renderedDiag.includes('ICMarketsSC-Live01'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('MT5 CLI Routing: renderMt5ProfileList renders actual profiles from encrypted vault store', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sov-mt5-list-render-test-'));
  try {
    const opts = { baseDir: tempDir };

    // Seed real encrypted profile records on disk
    upsertMt5Profile({
      slot: 'propfirm',
      label: 'FTMO Funded 100k',
      login: '55667788',
      server: 'FTMO-Server01',
      password: 'FtmoSecretPassword!',
    }, opts);

    upsertMt5Profile({
      slot: 'test',
      label: 'Raw Demo Broker',
      login: '12345678',
      server: 'Broker-Demo-Server',
      password: 'DemoPassword!',
    }, opts);

    // Read real profiles through canonical storage reader
    const actualProfiles = listMt5Profiles(opts);
    assert.equal(actualProfiles.length, 3);

    // Render through real CLI list formatter
    const rendered = renderMt5ProfileList(actualProfiles);
    assert.ok(rendered.includes('MT5 Profiles'));
    assert.ok(rendered.includes('FTMO Funded 100k'));
    assert.ok(rendered.includes('55***88'));
    assert.ok(rendered.includes('FTMO-Server01'));
    assert.ok(rendered.includes('Raw Demo Broker'));
    assert.ok(rendered.includes('12***78'));
    assert.ok(rendered.includes('Broker-Demo-Server'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
