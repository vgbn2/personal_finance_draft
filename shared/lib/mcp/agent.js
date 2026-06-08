const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { ask } = require('../ai/ai_client');

const ROOT = path.resolve(__dirname, '..', '..');
const CLI_PATH = path.join(ROOT, 'backend', 'cli', 'sovereign_cli.js');

const TOOLS = {
  status: { description: 'Get system status', args: {} },
  backtest: { description: 'Run a backtest command', args: { strategy: 'strategy name or path' } },
  trade: { description: 'Run a trade command', args: { action: 'trade subcommand' } },
  backfill: { description: 'Run a backfill command', args: { symbol: 'symbol or universe' } },
};

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function slimResult(toolName, result) {
  if (!result || typeof result !== 'object') return result;
  if (toolName === 'status') {
    return {
      status: result.status,
      ok: result.ok,
      summary: result.summary || result.message || null,
    };
  }
  return {
    status: result.status,
    stdout: String(result.stdout || '').slice(0, 1200),
    stderr: String(result.stderr || '').slice(0, 400),
  };
}

function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'status':
      return runCli(['status', '--json']);
    case 'backtest':
      return runCli(['backtest', '--json', ...(args.strategy ? ['--strategy', String(args.strategy)] : [])]);
    case 'trade':
      return runCli(['trade', ...(args.action ? [String(args.action)] : [])]);
    case 'backfill':
      return runCli(['backfill', ...(args.symbol ? [String(args.symbol)] : [])]);
    default:
      return { status: 1, stdout: '', stderr: `Unsupported tool: ${toolName}`, error: 'unsupported_tool' };
  }
}

function extractToolCall(text) {
  const match = String(text || '').match(/\[TOOL_CALL\]([\s\S]*?)\[\/TOOL_CALL\]/);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]);
    const toolName = payload.tool || payload.name || payload.command;
    return toolName ? { toolName, args: payload.args || payload.parameters || {} } : null;
  } catch {
    return null;
  }
}

async function agentLoop(query, options = {}) {
  const systemPrompt = options.systemPrompt || [
    'You are the local trading assistant for Sovereign.',
    'If you need to call a tool, emit one [TOOL_CALL]{"tool":"name","args":{...}}[/TOOL_CALL] block.',
    'Keep the final answer concise and grounded in the tool output.',
  ].join(' ');

  let prompt = String(query || '').trim();
  if (!prompt) {
    return { status: 'error', error: 'empty_query' };
  }

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const response = await ask(prompt, systemPrompt);
    if (!response) {
      return { status: 'error', error: 'Ollama unavailable' };
    }

    const toolCall = extractToolCall(response.text);
    if (!toolCall) {
      return { status: 'ok', text: response.text, source: response.source };
    }

    const toolResult = executeTool(toolCall.toolName, toolCall.args);
    const slim = slimResult(toolCall.toolName, toolResult);
    prompt = `Tool ${toolCall.toolName} returned: ${JSON.stringify(slim)}\nRespond to the user with the result.`;
  }

  return { status: 'ok', text: 'Agent loop stopped after 5 iterations.', source: 'local-agent' };
}

module.exports = {
  TOOLS,
  agentLoop,
  executeTool,
  runCli,
  slimResult,
};
