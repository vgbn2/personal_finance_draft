const path = require('node:path');
const fs = require('node:fs');
const { parseYamlRecursive } = require('./config_loader');

/**
 * PATHS & BINARY DISCOVERY UTILITY
 * Centralizes the logic for finding the REPO_ROOT and key executables.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STORAGE_DATA_DIR = path.join(REPO_ROOT, 'storage', 'data');
const API_CACHE_DIR = path.join(STORAGE_DATA_DIR, 'cache', 'api_responses');

function backendBinaryName(platform = process.platform) {
    return platform === 'win32' ? 'sovereign_wealth.exe' : 'sovereign_wealth';
}

function buildBackendCandidates(repoRoot = REPO_ROOT, platform = process.platform) {
    const binaryName = backendBinaryName(platform);
    const pathApi = platform === 'win32' ? path.win32 : path.posix;
    return [
        pathApi.join(repoRoot, 'backend', 'core', 'build', 'Release', binaryName),
        pathApi.join(repoRoot, 'backend', 'core', 'build', 'Debug', binaryName),
        pathApi.join(repoRoot, 'backend', 'core', 'build', binaryName),
        pathApi.join(repoRoot, 'build', 'backend', 'core', 'Release', binaryName),
        pathApi.join(repoRoot, 'build', 'backend', 'core', 'Debug', binaryName),
        pathApi.join(repoRoot, 'backend', 'core', 'build', 'manual', binaryName),
        pathApi.join(repoRoot, 'build', 'backend', 'core', binaryName),
        pathApi.join(repoRoot, 'backend', 'core', 'src', binaryName),
    ];
}

const BACKEND_CANDIDATES = buildBackendCandidates();

const CLI_CANDIDATES = [
    path.join(REPO_ROOT, 'backend', 'cli', 'sovereign_cli.js'),
];

/**
 * Finds the C++ backend binary.
 * Priority: Env var > Candidates list
 */
function findBackendBinary(options = {}) {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const platform = options.platform || process.platform;
    const env = options.env || process.env;
    const existsSync = options.existsSync || fs.existsSync;
    if (env.SOVEREIGN_BACKEND_BIN && existsSync(env.SOVEREIGN_BACKEND_BIN)) {
        return env.SOVEREIGN_BACKEND_BIN;
    }
    const candidates = repoRoot === REPO_ROOT && platform === process.platform
        ? BACKEND_CANDIDATES
        : buildBackendCandidates(repoRoot, platform);
    return candidates.find(c => existsSync(c)) || null;
}

/**
 * Finds the Node CLI entrypoint.
 */
function findNodeCli() {
    return CLI_CANDIDATES.find(c => fs.existsSync(c)) || null;
}

/**
 * Loads tool configurations from config/system/tools.yaml.
 */
function loadToolsConfig() {
    const toolsPath = path.join(REPO_ROOT, 'config', 'system', 'tools.yaml');
    if (!fs.existsSync(toolsPath)) return {};

    const lines = fs.readFileSync(toolsPath, 'utf8').split(/\r?\n/);
    const [config] = parseYamlRecursive(lines);
    return config;
}

/**
 * Finds an external tool by checking candidates in config or environment.
 */
function findTool(toolName, envVar) {
    if (envVar && process.env[envVar] && fs.existsSync(process.env[envVar])) {
        return process.env[envVar];
    }

    const config = loadToolsConfig();
    const toolSpec = config[toolName];
    if (toolSpec) {
        // Check all candidate lists/properties
        for (const list of Object.values(toolSpec)) {
            if (Array.isArray(list)) {
                const found = list.find(c => fs.existsSync(c) || (!c.includes('\\') && !c.includes('/') && which(c)));
                if (found) return found;
            } else if (typeof list === 'string' && fs.existsSync(list)) {
                return list;
            }
        }
    }
    return null;
}

/**
 * Simple 'which' check for system paths
 */
function which(cmd) {
    try {
        const { execSync } = require('node:child_process');
        const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
        execSync(checkCmd, { stdio: 'ignore' });
        return cmd;
    } catch {
        return null;
    }
}

// Canonical storage path constants — import these; never recompute them per-file.
const DEFAULT_SNAPSHOT      = path.join(STORAGE_DATA_DIR, 'cache', 'last_fetch.json');
const DEFAULT_QUALITY_REPORT = path.join(STORAGE_DATA_DIR, 'cache', 'data_quality_report.json');
const DEFAULT_FEATURES      = path.join(STORAGE_DATA_DIR, 'features', 'latest_features.json');
const DEFAULT_MODEL_REPORT  = path.join(STORAGE_DATA_DIR, 'models', 'latest_model_comparison.json');
const DEFAULT_BACKTEST      = path.join(STORAGE_DATA_DIR, 'backtests', 'latest_backtest.json');
const DEFAULT_STATE_PATH    = path.join(REPO_ROOT, 'workspace', 'STATE.md');
const DEFAULT_USER_SETTINGS = path.join(STORAGE_DATA_DIR, 'user_settings.json');
const STORAGE_TS_DIR        = path.join(STORAGE_DATA_DIR, 'ts');
const DEFAULT_PORTFOLIO     = path.join(STORAGE_DATA_DIR, 'portfolio.json');
const DEFAULT_INDICATOR_OPTIMIZATION = path.join(STORAGE_DATA_DIR, 'models', 'latest_indicator_optimization.json');

module.exports = {
    REPO_ROOT,
    STORAGE_DATA_DIR,
    API_CACHE_DIR,
    DEFAULT_SNAPSHOT,
    DEFAULT_QUALITY_REPORT,
    DEFAULT_FEATURES,
    DEFAULT_MODEL_REPORT,
    DEFAULT_BACKTEST,
    DEFAULT_STATE_PATH,
    DEFAULT_USER_SETTINGS,
    STORAGE_TS_DIR,
    DEFAULT_PORTFOLIO,
    DEFAULT_INDICATOR_OPTIMIZATION,
    backendBinaryName,
    buildBackendCandidates,
    findBackendBinary,
    findNodeCli,
    findTool,
    BACKEND_CANDIDATES,
    CLI_CANDIDATES
};
