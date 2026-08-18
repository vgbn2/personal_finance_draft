'use strict';

const bridge = require('../../../../shared/lib/runtime/backend_bridge');
const { hasFlag, optionValue, printPayload } = require('../../lib/utils.js');

/**
 * CLI command handler for system safety kill-switch controls.
 * Exposes C++ sovereign_wealth kill-switch (engage, disengage, status).
 */
async function commandKillSwitch(args = []) {
  const engineInfo = bridge.resolveEngineExecution('kill-switch', { silent: hasFlag(args, '--json') });
  const action = args[0] || 'status';
  const reason = optionValue(args, '--reason', 'manual_cli_trigger');

  if (engineInfo.useNative) {
    const cppArgs = ['kill-switch', action, '--reason', reason];
    if (hasFlag(args, '--json')) cppArgs.push('--json');
    const res = bridge.runBackendCommand(cppArgs);
    if (res && res.ok !== false) {
      if (hasFlag(args, '--json')) {
        console.log(JSON.stringify({ ...res, engine: engineInfo.engine }, null, 2));
      } else {
        console.log(`[KILL SWITCH] Action: ${action} | Status: ${res.status || 'ok'} | Engine: ${engineInfo.engine}`);
        if (res.message) console.log(`  Detail: ${res.message}`);
      }
      return 0;
    }
  }

  // JS Fallback implementation (locking storage/data/cache/kill_switch.lock)
  const fs = require('node:fs');
  const path = require('node:path');
  const { STORAGE_CACHE_DIR } = require('../../../../shared/lib/runtime/paths');
  const lockFile = path.join(STORAGE_CACHE_DIR, 'kill_switch.lock');

  let status = 'disengaged';
  let message = 'System operating normally';

  if (action === 'engage') {
    const lockData = JSON.stringify({ engaged_at: new Date().toISOString(), reason });
    fs.mkdirSync(STORAGE_CACHE_DIR, { recursive: true });
    fs.writeFileSync(lockFile, lockData, 'utf8');
    status = 'engaged';
    message = `Kill-switch engaged. Reason: ${reason}`;
  } else if (action === 'disengage') {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
    status = 'disengaged';
    message = 'Kill-switch disengaged. Safety locks cleared.';
  } else {
    if (fs.existsSync(lockFile)) {
      status = 'engaged';
      try {
        const parsed = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        message = `Kill-switch engaged at ${parsed.engaged_at} (Reason: ${parsed.reason})`;
      } catch {
        message = 'Kill-switch engaged (Lockfile present)';
      }
    }
  }

  const payload = {
    type: 'kill_switch_status',
    action,
    status,
    message,
    engine: engineInfo.engine,
    lock_file: lockFile,
  };

  printPayload(payload, args);
  return 0;
}

module.exports = {
  commandKillSwitch,
};
