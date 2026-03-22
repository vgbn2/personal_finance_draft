import * as state from './state.js';

export function setWsState(s) {
  const pill = document.getElementById('wsPill'), dot = document.getElementById('wsDot'), lbl = document.getElementById('wsLabel');
  const banner = document.getElementById('reconnectBanner');
  pill.className = 'ws-pill ' + s;
  if (s === 'connected') {
    dot.className = 'dot g'; lbl.textContent = 'WS 0.0.0.0:8000';
    banner.classList.remove('show');
    if (state.retries > 0) window.addLog('OK', 'WS reconnected after <b>' + state.retries + '</b> attempts — STATE_SYNC confirmed');
    state.setBackoffMs(50); state.setRetries(0);
  } else if (s === 'reconnecting') {
    dot.className = 'dot a'; lbl.textContent = 'Reconnecting…'; banner.classList.add('show');
  } else {
    dot.className = 'dot r'; lbl.textContent = 'Disconnected';
  }
}

export function simulateDisconnect() {
  window.addLog('WARN', 'WS connection lost — exponential backoff starting');
  setWsState('reconnecting');
  let attempt = 0;
  const iv = setInterval(() => {
    attempt++; state.setRetries(attempt);
    const bo = Math.min(50 * Math.pow(2, attempt - 1), 30000);
    state.setBackoffMs(bo);
    document.getElementById('retryCount').textContent = attempt;
    document.getElementById('backoffTime').textContent = bo;
    window.addLog('WARN', 'Reconnect attempt <b>' + attempt + '</b> — next in <b>' + bo + 'ms</b>');
    if (attempt >= 3) { clearInterval(iv); setTimeout(() => setWsState('connected'), 700); }
  }, 900);
}

export function maskKey(k) { return k.slice(0, 6) + '••••••••' + k.slice(-4); }

export function activateLive() {
  const keyInput = document.getElementById('keyInput');
  const key = keyInput.value.trim();
  if (!key || key.length < 10) { alert('Enter a valid private key.'); return; }
  state.setApiKey(key);
  keyInput.value = ''; // clear from DOM immediately
  window.closeModal();
  window.activateLiveUI();
  window.addLog('OK', 'Live API key loaded — <b>' + maskKey(state.apiKey) + '</b>');
  window.addLog('OK', 'CLOB endpoint: <b>' + document.getElementById('endpointInput').value + '</b>');
}

export function clearKey() {
  state.setApiKey(null);
  document.getElementById('keyStatus').style.display = 'none';
  window.setMode('paper');
  window.addLog('WARN', 'API key cleared from memory — back to paper mode');
}
