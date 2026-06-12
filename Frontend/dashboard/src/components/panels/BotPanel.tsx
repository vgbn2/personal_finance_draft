import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS, DEFAULT_HEADERS } from '../../lib/api';
import { BotState, BotPosition, BotCycleResult } from '../../types';
import { cn } from '../../lib/utils';

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function PnlBadge({ entry, current }: { entry: number; current: number }) {
  const pct = ((current - entry) / entry) * 100;
  const color = pct >= 0 ? 'text-green-400' : 'text-red-400';
  return <span className={cn('font-mono text-xs', color)}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>;
}

export function BotPanel() {
  const [state, setState] = useState<BotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycling, setCycling] = useState(false);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BotCycleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hydrate = async () => {
    try {
      const res  = await fetch(API_ENDPOINTS.BOT_STATUS, { headers: DEFAULT_HEADERS });
      const data = await res.json();
      if (data.ok) setState(data);
      else setError(data.error ?? 'Failed to load bot state');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { hydrate(); }, []);

  const handleRunCycle = async () => {
    setCycling(true);
    setError(null);
    try {
      const res  = await fetch(API_ENDPOINTS.BOT_CYCLE, {
        method:  'POST',
        headers: DEFAULT_HEADERS,
        body:    JSON.stringify({ live: state?.config.liveTrading ? 'true' : 'false' }),
      });
      const data = await res.json();
      if (data.cycleId) setLastResult(data);
      else setError(data.error ?? 'Cycle failed');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCycling(false);
      await hydrate();
    }
  };

  const handleForceSell = async (pos: BotPosition) => {
    setSellingId(pos.positionId);
    setError(null);
    try {
      const res  = await fetch(API_ENDPOINTS.BOT_SELL, {
        method:  'POST',
        headers: DEFAULT_HEADERS,
        body:    JSON.stringify({ position_id: pos.positionId }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? 'Sell failed');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSellingId(null);
      await hydrate();
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] font-mono text-sm animate-pulse">
        Loading bot state...
      </div>
    );
  }

  const cfg = state?.config;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-heading font-bold text-xl text-[var(--text-main)]">Edge Trader Bot</h2>
          <span className={cn(
            'text-xs font-mono px-2 py-0.5 rounded-full border',
            cfg?.enabled
              ? 'bg-green-950/30 border-green-500/40 text-green-400'
              : 'bg-slate-800/50 border-slate-600 text-slate-400'
          )}>
            {cfg?.enabled ? 'ENABLED' : 'DISABLED'}
          </span>
          {cfg?.liveTrading && (
            <span className="text-xs font-mono px-2 py-0.5 rounded-full border bg-amber-950/30 border-amber-500/40 text-amber-400 animate-pulse">
              LIVE TRADING
            </span>
          )}
        </div>
        <button
          onClick={handleRunCycle}
          disabled={cycling}
          className={cn(
            'px-4 py-1.5 rounded border text-sm font-medium transition-colors',
            cycling
              ? 'border-slate-600 text-slate-500 cursor-not-allowed'
              : 'border-[var(--color-brand-cyan)] text-[var(--color-brand-cyan)] hover:bg-[var(--color-brand-cyan)]/10'
          )}
        >
          {cycling ? '⟳ Running...' : '▶ Run Cycle'}
        </button>
      </div>

      {error && (
        <div className="text-xs font-mono text-red-400 bg-red-950/20 border border-red-500/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Balance (pUSD)', value: cfg ? `$${(state?.balance ?? 0).toFixed(2)}` : '—' },
          { label: 'Open Positions', value: `${state?.positions.length ?? 0} / ${cfg?.maxPositions ?? 0}` },
          { label: 'Last Cycle', value: state?.lastCycleAt ? new Date(state.lastCycleAt).toLocaleTimeString() : 'never' },
          { label: 'Mode', value: cfg?.liveTrading ? 'LIVE' : 'DRY-RUN' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-3">
            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1">{label}</div>
            <div className="font-mono text-sm text-[var(--text-main)]">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Last cycle result ── */}
      {lastResult && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4 text-xs font-mono space-y-1">
          <div className="text-[var(--color-brand-cyan)] font-bold mb-2">Last Cycle Result</div>
          <div>Sold: <span className="text-green-400">{lastResult.sellsExecuted}</span>  Bought: <span className="text-green-400">{lastResult.buysFilled}</span>  Dry-run: {lastResult.dryRun ? 'yes' : 'no'}</div>
          {lastResult.errors.length > 0 && (
            <div className="text-red-400">{lastResult.errors.join(' | ')}</div>
          )}
        </div>
      )}

      {/* ── Open positions ── */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-[var(--border-subtle)] text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
          Open Positions ({state?.positions.length ?? 0})
        </div>
        {!state?.positions.length ? (
          <div className="px-4 py-6 text-center text-[var(--text-muted)] text-sm">No open positions</div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                {['Market', 'Side', 'Entry', 'Target', 'Stop', 'AI%', 'Age', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state?.positions.map((pos) => (
                <tr key={pos.positionId} className="border-b border-[var(--border-subtle)]/50 hover:bg-[var(--bg-tertiary)] transition-colors">
                  <td className="px-3 py-2 max-w-[160px] truncate text-[var(--text-main)]" title={pos.slug}>{pos.slug}</td>
                  <td className={cn('px-3 py-2 font-bold', pos.side === 'YES' ? 'text-green-400' : 'text-red-400')}>{pos.side}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{pos.fillPrice.toFixed(3)}</td>
                  <td className="px-3 py-2 text-cyan-400">{pos.targetPrice.toFixed(3)}</td>
                  <td className="px-3 py-2 text-red-400">{pos.stopPrice.toFixed(3)}</td>
                  <td className="px-3 py-2">{(pos.aiProbabilityAtEntry * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{formatAge(pos.entryTimestamp)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleForceSell(pos)}
                      disabled={sellingId === pos.positionId}
                      className="px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-950/20 transition-colors disabled:opacity-40"
                    >
                      {sellingId === pos.positionId ? '...' : 'Sell'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Cycle history ── */}
      {(state?.cycleHistory.length ?? 0) > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-[var(--border-subtle)] text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
            Cycle History (last 10)
          </div>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                {['Time', 'Sold', 'Bought', 'Errors', 'Mode'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state?.cycleHistory.slice(0, 10).map((c) => (
                <tr key={c.cycleId} className="border-b border-[var(--border-subtle)]/50">
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">{new Date(c.startedAt).toLocaleTimeString()}</td>
                  <td className="px-3 py-1.5 text-green-400">{c.sellsExecuted}</td>
                  <td className="px-3 py-1.5 text-cyan-400">{c.buysFilled}</td>
                  <td className={cn('px-3 py-1.5', c.errors.length > 0 ? 'text-red-400' : 'text-[var(--text-muted)]')}>{c.errors.length}</td>
                  <td className={cn('px-3 py-1.5', c.dryRun ? 'text-slate-400' : 'text-amber-400')}>{c.dryRun ? 'dry' : 'live'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Config summary ── */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg p-4">
        <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-3">Config</div>
        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
          {cfg && Object.entries({
            'Min Edge':      `${((cfg.minEdgeThreshold ?? 0) * 100).toFixed(0)}%`,
            'Bet Size':      `$${cfg.positionSizeUsdc}`,
            'Max Positions': cfg.maxPositions,
            'Stop Loss':     `${((cfg.stopLossPct ?? 0) * 100).toFixed(0)}%`,
            'Capture Ratio': `${((cfg.edgeCaptureRatio ?? 0) * 100).toFixed(0)}%`,
            'Interval':      `${cfg.intervalMinutes}min`,
          }).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">{k}</span>
              <span className="text-[var(--text-main)]">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mt-3 font-mono">
          To change config: <code>node sovereign_cli.js bot config --key minEdgeThreshold --value 0.08</code>
        </p>
      </div>

    </div>
  );
}
