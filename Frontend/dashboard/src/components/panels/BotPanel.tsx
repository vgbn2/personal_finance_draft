import React, { useState, useEffect } from 'react';
import { API_ENDPOINTS, getAuthHeaders } from '../../lib/api';
import { BotState, BotPosition, BotCycleResult } from '../../types';
import { cn } from '../../lib/utils';

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
      const res  = await fetch(API_ENDPOINTS.BOT_STATUS, { headers: await getAuthHeaders() });
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
        headers: await getAuthHeaders(),
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
        headers: await getAuthHeaders(),
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
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] font-mono text-xs animate-pulse">
        Loading Sovereign Execution State...
      </div>
    );
  }

  const cfg = state?.config;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="font-heading font-bold text-xl text-[var(--text-main)] flex items-center gap-2">
            <span>Sovereign Execution Engine</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-brand-cyan)]/10 border border-[var(--color-brand-cyan)]/30 text-[var(--color-brand-cyan)] font-semibold uppercase tracking-wider">
              Dark Cyber-Fintech
            </span>
          </h2>
          <span className={cn(
            'text-[10px] font-mono px-2 py-0.5 rounded border font-semibold tracking-wider',
            cfg?.enabled
              ? 'bg-[var(--color-brand-green)]/10 border-[var(--color-brand-green)]/40 text-[var(--color-brand-green)]'
              : 'bg-slate-900/60 border-slate-700 text-slate-400'
          )}>
            {cfg?.enabled ? 'ACTIVE' : 'DISABLED'}
          </span>
          {cfg?.liveTrading && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-[var(--color-brand-red)]/10 border-[var(--color-brand-red)]/40 text-[var(--color-brand-red)] animate-pulse font-semibold">
              LIVE AUTHORIZED
            </span>
          )}
        </div>
        <button
          onClick={handleRunCycle}
          disabled={cycling}
          className={cn(
            'px-4 py-1.5 rounded border text-xs font-mono font-semibold transition-all shadow-sm cursor-pointer',
            cycling
              ? 'border-slate-700 text-slate-500 bg-slate-900/50 cursor-not-allowed'
              : 'border-[var(--color-brand-cyan)]/50 text-[var(--color-brand-cyan)] bg-[var(--color-brand-cyan)]/10 hover:bg-[var(--color-brand-cyan)]/20 hover:border-[var(--color-brand-cyan)]'
          )}
        >
          {cycling ? '⟳ Running Automation Cycle...' : '▶ Trigger Instant Pass'}
        </button>
      </div>

      {error && (
        <div className="text-xs font-mono text-[var(--color-brand-red)] bg-[var(--color-brand-red)]/10 border border-[var(--color-brand-red)]/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Balance (pUSD)', value: cfg ? `$${(state?.balance ?? 0).toFixed(2)}` : '—', color: 'var(--color-brand-cyan)' },
          { label: 'Open Positions', value: `${state?.positions.length ?? 0} / ${cfg?.maxPositions ?? 0}`, color: 'var(--color-brand-violet)' },
          { label: 'Last Cycle', value: state?.lastCycleAt ? new Date(state.lastCycleAt).toLocaleTimeString() : 'never', color: 'var(--color-brand-amber)' },
          { label: 'Execution Mode', value: cfg?.liveTrading ? 'LIVE' : 'DRY-RUN', color: cfg?.liveTrading ? 'var(--color-brand-red)' : 'var(--color-brand-green)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 relative overflow-hidden shadow-sm">
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }} />
            <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-1">{label}</div>
            <div className="font-mono text-lg text-[var(--text-main)] font-semibold tracking-tight">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Last cycle result ── */}
      {lastResult && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 text-xs font-mono space-y-1 shadow-sm">
          <div className="text-[var(--color-brand-cyan)] font-bold mb-1 uppercase tracking-wider">Last Cycle Result</div>
          <div>Sold: <span className="text-[var(--color-brand-green)]">{lastResult.sellsExecuted}</span> | Bought: <span className="text-[var(--color-brand-cyan)]">{lastResult.buysFilled}</span> | Dry-run: {lastResult.dryRun ? 'yes' : 'no'}</div>
          {lastResult.errors.length > 0 && (
            <div className="text-[var(--color-brand-red)]">{lastResult.errors.join(' | ')}</div>
          )}
        </div>
      )}

      {/* ── Open positions ── */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest flex items-center justify-between">
          <span>Open Positions ({state?.positions.length ?? 0})</span>
          <span className="text-[10px] text-[var(--text-faint)]">Target Edge Execution</span>
        </div>
        {!state?.positions.length ? (
          <div className="px-4 py-8 text-center text-[var(--text-muted)] font-mono text-xs">No active positions in current engine cycle</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--bg-primary)]">
                  {['Market', 'Side', 'Entry', 'Target', 'Stop', 'AI Prob', 'Age', 'Action'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase text-[10px] tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state?.positions.map((pos) => (
                  <tr key={pos.positionId} className="hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2.5 max-w-[200px] truncate text-[var(--text-main)] font-medium" title={pos.slug}>{pos.slug}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider',
                        pos.side === 'YES' ? 'bg-[var(--color-brand-green)]/10 text-[var(--color-brand-green)]' : 'bg-[var(--color-brand-red)]/10 text-[var(--color-brand-red)]'
                      )}>
                        {pos.side}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)] font-mono">{pos.fillPrice.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-brand-cyan)] font-mono">{pos.targetPrice.toFixed(3)}</td>
                    <td className="px-4 py-2.5 text-[var(--color-brand-red)] font-mono">{pos.stopPrice.toFixed(3)}</td>
                    <td className="px-4 py-2.5 font-mono">{(pos.aiProbabilityAtEntry * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)] font-mono">{formatAge(pos.entryTimestamp)}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleForceSell(pos)}
                        disabled={sellingId === pos.positionId}
                        className="px-2.5 py-1 rounded border border-[var(--color-brand-red)]/40 text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/20 transition-colors disabled:opacity-40 font-mono text-[10px] cursor-pointer"
                      >
                        {sellingId === pos.positionId ? '...' : 'Sell'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Cycle history ── */}
      {(state?.cycleHistory.length ?? 0) > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">
            Cycle Execution Audit (Last 10 Pass Logs)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--bg-primary)]">
                  {['Timestamp', 'Sells', 'Buys', 'Errors', 'Mode'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase text-[10px] tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {state?.cycleHistory.slice(0, 10).map((c) => (
                  <tr key={c.cycleId} className="hover:bg-[var(--bg-tertiary)] transition-colors">
                    <td className="px-4 py-2 text-[var(--text-muted)] font-mono">{new Date(c.startedAt).toLocaleTimeString()}</td>
                    <td className="px-4 py-2 text-[var(--color-brand-green)] font-mono">{c.sellsExecuted}</td>
                    <td className="px-4 py-2 text-[var(--color-brand-cyan)] font-mono">{c.buysFilled}</td>
                    <td className={cn('px-4 py-2 font-mono', c.errors.length > 0 ? 'text-[var(--color-brand-red)]' : 'text-[var(--text-muted)]')}>{c.errors.length}</td>
                    <td className="px-4 py-2">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase',
                        c.dryRun ? 'bg-slate-800 text-slate-400' : 'bg-[var(--color-brand-amber)]/10 text-[var(--color-brand-amber)]'
                      )}>
                        {c.dryRun ? 'dry' : 'live'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Config summary ── */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-4 shadow-sm">
        <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest mb-3">Bot Parameter Matrix</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          {cfg && Object.entries({
            'Min Edge Floor':   `${((cfg.minEdgeThreshold ?? 0) * 100).toFixed(0)}%`,
            'Bet Size (USDC)': `$${cfg.positionSizeUsdc}`,
            'Max Positions':   cfg.maxPositions,
            'Stop Loss Floor': `${((cfg.stopLossPct ?? 0) * 100).toFixed(0)}%`,
            'Capture Ratio':   `${((cfg.edgeCaptureRatio ?? 0) * 100).toFixed(0)}%`,
            'Cycle Interval':  `${cfg.intervalMinutes} min`,
          }).map(([k, v]) => (
            <div key={k} className="flex justify-between items-center p-2 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-muted)]">{k}</span>
              <span className="text-[var(--text-main)] font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
