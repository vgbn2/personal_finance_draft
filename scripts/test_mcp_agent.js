#!/usr/bin/env node

const { agentLoop } = require('../shared/lib/mcp_agent');

async function test() {
  console.log('='.repeat(70));
  console.log('MCP Agent Test - Ollama invoking MCP tools');
  console.log('='.repeat(70) + '\n');

  const query = 'I want to backfill BTC and SPY data, then run a mean reversion backtest on BTC';

  console.log(`[USER] ${query}\n`);

  const result = await agentLoop(query);

  console.log('\n' + '='.repeat(70));
  console.log('AGENT RESULT');
  console.log('='.repeat(70));
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
