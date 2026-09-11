'use strict';

/**
 * 64-bit Magic Number Bitmask Codec for MetaTrader 5
 *
 * Bit allocation:
 *   Bits [63..48] (16 bits): System Domain ID (default: 0x534F = "SO")
 *                            Kept < 0x8000 to ensure sign-bit is clear for signed MQL5 logs.
 *   Bits [47..32] (16 bits): Strategy ID Hash (CRC16 of strategy identifier string or uint16)
 *   Bits [31..16] (16 bits): Timeframe in minutes (1, 5, 15, 60, 240, 1440)
 *   Bits [15..0]  (16 bits): Sub-Position Instance / Ticket ID
 */

const SYSTEM_SOVEREIGN_ID = 0x534F; // "SO"

function crc16(str) {
  let crc = 0xFFFF;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc & 0xFFFF;
}

const MagicCodec = {
  SYSTEM_ID: SYSTEM_SOVEREIGN_ID,

  encode({ systemId = SYSTEM_SOVEREIGN_ID, strategyId = 'manual', timeframeMinutes = 1, instanceId = 0 } = {}) {
    const sys = BigInt(Number(systemId) & 0xFFFF) << 48n;
    const stratHash = typeof strategyId === 'number' ? strategyId : crc16(strategyId);
    const strat = BigInt(Number(stratHash) & 0xFFFF) << 32n;
    const tf = BigInt(Number(timeframeMinutes) & 0xFFFF) << 16n;
    const inst = BigInt(Number(instanceId) & 0xFFFF);
    return (sys | strat | tf | inst).toString();
  },

  decode(magicValue) {
    const m = BigInt(String(magicValue || '0'));
    return {
      systemId: Number((m >> 48n) & 0xFFFFn),
      strategyId: Number((m >> 32n) & 0xFFFFn),
      timeframeMinutes: Number((m >> 16n) & 0xFFFFn),
      instanceId: Number(m & 0xFFFFn),
    };
  },

  crc16,
};

module.exports = { MagicCodec };
