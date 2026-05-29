const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_CONFIG_PATH = path.join(REPO_ROOT, '.mcp.json');

const releaseBinary = path.join('build', 'backend', 'core', 'Release', 'sovereign_wealth.exe');
const debugBinary = path.join('build', 'backend', 'core', 'Debug', 'sovereign_wealth.exe');
const binPath = fs.existsSync(path.join(REPO_ROOT, 'build', 'backend', 'core', 'Release', 'sovereign_wealth.exe')) ? releaseBinary : debugBinary;

const mcpServerEntry = path.join('dist', 'mcp_server', 'index.js');

const config = {
  mcpServers: {
    supabase: {
      httpUrl: "https://mcp.supabase.com/mcp?project_ref=kwrnlkvoqzmaolmwvhse"
    },
    sovereign: {
      command: "node",
      args: [mcpServerEntry.replace(/\\/g, '/')],
      env: {
        SOVEREIGN_BACKEND_BIN: binPath.replace(/\\/g, '/')
      }
    }
  }
};

fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
console.log(`[VISIBILITY] MCP configuration generated at ${MCP_CONFIG_PATH}`);
console.log(`[VISIBILITY] Server: ${mcpServerEntry}`);
console.log(`[VISIBILITY] Backend: ${binPath}`);
