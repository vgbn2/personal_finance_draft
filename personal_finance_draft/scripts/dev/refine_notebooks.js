const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const NOTEBOOK_DIR = path.join(ROOT, 'notebooks');

function readNotebook(file) {
  return JSON.parse(fs.readFileSync(path.join(NOTEBOOK_DIR, file), 'utf8'));
}

function writeNotebook(file, nb) {
  fs.writeFileSync(path.join(NOTEBOOK_DIR, file), JSON.stringify(nb, null, 2) + '\n', 'utf8');
}

function codeCell(source) {
  return {
    cell_type: 'code',
    execution_count: null,
    metadata: {},
    outputs: [],
    source,
  };
}

function setCodeCell(nb, index, source) {
  const codeCells = nb.cells.filter((cell) => cell.cell_type === 'code');
  codeCells[index].source = source;
}

function appendCodeCell(nb, source) {
  nb.cells.push(codeCell(source));
}

function commonPrelude(extraImports = []) {
  const imports = ['from pathlib import Path', 'import sys', ...extraImports];
  return [
    ...imports,
    '',
    "ROOT = Path.cwd()",
    "if ROOT.name == 'notebooks':",
    '    ROOT = ROOT.parent',
    "NOTEBOOKS_DIR = ROOT / 'notebooks'",
    'if str(NOTEBOOKS_DIR) not in sys.path:',
    '    sys.path.insert(0, str(NOTEBOOKS_DIR))',
    '',
    'from notebook_utils import load_json, print_verdict, repo_root, run_cli',
    '',
    'ROOT = repo_root(ROOT)',
  ].join('\n');
}

function buildDataExploration() {
  const nb = readNotebook('data_exploration.ipynb');
  nb.cells[2].source = [
    commonPrelude(['from datetime import datetime, timezone', 'from collections import defaultdict']),
    '',
    'CACHE = ROOT / \'storage\' / \'data\' / \'cache\'',
    '',
    'def iter_history_records():',
    '    for path in sorted(CACHE.glob(\'*/backtest_history.json\')):',
    '        snap = load_json(path, {}) or {}',
    '        for row in snap.get(\'sources\', []):',
    '            yield row',
    '',
    'records = list(iter_history_records())',
    'len(records), CACHE',
  ].join('\n');
  nb.cells[3].source = [
    'def parse_ts(value):',
    '    if not value:',
    '        return None',
    '    try:',
    "        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))",
    '    except ValueError:',
    '        return None',
    '',
    "summary = defaultdict(lambda: {'rows': 0, 'first': None, 'last': None, 'providers': set()})",
    'for row in records:',
    "    key = (row.get('family', 'unknown'), row.get('symbol') or row.get('series') or row.get('underlying') or 'unknown', row.get('timeframe', 'point'))",
    "    ts = parse_ts(row.get('timestamp'))",
    '    item = summary[key]',
    "    item['rows'] += 1",
    "    item['providers'].add(row.get('provider') or row.get('source') or 'unknown')",
    '    if ts:',
    "        item['first'] = ts if item['first'] is None else min(item['first'], ts)",
    "        item['last'] = ts if item['last'] is None else max(item['last'], ts)",
    '',
    'now = datetime.now(timezone.utc)',
    'rows = []',
    "for (family, symbol, timeframe), item in summary.items():",
    "    age_hours = None if item['last'] is None else round((now - item['last']).total_seconds() / 3600, 1)",
    '    rows.append({',
    "        'family': family,",
    "        'symbol': symbol,",
    "        'timeframe': timeframe,",
    "        'rows': item['rows'],",
    "        'first': item['first'].date().isoformat() if item['first'] else None,",
    "        'last': item['last'].date().isoformat() if item['last'] else None,",
    "        'age_hours': age_hours,",
    "        'providers': ','.join(sorted(item['providers'])),",
    '    })',
    '',
    "sorted(rows, key=lambda r: (r['family'], r['symbol'], r['timeframe']))[:20]",
  ].join('\n');
  nb.cells[4].source = [
    "stale_daily = [r for r in rows if r['timeframe'] == '1d' and (r['age_hours'] is None or r['age_hours'] > 48)]",
    "sorted(stale_daily, key=lambda r: (r['family'], r['symbol']))",
  ].join('\n');
  appendCodeCell(nb, [
    'blocked = []',
    'if not records:',
    "    blocked.append('no cached history records were found')",
    'if stale_daily:',
    "    blocked.append(f\"{len(stale_daily)} stale 1d rows remain\")",
    "print_verdict('Data exploration', not blocked, blocked or [f'{len(rows)} symbol/timeframe groups summarized from {len(records)} records'], next_step='Repair ingestion freshness and rerun' if blocked else 'Promote the clean hypothesis into config/strategies/')",
  ].join('\n'));
  writeNotebook('data_exploration.ipynb', nb);
}

function buildFeatureImportance() {
  const nb = readNotebook('feature_importance.ipynb');
  nb.cells[2].source = [
    commonPrelude(['import math']),
    '',
    "FEATURE_PATH = ROOT / 'storage' / 'data' / 'features' / 'latest_features.json'",
    '',
    'features = load_json(FEATURE_PATH, {}) or {}',
    "frame = features.get('features') or features.get('rows') or []",
    'len(frame), FEATURE_PATH',
  ].join('\n');
  nb.cells[3].source = [
    'def numeric_keys(rows):',
    '    keys = set()',
    '    for row in rows[:5000]:',
    '        for k, v in row.items():',
    '            if isinstance(v, (int, float)) and math.isfinite(v):',
    '                keys.add(k)',
    '    return sorted(keys)',
    '',
    'def corr(xs, ys):',
    '    pairs = [(x, y) for x, y in zip(xs, ys) if isinstance(x, (int, float)) and isinstance(y, (int, float)) and math.isfinite(x) and math.isfinite(y)]',
    '    if len(pairs) < 20:',
    '        return None',
    '    mx = sum(x for x, _ in pairs) / len(pairs)',
    '    my = sum(y for _, y in pairs) / len(pairs)',
    '    num = sum((x - mx) * (y - my) for x, y in pairs)',
    '    denx = math.sqrt(sum((x - mx) ** 2 for x, _ in pairs))',
    '    deny = math.sqrt(sum((y - my) ** 2 for _, y in pairs))',
    '    if denx == 0 or deny == 0:',
    '        return None',
    '    return num / (denx * deny)',
    '',
    "target_candidates = ['future_return', 'forward_return', 'label_return', 'return_next', 'target']",
    "target_key = next((k for k in target_candidates if frame and k in frame[0]), None)",
    'target_key',
  ].join('\n');
  nb.cells[4].source = [
    'scores = []',
    'if not frame or not target_key:',
    "    print('No feature frame or target label found. Run: node backend/cli/sovereign_cli.js features --json')",
    'else:',
    "    target = [row.get(target_key) for row in frame]",
    '    for key in numeric_keys(frame):',
    '        if key == target_key:',
    '            continue',
    '        value = corr([row.get(key) for row in frame], target)',
    '        if value is not None:',
    "            scores.append({'feature': key, 'corr': round(value, 4), 'abs_corr': round(abs(value), 4)})",
    '    sorted(scores, key=lambda r: r[\'abs_corr\'], reverse=True)[:25]',
  ].join('\n');
  appendCodeCell(nb, [
    'blocked = []',
    'if not frame:',
    "    blocked.append('latest_features.json has no feature rows')",
    'if not target_key:',
    "    blocked.append('no target label was found')",
    'if frame and target_key and not scores:',
    "    blocked.append('no numeric feature passed the correlation filter')",
    "if scores:",
    "    top = sorted(scores, key=lambda r: r['abs_corr'], reverse=True)[0]",
    "    print('Suggested feature summary:')",
    "    print(f\"- feature: {top['feature']}\")",
    "    print(f\"- corr: {top['corr']}\")",
    "    print(f\"- abs_corr: {top['abs_corr']}\")",
    "print_verdict('Feature importance', not blocked, blocked or [f'{len(scores)} scored features found'], next_step='Translate the stable signals into strategy YAML' if blocked else 'Carry the strongest signals into walk-forward checks')",
  ].join('\n'));
  writeNotebook('feature_importance.ipynb', nb);
}

function buildModelTraining() {
  const nb = readNotebook('model_training.ipynb');
  nb.cells[2].source = [
    commonPrelude(),
    '',
    "MODEL_REPORT = ROOT / 'storage' / 'data' / 'models' / 'latest_model_comparison.json'",
    "STRATEGY_DIR = ROOT / 'config' / 'strategies'",
    '',
    'report = load_json(MODEL_REPORT, {}) or {}',
    "strategy_files = sorted(p.name for p in STRATEGY_DIR.glob('*.yaml'))",
    'MODEL_REPORT, len(strategy_files), strategy_files[:10]',
  ].join('\n');
  nb.cells[3].source = [
    'def flatten_model_report(obj):',
    '    rows = []',
    '    if isinstance(obj, dict):',
    "        candidates = obj.get('models') or obj.get('candidates') or obj.get('results') or []",
    '        if isinstance(candidates, dict):',
    "            candidates = [{'model': k, **(v if isinstance(v, dict) else {'value': v})} for k, v in candidates.items()]",
    '        for row in candidates if isinstance(candidates, list) else []:',
    '            if isinstance(row, dict):',
    '                rows.append(row)',
    '    return rows',
    '',
    'rows = flatten_model_report(report)',
    'rows[:10]',
  ].join('\n');
  nb.cells[4].source = [
    "metric_priority = ['oos_return', 'sharpe', 'profit_factor', 'accuracy', 'auc', 'score']",
    'ranked = []',
    'for row in rows:',
    '    metric = next((m for m in metric_priority if isinstance(row.get(m), (int, float))), None)',
    '    if metric:',
    '        ranked.append({',
    "            'model': row.get('model') or row.get('name') or row.get('id'),",
    "            'symbol': row.get('symbol'),",
    "            'metric': metric,",
    "            'value': round(float(row.get(metric)), 4),",
    "            'notes': row.get('notes') or row.get('reason')",
    '        })',
    'sorted(ranked, key=lambda r: r[\'value\'], reverse=True)[:20]',
  ].join('\n');
  appendCodeCell(nb, [
    'blocked = []',
    'strategy_draft = None',
    'if not rows:',
    "    blocked.append('latest_model_comparison.json has no candidate rows')",
    'if not ranked:',
    "    blocked.append('no numeric ranking metric was found')",
    'if ranked:',
    '    best = ranked[0]',
    "    strategy_draft = {",
    "        'name': f\"{best['model'] or 'candidate'}_research_draft\",",
    "        'model': best['model'],",
    "        'symbol': best['symbol'],",
    "        'source_metric': best['metric'],",
    "        'source_value': best['value'],",
    "        'notes': best['notes'],",
    "        'promotion_checks': [",
    "            'confirm walk-forward stability',",
    "            'confirm costs do not erase the edge',",
    "            'move into config/strategies only after review',",
    '        ],',
    '    }',
    "    print('Suggested strategy draft:')",
    "    for key, value in strategy_draft.items():",
    "        if isinstance(value, list):",
    "            print(f'{key}:')",
    "            for item in value:",
    "                print(f'  - {item}')",
    "        else:",
    "            print(f'{key}: {value}')",
    "print_verdict('Model training', not blocked, blocked or [f'{len(ranked)} ranked candidates available'], next_step='Capture the top candidate in config/strategies/ only after walk-forward passes' if blocked else 'Use the draft to seed a YAML strategy and then validate it in backtests')",
  ].join('\n'));
  writeNotebook('model_training.ipynb', nb);
}

function buildWalkForward() {
  const nb = readNotebook('walk_forward_optimization.ipynb');
  nb.cells[2].source = [
    commonPrelude(),
    '',
    "CLI = ROOT / 'backend' / 'cli' / 'sovereign_cli.js'",
    "STRATEGY = ROOT / 'config' / 'strategies' / 'mean_reversion.yaml'",
    '',
    'STRATEGY',
  ].join('\n');
  nb.cells[3].source = [
    'windows = [30, 60, 120]',
    'runs = []',
    'for days in windows:',
    "    result = run_cli(ROOT, ['bt', '--strategy', str(STRATEGY), '--days', str(days), '--timeframe', '1d'], timeout=180)",
    '    payload = result[\'payload\']',
    '    metrics = payload.get(\'metrics\', {}) if isinstance(payload, dict) else {}',
    '    runs.append({',
    "        'days': days,",
    "        'returncode': result['returncode'],",
    "        'engine': payload.get('engine') if isinstance(payload, dict) else None,",
    "        'final_value': metrics.get('final_value'),",
    "        'sharpe': metrics.get('sharpe'),",
    "        'max_drawdown': metrics.get('max_drawdown'),",
    "        'trades': len(payload.get('trades', [])) if isinstance(payload, dict) and isinstance(payload.get('trades'), list) else None,",
    "        'error': payload.get('error') if isinstance(payload, dict) else None,",
    '    })',
    'runs',
  ].join('\n');
  appendCodeCell(nb, [
    'blocked = []',
    'if not runs:',
    "    blocked.append('no walk-forward runs were recorded')",
    'failed = [r for r in runs if r[\'returncode\'] != 0 or r[\'error\']]',
    'if failed:',
    "    blocked.append(f'failed windows: {[r[\"days\"] for r in failed]}')",
    'values = [r[\'final_value\'] for r in runs if isinstance(r.get(\'final_value\'), (int, float))]',
    'center = (sum(values) / len(values)) if values else None',
    'if len(values) != len(windows):',
    "    blocked.append('missing final_value metrics in one or more windows')",
    'elif center:',
    '    spread = (max(values) - min(values)) / abs(center)',
    '    if spread > 0.25:',
    "        blocked.append(f'final_value spread {round(spread, 4)} exceeds the 0.25 stability threshold')",
    "print_verdict('Walk-forward optimization', not blocked, blocked or [f'{len(runs)} windows evaluated'], next_step='Promote the strategy to YAML only after the spread and cost checks stay stable' if blocked else 'Record the stable configuration in config/strategies/')",
  ].join('\n'));
  writeNotebook('walk_forward_optimization.ipynb', nb);
}

function buildBacktestAnalysis() {
  const nb = readNotebook('backtest_analysis.ipynb');
  nb.cells[2].source = [
    commonPrelude(['import statistics']),
    '',
    "BACKTEST_PATH = ROOT / 'storage' / 'data' / 'backtests' / 'latest_backtest.json'",
    '',
    'bt = load_json(BACKTEST_PATH, {}) or {}',
    'BACKTEST_PATH, list(bt.keys())[:20]',
  ].join('\n');
  nb.cells[3].source = [
    "metrics = bt.get('metrics', {}) if isinstance(bt, dict) else {}",
    "trades = bt.get('trades') or bt.get('trade_logs') or []",
    "curve = bt.get('equity_curve') or []",
    'summary = {',
    "    'engine': bt.get('engine'),",
    "    'strategy': bt.get('strategy') or bt.get('strategy_name'),",
    "    'final_value': metrics.get('final_value'),",
    "    'total_return': metrics.get('total_return'),",
    "    'annualized_return': metrics.get('annualized_return'),",
    "    'sharpe': metrics.get('sharpe'),",
    "    'max_drawdown': metrics.get('max_drawdown'),",
    "    'trade_count': len(trades),",
    "    'equity_points': len(curve),",
    '}',
    'summary',
  ].join('\n');
  nb.cells[4].source = [
    'def trade_pnl(trade):',
    "    for key in ['pnl', 'profit', 'return', 'realizedPl']:",
    '        value = trade.get(key) if isinstance(trade, dict) else None',
    '        if isinstance(value, (int, float)):',
    '            return value',
    '    return None',
    '',
    'pnls = [trade_pnl(t) for t in trades]',
    'pnls = [p for p in pnls if isinstance(p, (int, float))]',
    'trade_stats = {',
    "    'samples': len(pnls),",
    "    'mean_pnl': round(statistics.mean(pnls), 6) if pnls else None,",
    "    'median_pnl': round(statistics.median(pnls), 6) if pnls else None,",
    "    'win_rate': round(sum(1 for p in pnls if p > 0) / len(pnls), 4) if pnls else None,",
    '}',
    'trade_stats',
  ].join('\n');
  appendCodeCell(nb, [
    'blocked = []',
    'if not bt:',
    "    blocked.append('latest_backtest.json is missing')",
    'if not trades:',
    "    blocked.append('no trades were recorded')",
    'if len(curve) < 2:',
    "    blocked.append('equity curve is too short to assess shape')",
    "if not summary.get('strategy'):",
    "    blocked.append('strategy name is missing from backtest output')",
    "print_verdict('Backtest analysis', not blocked, blocked or [f\"{summary['trade_count']} trades and {summary['equity_points']} equity points summarised\"], next_step='Use the summary to draft or adjust a strategy YAML' if blocked else 'Only move repeated math into C++ after more than one backtest shows the same shape')",
  ].join('\n'));
  writeNotebook('backtest_analysis.ipynb', nb);
}

buildDataExploration();
buildFeatureImportance();
buildModelTraining();
buildWalkForward();
buildBacktestAnalysis();
