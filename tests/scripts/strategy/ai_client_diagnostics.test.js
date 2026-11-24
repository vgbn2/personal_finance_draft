'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');

test('strategy synthesis preserves safe failure categories and never substitutes Ollama', async (t) => {
  const requests = [];
  let scenario = 'http';
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    request.resume();
    if (request.url === '/v1/models') {
      response.end(JSON.stringify({ data: [] }));
      return;
    }
    if (request.url === '/api/chat') {
      response.end(JSON.stringify({ message: { content: '{"substitute":true}' } }));
      return;
    }
    if (scenario === 'timeout') return;
    if (scenario === 'transport') {
      request.socket.destroy();
      return;
    }
    if (scenario === 'body_timeout') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{');
      return;
    }
    if (scenario === 'http') {
      response.writeHead(429);
      response.end('private-provider-body sk-do-not-log');
      return;
    }
    if (scenario === 'envelope') {
      response.end('not a JSON envelope sk-do-not-log');
      return;
    }
    if (scenario === 'null_envelope') {
      response.end('null');
      return;
    }
    const content = {
      empty: '   ',
      json: 'not-json sk-do-not-log',
      shape: '[]',
      array_object: '[{"hypothesis":"not an object root","rules":{"version":1}}]',
      valid: '{"hypothesis":"local fixture","rules":{"version":1}}',
    }[scenario];
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const [name, reason] of [
    ['http', 'http_error'],
    ['timeout', 'timeout'],
    ['transport', 'transport_error'],
    ['body_timeout', 'timeout'],
    ['envelope', 'response_json_invalid'],
    ['empty', 'empty_response'],
    ['json', 'strategy_json_invalid'],
    ['shape', 'strategy_shape_invalid'],
    ['array_object', 'strategy_shape_invalid'],
    ['null_envelope', 'empty_response'],
    ['valid', null],
    ['general_fallback', 'http_error'],
  ]) {
    await t.test(name, async () => {
      scenario = name === 'general_fallback' ? 'http' : name;
      requests.length = 0;
      const child = spawn(process.execPath, ['-e', `
        const client = require('./shared/lib/ai/ai_client');
        const result = ${name === 'general_fallback'
    ? "client.ask('local general-chat fixture')"
    : "client.synthesizeStrategyWithAi({universe:['SPY'],timeframe:'1d'})"};
        result.then(value => console.log(JSON.stringify(value)));
      `], {
        cwd: root,
        env: {
          ...process.env,
          SOVEREIGN_ROUTER_URL: `${base}/v1`,
          SOVEREIGN_ROUTER_KEY: 'local-fixture-key-do-not-log',
          SOVEREIGN_ROUTER_MODEL: 'local-fixture-model',
          SOVEREIGN_ROUTER_TIMEOUT_MS: name === 'timeout' || name === 'body_timeout' ? '300' : '3000',
          OLLAMA_BASE_URL: base,
        },
        timeout: 5000,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      const exit = await new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      assert.equal(exit, 0, stderr);
      assert.equal(requests.includes('/api/chat'), name === 'general_fallback', 'only general chat permits model fallback');
      assert.doesNotMatch(stderr, /do-not-log|private-provider-body|local fixture/);
      const result = JSON.parse(stdout.trim());
      if (!reason) {
        assert.equal(result.source, 'router:local-fixture-model');
        assert.equal(result.rules.version, 1);
        return;
      }
      if (name === 'general_fallback') {
        assert.match(result.source, /^ollama:/);
      } else {
        assert.equal(result, null);
      }
      const event = stderr.split('\n')
        .find(line => line.startsWith('[AI-FAILURE] '));
      assert.ok(event, 'safe diagnostic event must reach stderr');
      const diagnostic = JSON.parse(event.slice('[AI-FAILURE] '.length));
      assert.equal(diagnostic.reason, reason);
      assert.equal(diagnostic.stage, ['json', 'shape', 'array_object'].includes(name) ? 'strategy' : 'router');
      assert.ok(Number.isFinite(diagnostic.elapsed_ms));
      if (name === 'http' || name === 'general_fallback') assert.equal(diagnostic.status, 429);
    });
  }
});
