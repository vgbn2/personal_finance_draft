const http = require('node:http');

const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL    || 'qwen-sovereign';

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

/**
 * Ask the local Ollama model. Returns { text, source } or null if unavailable.
 * AI calls go through Claude Code subscription (MCP tools), not this client.
 */
async function ask(prompt, systemPrompt = '') {
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

    if (res.status !== 200) return null;
    const text = res.body?.message?.content;
    return text ? { text, source: `ollama:${OLLAMA_MODEL}` } : null;
  } catch {
    return null;
  }
}

async function isAvailable() {
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

module.exports = { ask, isAvailable };
