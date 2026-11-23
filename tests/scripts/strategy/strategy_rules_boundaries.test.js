'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { sources: bars } = require('../../fixtures/real_bars_btc.json');
const { createRuleFrame, simulateRuleTrades } = require('../../../shared/lib/strategy/strategy_rules');
const { evaluateStrategy, generateCandidateSpec, formatStrategyYaml } = require('../../../shared/lib/strategy/interval_discovery');

const rules = {
  version: 1,
  entry: { op: 'gt', left: { feature: 'close' }, right: 0 },
  exit: { op: 'lt', left: { feature: 'close' }, right: 0 },
  execution: {
    max_holding_bars: 5,
    stop_loss_pct: 0.03,
    take_profit_pct: 0.06,
    position_size_pct: 0.1,
  },
};

function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env },
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => { resolve({ code, output }); });
  });
}

test('raw invalid warm-up and closing prices reject before indicator substitution', () => {
  for (const index of [0, bars.length - 1]) {
    const corrupt = bars.map((bar, offset) => offset === index ? { ...bar, close: NaN } : bar);
    assert.throws(() => createRuleFrame(corrupt), /input OHLC/);
  }
  assert.throws(() => createRuleFrame(bars, { rsi: -1 }), /period/);
});

test('requested market identity cannot be replaced by recorded BTC prices', async () => {
  const spec = { ...generateCandidateSpec({ archetype: 'ema_macd_trend' }), universe: ['SPY'], timeframe: '1d', rules };
  await assert.rejects(evaluateStrategy(spec, { fixtureBars: bars }), /genuine history matching/);
  await assert.rejects(evaluateStrategy(spec, { fixtureBars: [] }), /genuine history matching/);
});

test('bounded recorded prefix retains the unfinished position without an invented final fill', () => {
  const prefix = bars.slice(0, 4);
  const result = simulateRuleTrades(createRuleFrame(prefix), { rules });
  assert.equal(result.trades.length, 0);
  assert.equal(result.open_positions.length, 1);
  assert.equal(result.open_positions[0].entry_time, prefix[2].timestamp);
  assert.equal(result.open_positions[0].mark, prefix.at(-1).close);
});

test('actual research CLI rejects rule YAML instead of evaluating its default model', async () => {
  const directory = fs.mkdtempSync('/tmp/opencode/rule-cli-');
  try {
    const file = `${directory}/rules.yaml`;
    fs.writeFileSync(file, formatStrategyYaml({ name: 'boundary', universe: ['BTCUSDT'], timeframe: '1h', rules }));
    const result = await run(['frontend/cli-tui/sovereign_cli.js', 'backtest', '--strategy', file, '--json']);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Rule strategies are research-only/);
    assert.doesNotMatch(result.output, /Running backtest/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('AI response passes real HTTP/JSON/spec/evaluation boundaries without model substitution', async () => {
  let prompt = '';
  let requests = 0;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url.endsWith('/models')) {
      response.end(JSON.stringify({ data: [] }));
      return;
    }
    let body = '';
    request.on('data', data => { body += data; });
    request.on('end', () => {
      prompt = JSON.parse(body).messages.at(-1).content;
      requests += 1;
      const candidate = {
        family: 'momentum', archetype: 'generated_rule', universe: ['BTCUSDT'], timeframe: '1h',
        indicator_periods: { rsi: 14 }, risk: {},
        rules: { ...rules, entry: { ...rules.entry, op: requests === 1 ? 'gt' : 'lt' } },
      };
      if (requests === 4) candidate.timeframe = '1d';
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidate) } }] }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const script = `
      const assert = require('node:assert/strict');
      const {generateAiCandidateSpec,evaluateStrategy,computeSpecChecksum,stageCandidate}=require('./shared/lib/strategy/interval_discovery');
      const {sources:bars}=require('./tests/fixtures/real_bars_btc.json');
      (async()=>{
        const first=await generateAiCandidateSpec({universe:['BTCUSDT'],seed:'same'});
        const second=await generateAiCandidateSpec({universe:['BTCUSDT'],seed:'same'});
        const mismatch=await generateAiCandidateSpec({universe:['BTCUSDT'],timeframe:'1d',seed:'same'});
        assert.equal(mismatch,null,'AI must not silently substitute an unrequested timeframe');
        const daily=await generateAiCandidateSpec({universe:['BTCUSDT'],timeframe:'1d',seed:'same'});
        assert.equal(daily.timeframe,'1d');
        assert.ok(first && second);
        assert.equal(first.rules.entry.op,'gt');
        assert.equal(second.rules.entry.op,'lt');
        assert.notEqual(computeSpecChecksum(first),computeSpecChecksum(second));
        const a=await evaluateStrategy(first,{fixtureBars:bars});
        const b=await evaluateStrategy(second,{fixtureBars:bars});
        assert.ok(a.trades>0);
        assert.equal(b.trades,0);
        assert.equal(stageCandidate({spec:first,evaluation:a}).staged,false);
        console.log(JSON.stringify({boundary:'http_json_ai_spec_discovery_backtest',enter:a.trades,never:b.trades,staged:false}));
      })().catch(error=>{console.error(error);process.exitCode=1;});
    `;
    const result = await run(['-e', script], { SOVEREIGN_ROUTER_URL: `http://127.0.0.1:${server.address().port}/v1` });
    assert.equal(result.code, 0, result.output);
    assert.equal(requests, 4);
    assert.match(prompt, /executable structured rules/);
    assert.match(prompt, /timeframe.*1d/i);
    console.log(result.output.trim());
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
