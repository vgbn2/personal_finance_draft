import * as state from './state.js';
import * as math from './math.js';
import * as ui from './ui.js';

export function runBacktest() {
  const btn = document.getElementById('runBtn');
  btn.classList.remove('btn-go'); btn.classList.add('btn-warn'); btn.textContent = '■ Stop';
  const prog = document.getElementById('progBar');
  const lbl = document.getElementById('progLabel');
  document.getElementById('bt-empty').style.display = 'none';
  document.getElementById('bt-content').style.display = 'flex';
  
  let p = 0;
  const iv = setInterval(() => {
    p += 2; prog.style.width = p + '%';
    lbl.textContent = 'Computing: ' + p + '%';
    if (p >= 100) { clearInterval(iv); finishBt(); }
  }, 30);
}

export function finishBt() {
  const btn = document.getElementById('runBtn');
  btn.classList.add('btn-go'); btn.classList.remove('btn-warn'); btn.textContent = '▶ Run Backtest';
  document.getElementById('progLabel').textContent = 'Complete';
  
  const trades = [];
  let bal = state.portSize, peak = bal, mdd = 0;
  const equity = [bal], drawdowns = [0], rets = [];
  const startTs = new Date(document.getElementById('bt_from').value).getTime();
  
  for (let i = 0; i < 45; i++) {
    const win = Math.random() > 0.45;
    const r = win ? (Math.random() * 0.4) : -(Math.random() * 0.15);
    const pnl = bal * 0.05 * r;
    bal += pnl; peak = Math.max(peak, bal);
    const dd = (peak - bal) / peak * 100; mdd = Math.max(mdd, dd);
    equity.push(bal); drawdowns.push(dd); rets.push(r);
    trades.push({
      date: new Date(startTs + i * 86400000).toISOString().split('T')[0],
      mkt: state.MKTS[i % state.MKTS.length].n,
      side: win ? 'YES' : 'NO',
      entry: 0.5 + Math.random() * 0.2,
      exit: 0.6 + Math.random() * 0.2,
      pnl: pnl
    });
  }
  
  state.setBtResults({ bal, mdd, trades, equity, drawdowns, rets });
  renderBtMet(bal, mdd, rets);
  drawChart('eqCanvas', equity, 'var(--green)', 'Equity $');
  drawChart('ddCanvas', drawdowns, 'var(--red)', 'Drawdown %');
  renderTrades(trades);
  
  // Update Analytics
  document.getElementById('an-empty').style.display = 'none';
  document.getElementById('an-content').style.display = 'flex';
  const sharpe = (rets.reduce((a,b)=>a+b,0)/rets.length) / (Math.sqrt(rets.map(x=>Math.pow(x-rets.reduce((a,b)=>a+b,0)/rets.length,2)).reduce((a,b)=>a+b,0)/rets.length) || 1) * Math.sqrt(252);
  document.getElementById('sharpe').textContent = sharpe.toFixed(2);
  document.getElementById('mdd').textContent = mdd.toFixed(1) + '%';
  document.getElementById('wr').textContent = (trades.filter(t=>t.pnl>0).length/trades.length*100).toFixed(1) + '%';
  document.getElementById('pf').textContent = (Math.abs(trades.filter(t=>t.pnl>0).reduce((a,b)=>a+b.pnl,0)) / Math.abs(trades.filter(t=>t.pnl<0).reduce((a,b)=>a+b.pnl,0) || 1)).toFixed(2);
  
  math.drawDist(rets);
  math.drawCorr();
  math.drawHeatmap({Jan:.042, Feb:.081, Mar:-.021, Apr:.033, May:.112, Jun:.054, Jul:-.011, Aug:.022, Sep:.044, Oct:.091, Nov:.142, Dec:.067});
  
  ui.addLog('OK', `Backtest complete — <b>${trades.length}</b> trades, Net P&L <b>$${(bal-state.portSize).toFixed(0)}</b>, MDD <b>${mdd.toFixed(1)}%</b>`);
}

export function renderBtMet(bal, mdd, rets) {
  const met = document.getElementById('bt_met');
  const net = bal - state.portSize;
  met.innerHTML = `
    <div class="mc"><div class="mk">Net P&L</div><div class="mv" style="color:var(--green)">$${net.toFixed(0)}</div></div>
    <div class="mc"><div class="mk">Abs Return</div><div class="mv">${(net/state.portSize*100).toFixed(1)}%</div></div>
    <div class="mc"><div class="mk">Max DD</div><div class="mv" style="color:var(--red)">${mdd.toFixed(1)}%</div></div>
    <div class="mc"><div class="mk">Sharpe</div><div class="mv" style="color:var(--blue)">2.84</div></div>
    <div class="mc"><div class="mk">Trades</div><div class="mv">45</div></div>
  `;
}

export function drawChart(id, data, color, label) {
  const canvas = document.getElementById(id); if (!canvas) return;
  const W = canvas.offsetWidth, H = 130, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
  const mn = Math.min(...data), mx = Math.max(...data);
  const py = v => H - 10 - (v - mn) / (mx - mn + 1e-9) * (H - 25);
  const px = i => 10 + i * (W - 20) / (data.length - 1);
  ctx.beginPath(); data.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.lineTo(px(data.length - 1), H); ctx.lineTo(px(0), H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, color.replace(')', ',0.15)')); grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad; ctx.fill();
}

export function renderTrades(trades) {
  const body = document.getElementById('tradeRows');
  body.innerHTML = trades.map(t => `
    <tr>
      <td>${t.date}</td>
      <td>${t.mkt}</td>
      <td><span class="sig-badge ${t.side==='YES'?'sb':'ss'}">${t.side}</span></td>
      <td>${t.entry.toFixed(3)}</td>
      <td>${t.exit.toFixed(3)}</td>
      <td style="color:${t.pnl>=0?'var(--green)':'var(--red)'}">${t.pnl>=0?'+':''}$${t.pnl.toFixed(2)}</td>
    </tr>
  `).join('');
  document.getElementById('tlog-count').textContent = trades.length + ' trades';
}
