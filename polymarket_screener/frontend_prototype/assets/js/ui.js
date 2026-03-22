import * as state from './state.js';

export function sw(v, btn) {
  document.querySelectorAll('.view').forEach(x => x.classList.remove('on'));
  const target = document.getElementById('v' + v);
  if (target) target.classList.add('on');
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  btn.classList.add('on');
}

export function subSw(v, btn) {
  const parent = btn.parentElement.parentElement;
  parent.querySelectorAll('.sub-view').forEach(x => x.classList.remove('on'));
  const target = document.getElementById('sv-' + v);
  if (target) target.classList.add('on');
  parent.querySelectorAll('.sub-tab').forEach(x => x.classList.remove('on'));
  btn.classList.add('on');
}

export function filter(c, btn) {
  state.setCurFilter(c);
  document.querySelectorAll('.filter-row .chip').forEach(x => x.classList.remove('on'));
  btn.classList.add('on');
  renderTable();
}

export function renderTable() {
  const tbody = document.getElementById('stbody'); if (!tbody) return;
  const filtered = state.MKTS.filter(m => state.curFilter === 'All' || m.cat === state.curFilter);
  tbody.innerHTML = filtered.map(m => `
    <tr onclick="window.openOB('${m.n}')" style="cursor:pointer">
      <td>${m.n}</td>
      <td style="font-family:var(--font-mono)">${m.y.toFixed(1)}%</td>
      <td style="color:var(--blue)">${m.bs.toFixed(3)}</td>
      <td style="color:${(m.bs - m.y/100) > 0 ? 'var(--green)' : 'var(--red)'}">${(m.bs - m.y/100).toFixed(3)}</td>
      <td><div class="vbar"><div class="vfill" style="width:${m.vol}%"></div></div></td>
      <td><span class="sig-badge ${m.sc}">${m.sig}</span></td>
    </tr>
  `).join('');
  document.getElementById('mcount').textContent = filtered.length + ' markets';
}

export function openOB(name) {
  const m = state.MKTS.find(x => x.n === name); if (!m) return;
  state.setSelMkt(m);
  const ob = document.getElementById('ob-detail'); ob.style.display = 'block';
  document.getElementById('ob-title').textContent = m.n;
  document.getElementById('ob-yp').textContent = m.y.toFixed(1) + '%';
  document.getElementById('ob-bs').textContent = m.bs.toFixed(3);
  const edge = m.bs - m.y/100;
  const edgeEl = document.getElementById('ob-edge');
  edgeEl.textContent = (edge >= 0 ? '+' : '') + edge.toFixed(3);
  edgeEl.style.color = edge > 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('ob-kelly').textContent = (m.kelly * 100).toFixed(1) + '%';
  const sp = (Math.random() * 0.008 + 0.002);
  document.getElementById('ob-sp').textContent = sp.toFixed(3);
  document.getElementById('ob-liq').textContent = m.liq;
  document.getElementById('ob-exec').textContent = (edge > sp * 1.5) ? 'TAKER' : 'MAKER';
  
  // generated book
  let bids = '', asks = '';
  for (let i = 0; i < 5; i++) {
    const pB = m.y / 100 - (i * 0.002);
    const sB = Math.floor(Math.random() * 5000 + 1000);
    bids += `<div class="ob-row"><span class="ob-p">${pB.toFixed(3)}</span><span class="ob-s">$${sB.toLocaleString()}</span><div class="ob-bg" style="width:${sB / 60}%"></div></div>`;
    const pA = m.y / 100 + sp + (i * 0.002);
    const sA = Math.floor(Math.random() * 5000 + 1000);
    asks += `<div class="ob-row"><span class="ob-p" style="color:var(--red)">${pA.toFixed(3)}</span><span class="ob-s">$${sA.toLocaleString()}</span><div class="ob-bg r" style="width:${sA / 60}%"></div></div>`;
  }
  document.getElementById('ob-bids').innerHTML = bids;
  document.getElementById('ob-asks').innerHTML = asks;
  if (state.apiKey) document.getElementById('placeOrderBtn').style.display = 'block';
  calcSlip();
}

export function closeOB() { document.getElementById('ob-detail').style.display = 'none'; state.setSelMkt(null); }

export function calcSlip() {
  const size = parseFloat(document.getElementById('tradeSize').value) || 1000;
  const m = state.selMkt; if (!m) return;
  const slip = (size / 10000) * 0.001;
  document.getElementById('ob-slip').textContent = (slip * 100).toFixed(3) + '%';
  document.getElementById('effp').textContent = (m.y / 100 + slip).toFixed(4);
  document.getElementById('slipc').textContent = '$' + (size * slip).toFixed(2);
}

export function addLog(lvl, msg) {
  const box = document.getElementById('logbox'); if (!box) return;
  const d = new Date();
  const ts = d.toTimeString().split(' ')[0] + '.' + d.getMilliseconds().toString().padStart(3, '0');
  const div = document.createElement('div');
  div.className = 'log-line';
  div.innerHTML = `<span class="log-ts">${ts}</span><span class="log-lvl ${lvl.toLowerCase()}">${lvl}</span><span class="log-msg">${msg}</span>`;
  box.prepend(div);
  if (box.children.length > 100) box.lastChild.remove();
}

export function startLogs() {
  if (state.logRunning) return;
  state.setLogRunning(true);
  const next = () => {
    const m = state.LOG_MSGS[state.logIdx % state.LOG_MSGS.length];
    addLog(m[0], m[1]);
    state.incrementLogIdx();
    setTimeout(next, Math.random() * 2000 + 500);
  };
  next();
}

export function clearLogs() {
  const box = document.getElementById('logbox');
  if (box) box.innerHTML = '';
  addLog('INFO', 'Log buffer cleared');
}

export function updatePnLTicker() {
  const val = document.getElementById('pnlValue');
  const pct = document.getElementById('pnlPct');
  const foot = document.getElementById('footerPnL');
  const ticker = document.getElementById('pnlTicker');
  const v = state.sessionPnL;
  val.textContent = (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toFixed(2);
  const p = (v / 10000) * 100;
  pct.textContent = (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
  foot.textContent = (v >= 0 ? '+' : '') + '$' + Math.abs(v).toFixed(0);
  ticker.className = 'pnl-ticker ' + (v >= 0 ? 'pos' : 'neg');
  val.style.color = v >= 0 ? 'var(--green)' : 'var(--red)';
}

export function renderPositions() {
  const body = document.getElementById('posBody'); if (!body) return;
  body.innerHTML = state.POSITIONS.map((p, i) => {
    const unreal = (p.cur - p.entry) * p.size / p.entry;
    const roi = (unreal / p.size) * 100;
    const target = p.cur * Math.exp(-1.5 * (roi / 100));
    return `
      <tr>
        <td>${p.mkt}</td>
        <td><span class="sig-badge ss">${p.side}</span></td>
        <td style="font-family:var(--font-mono)">$${p.size}</td>
        <td style="font-family:var(--font-mono)">${p.entry.toFixed(3)}</td>
        <td style="font-family:var(--font-mono)">${p.cur.toFixed(3)}</td>
        <td style="color:${unreal >= 0 ? 'var(--green)' : 'var(--red)'};font-family:var(--font-mono)">${unreal >= 0 ? '+' : ''}$${unreal.toFixed(0)}</td>
        <td style="color:${roi >= 0 ? 'var(--green)' : 'var(--red)'};font-family:var(--font-mono)">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</td>
        <td style="color:var(--amber);font-family:var(--font-mono)">${target.toFixed(3)}</td>
        <td>${p.dte}d</td>
        <td><button class="btn" style="padding:2px 6px;font-size:9px" onclick="window.closePosition(${i})">Close</button></td>
      </tr>
    `;
  }).join('');
  document.getElementById('posCount').textContent = state.POSITIONS.length + ' open';
  document.getElementById('footerPos').textContent = state.POSITIONS.length + ' open';
}

export function closePosition(i) {
  const p = state.POSITIONS[i];
  const unreal = (p.cur - p.entry) * p.size / p.entry;
  state.updateSessionPnL(unreal);
  state.POSITIONS.splice(i, 1);
  addLog('OK', `Closed ${p.side} on <b>${p.mkt}</b> — Realized <b>$${unreal.toFixed(2)}</b>`);
  updatePnLTicker();
  renderPositions();
}

export function renderAudit() {
  const body = document.getElementById('auditBody'); if (!body) return;
  const filtered = state.AUDIT_DATA.filter(a => state.auditFilter === 'ALL' || a.dec === state.auditFilter);
  body.innerHTML = filtered.map(a => `
    <tr>
      <td style="color:var(--text3)">${a.ts}</td>
      <td>${a.mkt}</td>
      <td style="color:var(--blue)">${a.bs}</td>
      <td>${a.mp}</td>
      <td style="color:var(--green)">${a.edge}</td>
      <td>${a.sp}</td>
      <td>${a.gA}</td>
      <td>${a.gB}</td>
      <td>${a.gC}</td>
      <td><span class="sig-badge ${a.dec === 'REJECT' ? 'ss' : a.dec === 'GATED' ? 'sh' : 'sb'}">${a.dec}</span></td>
      <td style="font-size:9px;color:var(--text3)">${a.reason}</td>
    </tr>
  `).join('');
}
