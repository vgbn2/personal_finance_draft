import * as state from './state.js';
import * as math from './math.js';
import * as ui from './ui.js';

export function stToggleChip(chip) {
  chip.classList.toggle('on');
  stUpdate();
}

export function stSetExec(mode) {
  state.setStExecMode(mode);
  document.querySelectorAll('#vst .chip').forEach(c => {
    if (['Auto','Taker only','Maker only'].includes(c.textContent)) c.classList.remove('on');
  });
  if (mode === 'AUTO') document.getElementById('stModeAuto').classList.add('on');
  else if (mode === 'TAKER') document.getElementById('stModeTaker').classList.add('on');
  else document.getElementById('stModeMaker').classList.add('on');
  stUpdate();
}

export function stUpdate() {
  const minLiq = parseFloat(document.getElementById('stMinLiq').value);
  document.getElementById('stMinLiqVal').textContent = '$' + minLiq + 'K';
  const minVol = parseInt(document.getElementById('stMinVol').value);
  document.getElementById('stMinVolVal').textContent = minVol + '%';
  const edge = parseFloat(document.getElementById('stMinEdge').value);
  document.getElementById('stMinEdgeVal').textContent = edge.toFixed(3);
  const fair = parseFloat(document.getElementById('stMinFair').value);
  document.getElementById('stMinFairVal').textContent = fair.toFixed(2);
  const vrp = parseFloat(document.getElementById('stVrp').value);
  document.getElementById('stVrpVal').textContent = vrp.toFixed(2);
  const kelly = parseFloat(document.getElementById('stKelly').value);
  document.getElementById('stKellyVal').textContent = kelly.toFixed(2) + 'x';
  const maxPos = parseFloat(document.getElementById('stMaxPos').value);
  document.getElementById('stMaxPosVal').textContent = maxPos.toFixed(1) + '%';
  const sl = parseInt(document.getElementById('stSL').value);
  document.getElementById('stSLVal').textContent = sl + '%';
  const kd = parseFloat(document.getElementById('stKd').value);
  document.getElementById('stKdVal').textContent = kd.toFixed(1);

  // Gauges
  const agg = Math.min((edge * 200) + (kelly * 100) + (maxPos * 5), 100);
  const rsk = Math.min((maxPos * 10) + (sl / 2) + (kelly * 40), 100);
  const rch = Math.min(100 - (minLiq / 20) + (100 - minVol), 100);
  
  const setG = (id, v) => {
    const bar = document.getElementById(id + 'Bar');
    const val = document.getElementById(id + 'Val');
    bar.style.width = v + '%';
    val.textContent = v.toFixed(0);
    const col = v > 70 ? 'var(--red)' : v > 40 ? 'var(--amber)' : 'var(--green)';
    if (id === 'Reach') bar.style.background = v > 70 ? 'var(--green)' : v > 40 ? 'var(--blue)' : 'var(--amber)';
    else bar.style.background = col;
    val.style.color = id === 'Reach' ? (v > 70 ? 'var(--green)' : 'var(--blue)') : col;
  };
  setG('Agg', agg); setG('Risk', rsk); setG('Reach', rch);
  
  document.getElementById('stSumEdge').textContent = edge.toFixed(3);
  document.getElementById('stSumKelly').textContent = kelly.toFixed(2) + 'x';
  document.getElementById('stSumPos').textContent = maxPos.toFixed(1) + '%';
  document.getElementById('stSumSL').textContent = sl + '%';

  math.stDrawDecay(kd);
  stGenYaml();

  // Preview List
  const matches = state.MKTS.filter(m => m.liq.replace('$','').replace('M','000').replace('K','') >= minLiq && m.vol >= minVol && (m.bs - m.y/100) >= edge);
  document.getElementById('stMatchCount').textContent = matches.length + ' match';
  document.getElementById('stPreviewList').innerHTML = matches.map(m => `
    <div class="row" style="padding:6px 0;border-bottom:1px solid #111">
      <span style="font-size:10px;flex:1">${m.n}</span>
      <span style="font-size:10px;color:var(--green);font-family:var(--font-mono)">+${(m.bs - m.y/100).toFixed(3)}</span>
    </div>
  `).join('');
}

export function stGenYaml() {
  const name = document.getElementById('stStratName').value;
  const edge = document.getElementById('stMinEdge').value;
  const vrp = document.getElementById('stVrp').value;
  const kelly = document.getElementById('stKelly').value;
  const kd = document.getElementById('stKd').value;
  const yaml = `strategy:
  name: ${name}
  signals:
    min_edge: ${edge}
    vrp_haircut: ${vrp}
    black_scholes_enabled: true
  execution:
    mode: ${state.stExecMode}
    kelly_fraction: ${kelly}
    max_position_size: ${document.getElementById('stMaxPos').value / 100}
    greed_decay: ${kd}
    stop_loss: ${document.getElementById('stSL').value / 100}`;
  document.getElementById('stYamlOut').textContent = yaml;
}

export function stExport() {
  const name = document.getElementById('stStratName').value;
  ui.addLog('OK', `Exported <b>${name}</b> to strategy_params.yaml`);
  const blob = new Blob([document.getElementById('stYamlOut').textContent], {type: 'text/yaml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'strategy_params.yaml'; a.click();
}
