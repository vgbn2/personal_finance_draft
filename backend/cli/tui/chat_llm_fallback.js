'use strict';

// LLM-assisted fallback for the dashboard's chat box, used only when
// chat_parser.js's deterministic resolver can't confidently resolve the
// typed text. Reuses the local Ollama client already wired up for
// shared/lib/mcp/agent.js -- no new dependency, no new network surface.
//
// Safety contract: the LLM's output is NEVER trusted directly. Every result
// is validated against the real manifest (command_id must exist, every flag
// key must be a real flag on that command) before it's even returned, and
// the caller (sovereign_dashboard.mjs) always shows a mandatory confirm step
// before running anything this module resolves -- there is no path from
// here straight to execution.

const { ask } = require('../../../shared/lib/ai/ai_client.js');
const { defaultFlagValues } = require('./dashboard_exec.js');
const { matchUniverse, matchSelOption } = require('./chat_parser.js');

function optionsSummary(meta) {
  if (meta.t !== 'sel' || !Array.isArray(meta.opts) || meta.opts.length > 8) return meta.t;
  const values = meta.opts.map((o) => (o && typeof o === 'object') ? o.value : o);
  return `one of: ${values.join('|')}`;
}

// Built directly from the live manifest every call (not cached) so it can
// never drift from what the deterministic parser and the grid UI both see.
function buildSystemPrompt(M) {
  const lines = [
    'You resolve free-text requests into a single CLI command for a trading-platform dashboard.',
    'Output ONLY one JSON object, no prose, no markdown fences, of the exact shape:',
    '{"command_id":"<id from the list below, copied exactly>","flags":{"--flag-name":"value"}}',
    'Omit any flag you are not confident about. If nothing in the list matches, output {"command_id":null}.',
    '',
    'Commands:',
  ];
  for (const cat of M || []) {
    for (const cmd of cat.cmds || []) {
      const flagDescs = Object.entries(cmd.flags || {})
        .map(([key, meta]) => `${key}(${optionsSummary(meta)})`)
        .join(', ');
      lines.push(`- ${cmd.id}: ${cmd.desc || ''}${flagDescs ? ' | flags: ' + flagDescs : ''}`);
    }
  }
  return lines.join('\n');
}

function extractJson(text) {
  if (!text) return null;
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function findCommand(M, commandId) {
  if (!commandId) return null;
  for (const cat of M || []) {
    for (const cmd of cat.cmds || []) {
      if (cmd.id === commandId) return cmd;
    }
  }
  return null;
}

async function resolveWithLLM(text, M, universes = {}) {
  const { symbolUniverse = [], strategyUniverse = [] } = universes;
  const systemPrompt = buildSystemPrompt(M);

  // ask() already degrades safely (returns null on any network error,
  // non-200, or timeout) -- nothing extra to guard here.
  const response = await ask(text, systemPrompt);
  if (!response || !response.text) return { ok: false, reason: 'llm_unavailable' };

  const parsed = extractJson(response.text);
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'llm_invalid_response' };

  const cmd = findCommand(M, parsed.command_id);
  if (!cmd) return { ok: false, reason: 'llm_unknown_command' };

  // Validate every flag key against the real command before using any of
  // it -- an unrecognized key from the LLM is simply dropped, never passed
  // through to buildArgv.
  const flagValues = defaultFlagValues(cmd);
  const rawFlags = (parsed.flags && typeof parsed.flags === 'object') ? parsed.flags : {};
  for (const [key, value] of Object.entries(rawFlags)) {
    if (!Object.prototype.hasOwnProperty.call(cmd.flags, key)) continue;
    const meta = cmd.flags[key];
    if (meta.t === 'yn') {
      flagValues[key] = Boolean(value);
      continue;
    }
    const strValue = String(value);
    flagValues[key] = meta.pickSymbol
      ? matchUniverse(strValue, symbolUniverse)
      : meta.pickStrategy
        ? matchUniverse(strValue, strategyUniverse)
        : meta.t === 'sel'
          ? (matchSelOption(strValue, meta) || strValue)
          : strValue;
  }

  return { ok: true, cmd, flagValues, source: 'llm' };
}

module.exports = { resolveWithLLM, buildSystemPrompt };
