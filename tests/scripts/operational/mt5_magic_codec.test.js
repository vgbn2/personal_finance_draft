'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MagicCodec } = require('../../../shared/lib/runtime/mt5_magic_codec.js');

test('MagicCodec encodes and decodes default params accurately', () => {
  const magic = MagicCodec.encode({
    systemId: 0x534F,
    strategyId: 'manual',
    timeframeMinutes: 1,
    instanceId: 42,
  });

  assert.equal(typeof magic, 'string');
  assert.ok(BigInt(magic) > 0n);

  const decoded = MagicCodec.decode(magic);
  assert.equal(decoded.systemId, 0x534F);
  assert.equal(decoded.timeframeMinutes, 1);
  assert.equal(decoded.instanceId, 42);
  assert.equal(decoded.strategyId, MagicCodec.crc16('manual'));
});

test('MagicCodec handles numeric strategy IDs', () => {
  const magic = MagicCodec.encode({
    systemId: 0x534F,
    strategyId: 12345,
    timeframeMinutes: 60,
    instanceId: 99,
  });

  const decoded = MagicCodec.decode(magic);
  assert.equal(decoded.systemId, 0x534F);
  assert.equal(decoded.strategyId, 12345);
  assert.equal(decoded.timeframeMinutes, 60);
  assert.equal(decoded.instanceId, 99);
});

test('MagicCodec preserves 16-bit boundaries and handles overflow safely', () => {
  const magic = MagicCodec.encode({
    systemId: 0x1FFFF,
    strategyId: 0x2FFFF,
    timeframeMinutes: 0x3FFFF,
    instanceId: 0x4FFFF,
  });

  const decoded = MagicCodec.decode(magic);
  assert.equal(decoded.systemId, 0xFFFF);
  assert.equal(decoded.strategyId, 0xFFFF);
  assert.equal(decoded.timeframeMinutes, 0xFFFF);
  assert.equal(decoded.instanceId, 0xFFFF);
});

test('MagicCodec keeps bit 63 clear for positive signed representation in MQL5', () => {
  const magic = MagicCodec.encode({
    systemId: 0x534F, // 'SO'
    strategyId: 'eurusd_momentum',
    timeframeMinutes: 1440,
    instanceId: 1001,
  });

  const b = BigInt(magic);
  // Bit 63 is (b >> 63n) & 1n
  assert.equal((b >> 63n) & 1n, 0n, 'Bit 63 must be 0 so signed 64-bit MQL5 integers stay positive');
});
