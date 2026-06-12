import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { API_ENDPOINTS, DEFAULT_HEADERS } from '../../lib/api';

const POLL_INTERVAL_MS = 30_000;
const SYMBOLS = ['AAPL', 'BTC', 'ETH', 'SPY', 'QQQ', 'MSFT', 'NVDA'];
const TIMEFRAMES = ['1d', '1h', '15m'];

interface BandPoint {
  t: string;
  close: number;
  upper: number;
  middle: number;
  lower: number;
}

interface Current {
  close: number;
  change_pct: number;
  upper: number;
  middle: number;
  lower: number;
  bandwidth_pct: number;
  position: number;
}

interface Prediction {
  direction: 'long' | 'short' | 'neutral';
  confidence: number;
  reason: string;
  sigma?: number;
}

interface SigmaBandData {
  ok: boolean;
  symbol: string;
  timeframe: string;
  period: number;
  bars_used: number;
  fetched_at: string;
  current: Current;
  prediction: Prediction;
  series: BandPoint[];
  error?: string;
}

function directionColor(direction: string) {
  if (direction === 'long') return 'var(--color-brand-green, #22c55e)';
  if (direction === 'short') return '#ef4444';
  return 'var(--text-muted, #94a3b8)';
}

function positionLabel(pos: number) {
  if (pos > 0.95) return 'Overbought';
  if (pos < 0.05) return 'Oversold';
  if (pos > 0.6) return 'Upper Zone';
  if (pos < 0.4) return 'Lower Zone';
  return 'Mid Zone';
}

function formatTs(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return ts.slice(0, 10);
  }
}

function PositionBar({ position }: { position: number }) {
  const pct = Math.round(position * 100);
  return (
    <div className="relative w-full h-3 rounded-full bg-slate-700 overflow-hidden">
      <div className="absolute inset-y-0 left-0 right-0 flex">
        <div className="flex-1 bg-emerald-950/40" />
        <div className="w-px bg-slate-500" />
        <div className="flex-1 bg-red-950/40" />
      </div>
      <div
        className="absolute top-0 h-full w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_var(--color-brand-cyan,#22d3ee)] transition-all duration-500"
        style={{ left: `calc(${pct}% - 3px)` }}
      />
    </div>
  );
}

export function SigmaBandPanel() {
  const [symbol, setSymbol] = useState('AAPL');
  const [timeframe, setTimeframe] = useState('1d');
  const [period, setPeriod] = useState(20);
  const [data, setData] = useState<SigmaBandData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(API_ENDPOINTS.SIGMA_BAND);
      url.searchParams.set('symbol', symbol);
      url.searchParams.set('timeframe', timeframe);
      url.searchParams.set('period', String(period));
      const res = await globalThis.fetch(url.toString(), { headers: DEFAULT_HEADERS });
      const json = await res.json() as SigmaBandData;
      setData(json);
      setLastFetch(new Date());
      if (!json.ok) setError(json.error ?? 'Unknown error');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, period]);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch]);

  const chartData = data?.series?.map(p => ({
    label: formatTs(p.t),
    close: p.close,
    upper: p.upper,
    middle: p.middle,
    lower: p.lower,
    band: [p.lower, p.upper],
  })) ?? [];

  const pred = data?.prediction;
  const cur = data?.current;

  return (
    <div className="flex-1 overflow-auto p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-heading font-bold text-[var(--text-main)] tracking-tight">
            Sigma Band <span className="text-[var(--color-brand-cyan)] font-normal">Visualizer</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
            Bollinger band position · live poll every 30s
            {lastFetch && ` · updated ${lastFetch.toLocaleTimeString()}`}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {loading && (
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={timeframe}
            onChange={e => setTimeframe(e.target.value)}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] text-xs font-mono rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500"
          >
            {[10, 14, 20, 50].map(p => <option key={p} value={p}>BB{p}</option>)}
          </select>
          <button
            onClick={fetch}
            className="px-3 py-1.5 text-xs font-mono border border-[var(--border-subtle)] rounded hover:border-cyan-500 hover:text-cyan-400 transition-colors text-[var(--text-muted)]"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded border border-red-500/30 bg-red-950/20 text-red-400 text-xs font-mono">
          {error}
        </div>
      )}

      {data?.ok && cur && pred && (
        <>
          {/* Metric tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
              <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1">Current Price</div>
              <div className="text-xl font-mono font-bold text-[var(--text-main)]">
                {cur.close.toFixed(2)}
              </div>
              <div className={`text-xs font-mono mt-1 ${cur.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {cur.change_pct >= 0 ? '▲' : '▼'} {(Math.abs(cur.change_pct) * 100).toFixed(2)}%
              </div>
            </div>

            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
              <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1">Band Position</div>
              <div className="text-xl font-mono font-bold" style={{ color: directionColor(pred.direction) }}>
                {positionLabel(cur.position)}
              </div>
              <div className="mt-2">
                <PositionBar position={cur.position} />
                <div className="flex justify-between text-[9px] font-mono text-[var(--text-muted)] mt-1">
                  <span>Lower</span><span>Mid</span><span>Upper</span>
                </div>
              </div>
            </div>

            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
              <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1">Prediction</div>
              <div className="text-xl font-mono font-bold uppercase" style={{ color: directionColor(pred.direction) }}>
                {pred.direction}
              </div>
              <div className="text-xs font-mono text-[var(--text-muted)] mt-1">
                {(pred.confidence * 100).toFixed(0)}% confidence
              </div>
              <div className="text-[9px] font-mono text-[var(--text-muted)] mt-0.5 truncate" title={pred.reason}>
                {pred.reason.replace(/_/g, ' ')}
              </div>
            </div>

            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
              <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1">Bandwidth</div>
              <div className="text-xl font-mono font-bold text-[var(--text-main)]">
                {(cur.bandwidth_pct * 100).toFixed(1)}%
              </div>
              <div className="text-xs font-mono text-[var(--text-muted)] mt-1">
                ↑ {cur.upper.toFixed(2)} · ↓ {cur.lower.toFixed(2)}
              </div>
              <div className="text-[9px] font-mono text-[var(--text-muted)] mt-0.5">
                {data.bars_used} bars · BB{data.period}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-4">
              {symbol} · {timeframe} · Bollinger Band (BB{period})
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary, #1e293b)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace', color: '#64748b' }} />

                {/* Band fill: range area between lower and upper */}
                <Area
                  dataKey="band"
                  stroke="transparent"
                  fill="rgba(34,211,238,0.07)"
                  fillOpacity={1}
                  legendType="none"
                  name="Band"
                  isAnimationActive={false}
                />

                {/* Band lines */}
                <Line dataKey="upper" stroke="#22d3ee" strokeWidth={1} dot={false} strokeDasharray="4 2" name="Upper Band" isAnimationActive={false} />
                <Line dataKey="middle" stroke="#64748b" strokeWidth={1} dot={false} strokeDasharray="2 2" name="Middle (SMA)" isAnimationActive={false} />
                <Line dataKey="lower" stroke="#22d3ee" strokeWidth={1} dot={false} strokeDasharray="4 2" name="Lower Band" isAnimationActive={false} />

                {/* Price */}
                <Line dataKey="close" stroke="#f8fafc" strokeWidth={2} dot={false} name="Close" isAnimationActive={false} />

                {/* Current price reference */}
                {cur && (
                  <ReferenceLine
                    y={cur.close}
                    stroke={directionColor(pred.direction)}
                    strokeDasharray="6 3"
                    strokeWidth={1.5}
                    label={{ value: cur.close.toFixed(2), position: 'right', fill: directionColor(pred.direction), fontSize: 10, fontFamily: 'monospace' }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div className="flex items-center justify-center h-48 text-[var(--text-muted)] font-mono text-sm">
          Select a symbol to load sigma band data
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-48 text-[var(--text-muted)] font-mono text-sm animate-pulse">
          Fetching live data...
        </div>
      )}
    </div>
  );
}
