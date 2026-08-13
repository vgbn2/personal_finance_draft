'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasValidMcpGateToken,
  isMcpAllowed,
  isMcpRequest,
  redactDeep,
} = require('../../../shared/lib/mcp/gate');

function request(headers = {}) {
  return { headers };
}

test('MCP route policy allows only reviewed read routes', () => {
  assert.equal(isMcpAllowed('/api/data/summary'), true);
  assert.equal(isMcpAllowed('/api/market/monitor'), true);
  assert.equal(isMcpAllowed('/api/config'), false);
  assert.equal(isMcpAllowed('/api/config/child'), false);
  assert.equal(isMcpAllowed('/api/new-unreviewed-route'), false);
});

test('MCP headers are restrictive classification hints, not credentials', () => {
  const headerOnly = request({ 'x-mcp-agent': '1' });
  assert.equal(isMcpRequest(headerOnly), true);
  assert.equal(hasValidMcpGateToken(headerOnly, 'test-gate-token'), false);

  const userAgentOnly = request({ 'user-agent': 'mcp-client/1.0' });
  assert.equal(isMcpRequest(userAgentOnly), true);
  assert.equal(hasValidMcpGateToken(userAgentOnly, 'test-gate-token'), false);
});

test('MCP gate token uses exact constant-time validation', () => {
  const valid = request({ 'x-mcp-token': 'test-gate-token' });
  const invalid = request({ 'x-mcp-token': 'test-gate-token-extra' });
  assert.equal(hasValidMcpGateToken(valid, 'test-gate-token'), true);
  assert.equal(hasValidMcpGateToken(invalid, 'test-gate-token'), false);
});

test('MCP redaction retains ordinary fields and masks sensitive keys', () => {
  assert.deepEqual(
    redactDeep({ status: 'ok', nested: { api_token: 'do-not-expose' } }),
    { status: 'ok', nested: { api_token: '[REDACTED]' } },
  );
});
