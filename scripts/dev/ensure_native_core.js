'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findBackendBinary, REPO_ROOT } = require('../../shared/lib/runtime/paths');

/**
 * Ensure Native C++20 Sovereign Core binary is compiled and available.
 * Executed automatically during 'postinstall' on fresh installs and on-demand
 * by the runtime bridge when computation requires native performance.
 */
function ensureNativeCore(options = {}) {
  const silent = Boolean(options.silent);
  const existing = findBackendBinary();
  if (existing) {
    if (!silent) {
      console.log(`[NATIVE-CORE] Native C++20 Sovereign Core binary ready: ${existing}`);
    }
    return existing;
  }

  if (process.env.SOVEREIGN_DISABLE_CPP === '1' || process.env.SOVEREIGN_DISABLE_CPP === 'true') {
    if (!silent) {
      console.log('[NATIVE-CORE] Native C++ engine disabled via SOVEREIGN_DISABLE_CPP.');
    }
    return null;
  }

  // Check CMake availability
  const cmakeCheck = spawnSync('cmake', ['--version'], { encoding: 'utf8' });
  if (cmakeCheck.status !== 0) {
    if (!silent) {
      console.warn('[NATIVE-CORE] CMake not found on PATH. Native C++ engine compilation skipped.');
      console.warn('[NATIVE-CORE] Run npm run setup:dev once CMake (3.15+) is installed.');
    }
    return null;
  }

  if (!silent) {
    console.log('[NATIVE-CORE] Compiling native C++20 Sovereign Core engine (Release mode)...');
  }

  const buildDir = path.join(REPO_ROOT, 'backend', 'core', 'build');
  const srcDir = path.join(REPO_ROOT, 'backend', 'core');

  const configure = spawnSync(
    'cmake',
    ['-S', srcDir, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release', '-DSOVEREIGN_ENABLE_ONNX_RUNTIME=OFF'],
    { cwd: REPO_ROOT, stdio: silent ? 'pipe' : 'inherit' }
  );

  if (configure.status !== 0) {
    if (!silent) {
      console.warn(`[NATIVE-CORE] CMake configure failed with exit code ${configure.status}.`);
    }
    return null;
  }

  const build = spawnSync(
    'cmake',
    ['--build', buildDir, '--config', 'Release', '--parallel'],
    { cwd: REPO_ROOT, stdio: silent ? 'pipe' : 'inherit' }
  );

  if (build.status !== 0) {
    if (!silent) {
      console.warn(`[NATIVE-CORE] CMake build failed with exit code ${build.status}.`);
    }
    return null;
  }

  const newlyBuilt = findBackendBinary();
  if (newlyBuilt && !silent) {
    console.log(`[NATIVE-CORE] Successfully built native C++ core: ${newlyBuilt}`);
  }
  return newlyBuilt;
}

if (require.main === module) {
  ensureNativeCore();
}

module.exports = { ensureNativeCore };
