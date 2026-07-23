const fs = require('node:fs');
const path = require('node:path');
const {
  REPO_ROOT,
  findBackendBinary,
} = require('../shared/lib/runtime/paths.js');

const MCP_CONFIG_PATH = path.join(REPO_ROOT, '.mcp.json');

function portablePath(value) {
  return value.replace(/\\/g, '/');
}

function buildMcpConfig(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  const platform = options.platform || process.platform;
  const existsSync = options.existsSync || fs.existsSync;
  const serverPath = path.resolve(repoRoot, 'dist', 'mcp_server', 'index.js');

  if (!existsSync(serverPath)) {
    const error = new Error(`Compiled MCP entrypoint is missing: ${serverPath}`);
    error.code = 'mcp_entrypoint_missing';
    throw error;
  }

  const backendPath = options.backendPath === undefined
    ? findBackendBinary({
      repoRoot,
      platform,
      env: options.env || process.env,
      existsSync,
    })
    : options.backendPath;

  if (backendPath && !existsSync(backendPath)) {
    const error = new Error(`Selected native backend does not exist: ${backendPath}`);
    error.code = 'native_backend_missing';
    throw error;
  }

  const sovereign = {
    command: options.nodePath || process.execPath,
    args: [portablePath(serverPath)],
  };
  if (backendPath) {
    sovereign.env = {
      SOVEREIGN_BACKEND_BIN: portablePath(path.resolve(backendPath)),
    };
  }

  return {
    config: {
      mcpServers: {
        supabase: {
          httpUrl: 'https://mcp.supabase.com/mcp?project_ref=kwrnlkvoqzmaolmwvhse',
        },
        sovereign,
      },
    },
    serverPath,
    backendPath: backendPath || null,
  };
}

function writeMcpConfig(configPath, config, options = {}) {
  const writeFileSync = options.writeFileSync || fs.writeFileSync;
  const renameSync = options.renameSync || fs.renameSync;
  const unlinkSync = options.unlinkSync || fs.unlinkSync;
  const existsSync = options.existsSync || fs.existsSync;
  const resolvedPath = path.resolve(configPath);
  const tempPath = path.join(
    path.dirname(resolvedPath),
    `.${path.basename(resolvedPath)}.${process.pid}.${Date.now()}.tmp`
  );

  try {
    writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(tempPath, resolvedPath);
  } finally {
    if (existsSync(tempPath)) unlinkSync(tempPath);
  }
  return resolvedPath;
}

function main(options = {}) {
  const result = buildMcpConfig(options);
  const configPath = writeMcpConfig(
    options.configPath || process.env.SOVEREIGN_MCP_CONFIG_PATH || MCP_CONFIG_PATH,
    result.config
  );
  console.log(`[VISIBILITY] MCP configuration generated at ${configPath}`);
  console.log(`[VISIBILITY] Server: ${result.serverPath}`);
  if (result.backendPath) {
    console.log(`[VISIBILITY] Backend: ${result.backendPath}`);
  } else {
    console.warn('[VISIBILITY] Native backend: unavailable; native MCP tools will remain degraded');
  }
  return { ...result, configPath };
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[MCP_SETUP_ERROR] ${error.code || 'setup_failed'}: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  MCP_CONFIG_PATH,
  buildMcpConfig,
  main,
  portablePath,
  writeMcpConfig,
};
