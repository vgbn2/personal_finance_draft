const path = require('node:path');
const fs = require('node:fs');

/**
 * PATHS & BINARY DISCOVERY UTILITY
 * Centralizes the logic for finding the REPO_ROOT and key executables.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const BINARY_NAME = process.platform === 'win32' ? 'sovereign_wealth.exe' : 'sovereign_wealth';

const BACKEND_CANDIDATES = [
    path.join(REPO_ROOT, 'build', 'backend', 'core', 'Release', BINARY_NAME),
    path.join(REPO_ROOT, 'build', 'backend', 'core', 'Debug', BINARY_NAME),
    path.join(REPO_ROOT, 'backend', 'core', 'build', 'manual', BINARY_NAME),
    path.join(REPO_ROOT, 'build', 'cpp_core', BINARY_NAME),
    path.join(REPO_ROOT, 'backend', 'core', 'src', BINARY_NAME),
];

const CLI_CANDIDATES = [
    path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js'),
    path.join(REPO_ROOT, 'scripts', 'cli', 'sovereign_cli.js'),
    path.join(REPO_ROOT, 'scripts', 'sovereign_cli.js'),
];

/**
 * Finds the C++ backend binary.
 * Priority: Env var > Candidates list
 */
function findBackendBinary() {
    if (process.env.SOVEREIGN_BACKEND_BIN && fs.existsSync(process.env.SOVEREIGN_BACKEND_BIN)) {
        return process.env.SOVEREIGN_BACKEND_BIN;
    }
    return BACKEND_CANDIDATES.find(c => fs.existsSync(c)) || null;
}

/**
 * Finds the Node CLI entrypoint.
 */
function findNodeCli() {
    return CLI_CANDIDATES.find(c => fs.existsSync(c)) || null;
}

module.exports = {
    REPO_ROOT,
    findBackendBinary,
    findNodeCli,
    BACKEND_CANDIDATES,
    CLI_CANDIDATES
};
