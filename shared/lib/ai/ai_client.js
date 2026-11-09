const http = require('node:http');

// Router endpoints to try in order of proximity (LAN, Tailscale, or env override)
const ROUTER_CANDIDATES = [
  process.env.SOVEREIGN_ROUTER_URL,
  'http://192.168.4.103:20128/v1',
  'http://100.120.66.1:20128/v1',
].filter(Boolean);

const ROUTER_KEY = process.env.SOVEREIGN_ROUTER_KEY || 'sk-1b6920feeeab2737-617eb2-92380c8a';
const ROUTER_MODEL = process.env.SOVEREIGN_ROUTER_MODEL || 'ag/gemini-3.8-flash';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen-sovereign';

let cachedWorkingRouterUrl = null;
let lastRouterProbeAt = 0;
const PROBE_TTL_MS = 60000;

function postJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(urlStr);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

async function findWorkingRouterUrl() {
  const now = Date.now();
  if (cachedWorkingRouterUrl && (now - lastRouterProbeAt) < PROBE_TTL_MS) {
    return cachedWorkingRouterUrl;
  }

  for (const url of ROUTER_CANDIDATES) {
    try {
      const res = await fetch(`${url}/models`, {
        headers: { Authorization: `Bearer ${ROUTER_KEY}` },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        cachedWorkingRouterUrl = url;
        lastRouterProbeAt = now;
        return url;
      }
    } catch {
      // try next candidate
    }
  }

  return cachedWorkingRouterUrl || null;
}

/**
 * Ask the AI model. Checks 9Router (ag/gemini-3.8-flash) first, then falls back to local Ollama.
 * Returns { text, source } or null if unavailable.
 */
async function ask(prompt, systemPrompt = '') {
  // 1. Try 9Router
  const routerUrl = await findWorkingRouterUrl();
  if (routerUrl) {
    try {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const res = await fetch(`${routerUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: ROUTER_MODEL,
          messages,
          stream: false,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(Number(process.env.SOVEREIGN_ROUTER_TIMEOUT_MS) || 45000),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text && typeof text === 'string') {
          const usage = data.usage || null;
          return { text: text.trim(), source: `router:${ROUTER_MODEL}`, usage };
        }
      }
    } catch {
      // fall through to Ollama fallback
    }
  }

  // 2. Fall back to local Ollama if configured
  try {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const res = await postJson(`${OLLAMA_BASE}/api/chat`, {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature: 0.3 },
    });

    if (res.status === 200) {
      const text = res.body?.message?.content;
      const usage = (res.body?.prompt_eval_count || res.body?.eval_count) ? {
        prompt_tokens: res.body.prompt_eval_count || 0,
        completion_tokens: res.body.eval_count || 0,
        total_tokens: (res.body.prompt_eval_count || 0) + (res.body.eval_count || 0),
      } : null;
      if (text) return { text, source: `ollama:${OLLAMA_MODEL}`, usage };
    }
  } catch {
    // offline
  }

  return null;
}

async function isAvailable() {
  const routerUrl = await findWorkingRouterUrl();
  if (routerUrl) {
    try {
      const res = await fetch(`${routerUrl}/models`, {
        headers: { Authorization: `Bearer ${ROUTER_KEY}` },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return true;
    } catch {}
  }

  try {
    const res = await postJson(`${OLLAMA_BASE}/api/chat`, {
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      options: { num_predict: 1 },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Synthesize a strategy hypothesis and declarative specification using the AI Agent.
 * Adheres to workspace/OVERNIGHT_GOAL.md Prompt Contract.
 */
async function synthesizeStrategyWithAi(options = {}) {
  const systemPrompt = 'You are Sovereign autonomous quantitative strategy synthesizer. You design production-ready, non-overfit quantitative trading strategies following the Sovereign Strategy Taxonomy. All strategies must be declarative YAML, multi-asset, strictly causal (zero lookahead), and satisfy risk bounds: Sharpe >= 1.50, DD <= 20%, trades > 200.';

  const userPrompt = `Synthesize a strategy hypothesis and declarative quantitative specification.
Constraint Checklist:
1. Family: Pick one of [momentum, mean_reversion, breakout, volatility, microstructure, event_drift, stat_arb, trend_following, ml_alpha, prediction].
2. Universe: Dynamic multi-asset selection (no hardcoded single symbol, 2-5 liquid assets from SPY, QQQ, AAPL, MSFT, NVDA, BTCUSDT, ETHUSDT).
3. Indicators: Combine at least 2 distinct indicator families (e.g. Trend + Volatility, or Microstructure + Momentum).
4. Signals: Define explicit causal entry signal (Present: t <= T) and exit barrier rules (Future: t > T).
5. Sizing & Risk: Sizing risk_weight in [0.01, 0.25], stop_loss_pct <= 0.05, max_holding_days in [1, 30].

Output Format: Return strictly a single raw JSON object without markdown fences, matching:
{
  "hypothesis": "Theoretical or empirical market edge thesis (2-3 sentences)",
  "family": "one of the canonical families",
  "archetype": "descriptive_snake_case_archetype",
  "timeframe": "1h",
  "universe": ["SPY", "QQQ"],
  "model": "cnn_window_v0",
  "indicators": { "rsi": true, "bollinger": true, "atr": true, "vwap": true },
  "indicator_periods": { "rsi": 14, "atr": 14, "bollinger": 20 },
  "risk": { "risk_weight": 0.10, "stop_loss_pct": 0.03, "take_profit_pct": 0.06, "max_holding_days": 5, "signal_threshold": 0.60 },
  "entry_signal": "causal entry trigger condition",
  "exit_signal": "exit barrier or timeout condition"
}`;

  const response = await ask(userPrompt, systemPrompt);
  if (!response?.text) return null;

  if (response.usage) {
    const pTokens = response.usage.prompt_tokens ?? response.usage.input_tokens ?? 0;
    const cTokens = response.usage.completion_tokens ?? response.usage.output_tokens ?? 0;
    const tTokens = response.usage.total_tokens ?? (pTokens + cTokens);
    console.log(`[AI-TOKENS] model=${response.source} prompt=${pTokens} completion=${cTokens} total=${tTokens}`);
  }

  try {
    let clean = response.text.trim();
    const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || clean.match(/(\{[\s\S]*\})/);
    if (jsonMatch) clean = jsonMatch[1].trim();
    const parsed = JSON.parse(clean);
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      ...parsed,
      source: response.source,
      usage: response.usage || null,
    };
  } catch {
    return null;
  }
}

module.exports = {
  ask,
  isAvailable,
  synthesizeStrategyWithAi,
  ROUTER_MODEL,
};
