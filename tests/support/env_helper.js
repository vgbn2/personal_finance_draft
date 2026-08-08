'use strict';

/**
 * Executes a function with temporary process.env overrides, guaranteeing
 * clean restoration of original environment state (synchronous or async).
 *
 * @param {Record<string, string|undefined>} overrides - Key-value map of env vars to set or delete (undefined to delete).
 * @param {Function} fn - Function to execute within the isolated environment.
 * @returns {any} Result of fn() (passes through Promises cleanly).
 */
function withIsolatedEnv(overrides, fn) {
  const originalEnv = { ...process.env };
  const keysToOverride = Object.keys(overrides);

  for (const key of keysToOverride) {
    const val = overrides[key];
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(val);
    }
  }

  const restore = () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  };

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(
        (val) => {
          restore();
          return val;
        },
        (err) => {
          restore();
          throw err;
        }
      );
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

module.exports = {
  withIsolatedEnv,
};
