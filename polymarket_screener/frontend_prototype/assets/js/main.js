import * as state from './state.js';
import * as api from './api.js';
import * as math from './math.js';
import * as ui from './ui.js';
import * as bt from './backtest.js';
import * as st from './strategy_builder.js';

// --- BRIDGE FOR HTML COMPATIBILITY ---
// The following functions are attached to window so the inline onclick handlers in index.html work.
// Recommendation: Refactor index.html to use addEventListener in a future phase.

window.sw = ui.sw;
window.subSw = ui.subSw;
window.filter = ui.filter;
window.openOB = ui.openOB;
window.closeOB = ui.closeOB;
window.calcSlip = ui.calcSlip;
window.closePosition = ui.closePosition;
window.clearLogs = ui.clearLogs;

window.runBacktest = bt.runBacktest;
window.runMC = math.runMC;

window.recalcVRP = math.recalcVRP;

window.stToggleChip = st.stToggleChip;
window.stSetExec = st.stSetExec;
window.stExport = st.stExport;

window.simulateDisconnect = api.simulateDisconnect;
window.activateLive = api.activateLive;
window.clearKey = api.clearKey;

window.setMode = function(m) {
  state.setCurrentMode(m);
  const pb = document.getElementById('paperBtn'), lb = document.getElementById('liveBtn');
  if (m === 'live' && !state.apiKey) {
    document.getElementById('apiModal').style.display = 'flex';
    return;
  }
  pb.classList.toggle('active', m === 'paper');
  lb.classList.toggle('active', m === 'live');
  ui.addLog(m === 'live' ? 'WARN' : 'INFO', `Switched to <b>${m.toUpperCase()}</b> mode`);
  if (m === 'live') {
    document.getElementById('placeOrderBtn').style.display = 'block';
    document.getElementById('keyStatus').style.display = 'flex';
  } else {
    document.getElementById('placeOrderBtn').style.display = 'none';
  }
};

window.openModal = () => document.getElementById('apiModal').style.display = 'flex';
window.closeModal = () => document.getElementById('apiModal').style.display = 'none';

window.activateLiveUI = () => {
  document.getElementById('keyDisplay').textContent = api.maskKey(state.apiKey);
  window.setMode('live');
};

// --- INITIALIZATION ---

window.onload = () => {
  ui.renderTable();
  ui.renderPositions();
  ui.renderAudit();
  ui.startLogs();
  math.recalcVRP();
  st.stUpdate();
  
  // Uptime timer
  let start = Date.now();
  setInterval(() => {
    let diff = Math.floor((Date.now() - start) / 1000);
    let h = Math.floor(diff / 3600).toString().padStart(2,'0');
    let m = Math.floor((diff % 3600) / 60).toString().padStart(2,'0');
    let s = (diff % 60).toString().padStart(2,'0');
    document.getElementById('uptime').textContent = `${h}:${m}:${s}`;
  }, 1000);

  // Drift simulation
  setInterval(() => {
    const drift = (Math.random() * 2 - 1) * 2;
    state.updateSessionPnL(drift);
    ui.updatePnLTicker();
    const age = (Math.random() * 100 + 10).toFixed(0);
    document.getElementById('syncAge').textContent = age + 'ms';
  }, 3000);

  // Simulation bindings
  document.getElementById('mcNRange').oninput = e => { state.setMcN(parseInt(e.target.value)); document.getElementById('nval').textContent = state.mcN; math.runMC(); };
  document.getElementById('mcVolRange').oninput = e => { state.setMcVol(parseInt(e.target.value)); document.getElementById('volval').textContent = state.mcVol + '%'; math.runMC(); };
  document.getElementById('mcDaysRange').oninput = e => { state.setMcDays(parseInt(e.target.value)); document.getElementById('daysval').textContent = state.mcDays; math.runMC(); };
  document.getElementById('injectShockBtn').onclick = () => { state.setShockActive(true); ui.addLog('WARN', 'Black Swan shock injected into MC path'); math.runMC(); };
  
  document.getElementById('portSizeRange').oninput = e => { state.setPortSize(parseInt(e.target.value)); document.getElementById('portVal').textContent = '$' + state.portSize.toLocaleString(); };
  document.getElementById('ivShockRange').oninput = e => { document.getElementById('ivVal').textContent = (e.target.value > 0 ? '+' : '') + e.target.value + '%'; };
  document.getElementById('priceShockRange').oninput = e => { document.getElementById('priceVal').textContent = (e.target.value > 0 ? '+' : '') + e.target.value + '%'; };
  document.getElementById('gateASlider').oninput = e => { document.getElementById('gateASliderVal').textContent = e.target.value + '%'; document.getElementById('gateAPct').textContent = e.target.value + '%'; document.getElementById('gateABar').style.width = (e.target.value/40*100) + '%'; };
  document.getElementById('entryPriceRange').oninput = e => math.updateDecayChart(parseFloat(e.target.value));

  document.getElementById('stMinLiq').oninput = st.stUpdate;
  document.getElementById('stMinVol').oninput = st.stUpdate;
  document.getElementById('stMinEdge').oninput = st.stUpdate;
  document.getElementById('stMinFair').oninput = st.stUpdate;
  document.getElementById('stVrp').oninput = st.stUpdate;
  document.getElementById('stKelly').oninput = st.stUpdate;
  document.getElementById('stMaxPos').oninput = st.stUpdate;
  document.getElementById('stSL').oninput = st.stUpdate;
  document.getElementById('stKd').oninput = st.stUpdate;
  document.getElementById('stStratName').oninput = st.stUpdate;
  document.getElementById('stKw').oninput = st.stUpdate;
  document.getElementById('stExportBtn').onclick = st.stExport;
  document.getElementById('stRunBtn').onclick = bt.runBacktest;
  
  // Strategy Builder Chips
  document.querySelectorAll('#stCatChips .chip').forEach(c => c.onclick = () => st.stToggleChip(c));
  document.getElementById('stModeAuto').onclick = () => st.stSetExec('AUTO');
  document.getElementById('stModeTaker').onclick = () => st.stSetExec('TAKER');
  document.getElementById('stModeMaker').onclick = () => st.stSetExec('MAKER');

  document.getElementById('clearLogsBtn').onclick = ui.clearLogs;

  math.runMC();
  math.updateDecayChart(0.30);
  
  ui.addLog('INFO', 'Engine UI initialized — <b>v0.2.0</b>');
};
