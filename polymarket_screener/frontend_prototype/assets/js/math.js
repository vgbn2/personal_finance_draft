import * as state from './state.js';

export function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1; x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export function recalcVRP() {
  const spot = parseFloat(document.getElementById('vrpSpot').value) || 87500;
  const strike = parseFloat(document.getElementById('vrpStrike').value) || 100000;
  const rawIV = parseFloat(document.getElementById('vrpIV').value) || 72.4;
  const dte = parseFloat(document.getElementById('vrpDTE').value) || 180;
  const VRP_DISCOUNT = 0.85;
  const adjIV = rawIV / VRP_DISCOUNT / 100;
  const t = dte / 365;
  const r = 0.05;
  const sigma = adjIV;
  let fair, d1, d2;
  if (t <= 0) { fair = spot >= strike ? 1.0 : 0.0; }
  else {
    d1 = (Math.log(spot / strike) + (r + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
    d2 = d1 - sigma * Math.sqrt(t);
    fair = normCDF(d2);
  }
  const mktPrice = fair + (Math.random() * 0.06 - 0.01); // simulated market
  const edge = fair - mktPrice;
  // update bars
  const pct = v => Math.min(Math.max(v * 100, 2), 100);
  document.getElementById('vrpRawIV').textContent = rawIV.toFixed(1) + '%';
  document.getElementById('vrpAdjIV').textContent = (rawIV / VRP_DISCOUNT).toFixed(1) + '%';
  document.getElementById('vrpFair').textContent = fair.toFixed(3);
  document.getElementById('vrpMkt').textContent = mktPrice.toFixed(3);
  const edgeEl = document.getElementById('vrpEdge');
  edgeEl.textContent = (edge >= 0 ? '+' : '') + edge.toFixed(3);
  edgeEl.style.color = edge > 0 ? 'var(--green)' : edge < -0.02 ? 'var(--red)' : 'var(--amber)';
  const edgeBar = document.getElementById('vrpEdgeBar');
  edgeBar.style.width = pct(Math.abs(edge) * 5) + '%';
  edgeBar.style.background = edge > 0 ? 'var(--green)' : 'var(--red)';
  // update bar widths
  const bars = document.querySelectorAll('.vrp-bar');
  if (bars[0]) bars[0].style.width = pct(rawIV / 100) + '%';
  if (bars[1]) bars[1].style.width = pct(rawIV / VRP_DISCOUNT / 100) + '%';
  if (bars[2]) bars[2].style.width = pct(fair) + '%';
  if (bars[3]) bars[3].style.width = pct(mktPrice) + '%';
  drawVRPChart(spot, strike, rawIV, dte, fair);
}

export function drawVRPChart(spot, strike, rawIV, dte, fairCurrent) {
  const canvas = document.getElementById('vrpCanvas');
  if (!canvas || !canvas.offsetWidth) return;
  const W = canvas.offsetWidth, H = 120, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
  const VRP = 0.85, r = 0.05;
  // sweep IV from 10% to 120%
  const ivRange = Array.from({ length: 50 }, (_, i) => (10 + i * 2.2) / 100);
  const rawFairs = ivRange.map(iv => { const s = iv / Math.sqrt(365 / dte); const d2 = (Math.log(spot / strike) + (r + iv * iv / 2) * (dte / 365)) / (iv * Math.sqrt(dte / 365)) - s; return normCDF(d2 - s + s); });
  const adjFairs = ivRange.map(iv => { const adjIv = iv / VRP; const t = dte / 365; const d1 = (Math.log(spot / strike) + (r + adjIv * adjIv / 2) * t) / (adjIv * Math.sqrt(t)); const d2 = d1 - adjIv * Math.sqrt(t); return normCDF(d2); });
  const allV = [...rawFairs, ...adjFairs], mn = Math.min(...allV), mx = Math.max(...allV);
  const py = v => H - 8 - (v - mn) / (mx - mn + .01) * (H - 20);
  const px = i => 8 + i * (W - 16) / 49;
  // grid
  [.25, .5, .75].forEach(f => { const g = mn + (mx - mn) * f; ctx.beginPath(); ctx.moveTo(0, py(g)); ctx.lineTo(W, py(g)); ctx.strokeStyle = '#181818'; ctx.lineWidth = .5; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#2a2a2a'; ctx.font = '8px IBM Plex Mono'; ctx.fillText(g.toFixed(2), 4, py(g) - 2); });
  // raw IV curve
  ctx.beginPath(); rawFairs.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
  ctx.strokeStyle = 'rgba(255,82,82,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  // VRP-adjusted curve
  ctx.beginPath(); adjFairs.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
  ctx.strokeStyle = 'rgba(0,255,135,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  // current fair price dot
  const curX = px(25), curY = py(fairCurrent);
  ctx.beginPath(); ctx.arc(curX, curY, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'var(--green)'; ctx.fill();
  ctx.fillStyle = '#888'; ctx.font = '8px IBM Plex Mono';
  ctx.fillText('Raw IV (red)  Adj IV (green)', 4, H - 4);
}

export function runMC() {
  const canvas = document.getElementById('mcCanvas'); if (!canvas || !canvas.offsetWidth) return;
  const W = canvas.offsetWidth, H = 200, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr; const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, W, H);
  const vol = state.mcVol / 100 / Math.sqrt(252), days = state.mcDays;
  let paths = [], finals = [];
  for (let i = 0; i < state.mcN; i++) { let p = 10000, path = [p]; for (let d = 0; d < days; d++) { const shock = state.shockActive && d === Math.floor(days / 2) ? -0.12 + Math.random() * -0.1 : 0; p *= (1 + (Math.random() - .5) * vol * Math.sqrt(days / 252) + shock); path.push(p); } paths.push(path); finals.push(p); }
  finals.sort((a, b) => a - b);
  const allV = paths.flat(), mn = Math.min(...allV), mx = Math.max(...allV);
  const py = v => H - 10 - (v - mn) / (mx - mn + 1e-9) * (H - 25), px = d => 8 + d * (W - 16) / days;
  [.25, .5, .75].forEach(f => { const g = mn + (mx - mn) * f; ctx.beginPath(); ctx.moveTo(0, py(g)); ctx.lineTo(W, py(g)); ctx.strokeStyle = '#181818'; ctx.lineWidth = .5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#2a2a2a'; ctx.font = '8px IBM Plex Mono'; ctx.fillText('$' + (g / 1000).toFixed(1) + 'K', 4, py(g) - 2); });
  paths.forEach(p => { ctx.beginPath(); p.forEach((v, d) => d === 0 ? ctx.moveTo(px(d), py(v)) : ctx.lineTo(px(d), py(v))); ctx.strokeStyle = p[days] > p[0] ? 'rgba(0,255,135,0.04)' : 'rgba(255,82,82,0.04)'; ctx.lineWidth = .7; ctx.stroke(); });
  const med = paths[Math.floor(state.mcN / 2)], best = paths.reduce((a, b) => a[days] > b[days] ? a : b), worst = paths.reduce((a, b) => a[days] < b[days] ? a : b);
  [[med, 'rgba(123,156,255,.85)', 2], [best, 'rgba(0,255,135,.65)', 1.5], [worst, 'rgba(255,82,82,.65)', 1.5]].forEach(([p, c, w]) => { ctx.beginPath(); p.forEach((v, d) => d === 0 ? ctx.moveTo(px(d), py(v)) : ctx.lineTo(px(d), py(v))); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); });
  const d_vals = Array.from({ length: days + 1 }, (_, d) => 10000 * (1 + (finals[Math.floor(state.mcN / 2)] - 10000) / 10000 * d / days));
  ctx.beginPath(); d_vals.forEach((v, d) => d === 0 ? ctx.moveTo(px(d), py(v)) : ctx.lineTo(px(d), py(v))); ctx.strokeStyle = 'rgba(255,179,64,.5)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
  const var95 = finals[Math.floor(state.mcN * .05)];
  const cvar99v = finals.slice(0, Math.max(Math.floor(state.mcN * .01), 1));
  document.getElementById('mc1').textContent = '$' + best[days].toFixed(0); document.getElementById('mc2').textContent = '$' + worst[days].toFixed(0);
  document.getElementById('mc3').textContent = '$' + med[days].toFixed(0); document.getElementById('mc4').textContent = '-$' + (10000 - var95).toFixed(0);
  document.getElementById('mc5').textContent = '-$' + (10000 - cvar99v.reduce((a, b) => a + b, 0) / cvar99v.length).toFixed(0);
  state.setShockActive(false); window.addLog('INFO', 'MC N=' + state.mcN + ' vol=' + state.mcVol + '% days=' + state.mcDays + ' VaR95=-$' + (10000 - var95).toFixed(0));
}

export function drawDist(rets) {
  const canvas = document.getElementById('distCanvas'); if (!canvas) return;
  const W = canvas.offsetWidth || 280, H = 100, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr; const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0e0e0e'; ctx.fillRect(0, 0, W, H);
  const mn = Math.min(...rets), mx = Math.max(...rets), bins = 24, bw = (mx - mn) / bins;
  const counts = new Array(bins).fill(0); rets.forEach(r => { const b = Math.min(Math.floor((r - mn) / bw), bins - 1); counts[b]++; });
  const maxC = Math.max(...counts), pw = W / bins;
  counts.forEach((c, i) => { const h = (c / maxC) * (H - 10), pct = i / bins; ctx.fillStyle = pct < .3 ? 'rgba(255,82,82,0.65)' : pct > .7 ? 'rgba(0,255,135,0.65)' : 'rgba(123,156,255,0.5)'; ctx.fillRect(i * pw + 1, H - h, pw - 2, h); });
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = .5; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#333'; ctx.font = '8px IBM Plex Mono'; ctx.fillText('Return distribution', 4, 10);
}

export function drawCorr() {
  const labels = ['BTC', 'ETH', 'POLY', 'SPX', 'FED'];
  const c = [[1, .82, .61, .34, .18], [.82, 1, .55, .41, .22], [.61, .55, 1, .28, .31], [.34, .41, .28, 1, .67], [.18, .22, .31, .67, 1]];
  let html = '<div></div>' + labels.map(l => `<div class="corr-lbl">${l}</div>`).join('');
  labels.forEach((_, i) => { html += `<div class="corr-lbl">${labels[i]}</div>`; labels.forEach((_, j) => { const v = c[i][j], a = Math.abs(v); html += `<div class="corr-cell" style="background:${v > 0 ? `rgba(0,255,135,${.1 + a * .6})` : `rgba(255,82,82,${.1 + a * .6})`};color:${a > .5 ? '#e0e0e0' : '#555'}">${v.toFixed(2)}</div>`; }); });
  document.getElementById('corrMatrix').innerHTML = html;
}

export function drawHeatmap(mr) {
  const months = Object.keys(mr), vals = Object.values(mr), maxV = Math.max(...vals.map(Math.abs));
  document.getElementById('heatmap').innerHTML = months.map((m, i) => { const v = vals[i], a = Math.abs(v) / maxV; const bg = v > 0 ? `rgba(0,255,135,${.12 + a * .65})` : `rgba(255,82,82,${.12 + a * .65})`; const tc = v > 0 ? `rgba(0,255,135,${.7 + a * .3})` : `rgba(255,82,82,${.7 + a * .3})`; return `<div class="hm-cell" style="background:${bg}"><div class="hm-m">${m}</div><div class="hm-v" style="color:${tc}">${(v * 100).toFixed(1)}%</div></div>`; }).join('');
}

export function updateDecayChart(entry) {
  document.getElementById('entrySliderVal').textContent = '$' + entry.toFixed(2);
  const canvas = document.getElementById('decayCanvas');
  if (!canvas || !canvas.offsetWidth) return;
  const W = canvas.offsetWidth, H = 90, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
  const k = entry * 2.5;
  const p_real = 0.72;
  const roiVals = Array.from({ length: 60 }, (_, i) => i / 60 * 2);
  const targets = roiVals.map(roi => p_real * Math.exp(-k * roi));
  const mn = Math.min(...targets), mx = p_real;
  const px = i => 8 + i * (W - 16) / 59;
  const py = v => H - 8 - (v - mn) / (mx - mn + .01) * (H - 20);
  ctx.beginPath(); ctx.moveTo(0, py(p_real)); ctx.lineTo(W, py(p_real));
  ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = .5; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#2a2a2a'; ctx.font = '8px IBM Plex Mono';
  ctx.fillText('p_real=' + p_real, 4, py(p_real) - 3);
  ctx.beginPath(); targets.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
  ctx.strokeStyle = 'var(--green)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.lineTo(px(59), H); ctx.lineTo(px(0), H); ctx.fillStyle = 'rgba(0,255,135,0.06)'; ctx.fill();
  ctx.fillStyle = '#888'; ctx.font = '8px IBM Plex Mono';
  ctx.fillText('k=' + k.toFixed(2) + ' (entry=$' + entry.toFixed(2) + ')', 4, H - 4);
}

export function stDrawDecay(k) {
  const canvas = document.getElementById('stDecayCanvas');
  if (!canvas || !canvas.offsetWidth) return;
  const W = canvas.offsetWidth, H = 55, dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, W, H);
  const pts = Array.from({ length: 60 }, (_, i) => 0.72 * Math.exp(-k * (i / 60 * 2)));
  const mn = Math.min(...pts), mx = 0.72;
  const px = i => 8 + i * (W - 16) / 59;
  const py = v => H - 6 - (v - mn) / (mx - mn + .01) * (H - 14);
  ctx.beginPath(); pts.forEach((v, i) => i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v)));
  ctx.strokeStyle = 'var(--green)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.lineTo(px(59), H); ctx.lineTo(px(0), H);
  ctx.fillStyle = 'rgba(0,255,135,0.05)'; ctx.fill();
  ctx.fillStyle = '#333'; ctx.font = '8px IBM Plex Mono';
  ctx.fillText('k=' + k.toFixed(1) + '  exit target decays as ROI grows →', 4, H - 3);
}
