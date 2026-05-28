import React, { useState, useEffect } from 'react';
import { TradeSignal } from '../../types';
import { cn } from '../../lib/utils';
import { Eye, ShieldAlert } from 'lucide-react';
import { API_ENDPOINTS, DEFAULT_HEADERS } from '../../lib/api';

export function SignalPanel() {
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const hydrateSignals = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.SIGNAL, { headers: DEFAULT_HEADERS });
        const data = await res.json();
        if (data.ok && Array.isArray(data.signals)) {
          const normalized = data.signals.map((s: any) => ({
            id: s.signal_id,
            asset: s.symbol,
            model: s.model,
            direction: s.direction.toUpperCase(),
            confidence: s.confidence,
            status: s.promoted ? 'PROMOTED' : 'GATED',
            timestamp: s.as_of,
            evidenceId: s.family || 'N/A'
          }));
          setSignals(normalized);
        }
      } catch (err) {
        console.error('Failed to fetch signals', err);
      } finally {
        setLoading(false);
      }
    };

    hydrateSignals();
  }, []);

  const gatedCount = signals.filter(s => s.status === 'GATED').length;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePromote = async () => {
    if (selectedIds.length === 0 || verifying) return;
    
    setVerifying(true);
    try {
      const res = await fetch(API_ENDPOINTS.SIGNAL + '/promote', {
        method: 'POST',
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ signalIds })
      });
      const data = await res.json();

      if (data.ok) {
        alert(`Waterproof Gate: ${selectedIds.length} signals successfully promoted to live execution.`);
        // Update local state to reflect promotion
        setSignals(prev => prev.map(s => selectedIds.includes(s.id) ? { ...s, status: 'PROMOTED' } : s));
        setSelectedIds([]);
      } else {
        throw new Error(data.error || 'Promotion failed');
      }
    } catch (err: any) {
      console.error('Promotion failed', err);
      alert(`Promotion Failed: ${err.message}`);
    } finally {
      setVerifying(false);
      setHoldProgress(0);
    }
  };

  const startHold = () => {
    if (selectedIds.length === 0 || verifying) return;
    const interval = setInterval(() => {
      setHoldProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          handlePromote();
          return 100;
        }
        return prev + 5;
      });
    }, 100);
    
    const endHold = () => {
      clearInterval(interval);
      setHoldProgress(0);
      window.removeEventListener('mouseup', endHold);
    };
    window.addEventListener('mouseup', endHold);
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col bg-[var(--bg-primary)] animate-in slide-in-from-bottom-2 duration-300">
      
      <div className="p-6 pb-2">
        <h2 className="text-[32px] text-[var(--text-main)] mb-1">Candidate Signal Queue</h2>
        <p className="text-[var(--text-muted)] text-sm mb-6 max-w-2xl">
          Empirically verify path signatures before promoting to the executing matrix. Unverified models are permanently sandboxed.
        </p>
      </div>

      <div className="px-6 flex-1">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden">
          <table className="data-ledger">
            <thead>
              <tr>
                <th className="w-8">
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(signals.map(s => s.id));
                      else setSelectedIds([]);
                    }}
                    checked={selectedIds.length === signals.length && signals.length > 0}
                    className="accent-[var(--color-brand-cyan)] rounded" 
                  />
                </th>
                <th>Asset</th>
                <th>Model</th>
                <th>Direction</th>
                <th className="w-48">Confidence</th>
                <th>Status</th>
                <th className="text-right">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 font-mono text-[10px] text-[var(--text-faint)]">
                    Hydrating from backend matrix...
                  </td>
                </tr>
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 font-mono text-[10px] text-[var(--text-faint)]">
                    No active signals found in current research window.
                  </td>
                </tr>
              ) : signals.map(signal => {
                const isSelected = selectedIds.includes(signal.id);
                return (
                  <tr key={signal.id} className={cn("hover:bg-[var(--bg-primary)] transition-colors group cursor-pointer", isSelected && "bg-[var(--bg-tertiary)]")}>
                    <td onClick={() => toggleSelect(signal.id)}>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => {}}
                        className="accent-[var(--color-brand-cyan)] rounded" 
                      />
                    </td>
                    <td className="font-bold flex flex-col group relative" title="H2V: Binance OHLCV, 5m lag">
                      <span className="border-b border-dashed border-gray-400 w-fit">{signal.asset}</span>
                      <span className="text-[9px] text-[var(--text-faint)] absolute -bottom-3 hidden group-hover:block whitespace-nowrap bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-1 rounded shadow-sm z-10 text-[var(--color-brand-green)]">
                        Waterproof: Verified
                      </span>
                    </td>
                    <td className="text-[var(--color-brand-violet)]">{signal.model}</td>
                    <td>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider",
                        signal.direction === 'LONG' ? "bg-[var(--color-brand-green)]/10 text-[var(--color-brand-green)]" : "bg-[var(--color-brand-red)]/10 text-[var(--color-brand-red)]"
                      )}>
                        {signal.direction}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="block w-8 text-right">{(signal.confidence * 100).toFixed(0)}%</span>
                        <div className="flex-1 h-1 bg-[var(--bg-tertiary)] rounded overflow-hidden">
                          <div 
                            className="h-full bg-[var(--color-brand-violet)] transition-all" 
                            style={{ width: `${signal.confidence * 100}%` }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest border",
                        signal.status === 'GATED' ? "border-[var(--color-brand-amber)] text-[var(--color-brand-amber)]" :
                        signal.status === 'REJECTED' ? "border-[var(--color-brand-red)] text-[var(--color-brand-red)] opacity-50" :
                        "border-[var(--color-brand-green)] text-[var(--color-brand-green)]"
                      )}>
                        {signal.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <button className="inline-flex items-center justify-center gap-1.5 px-2 py-1 text-[10px] border border-[var(--border-focus)] rounded bg-white hover:bg-[var(--bg-tertiary)] hover:border-[var(--color-brand-cyan)] text-[var(--text-main)] transition-colors">
                        <Eye className="w-3 h-3 text-[var(--color-brand-cyan)]" />
                        [VIEW]
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Promotion Gate */}
      <div className="mt-auto bg-white border-t border-[var(--border-subtle)] p-4 flex items-center justify-between shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] z-10 px-6">
        <div className="flex items-center gap-3 text-sm">
          <ShieldAlert className="w-5 h-5 text-[var(--color-brand-amber)]" />
          <span className="font-heading font-bold">{gatedCount} Candidates Pending Review</span>
          <span className="text-[var(--text-muted)] ml-2 text-xs font-mono">({selectedIds.length} Selected)</span>
        </div>
        
        <button 
          onMouseDown={startHold}
          className={cn(
            "relative bg-[var(--color-brand-cyan)] hover:bg-opacity-90 text-white font-heading font-medium tracking-wide uppercase text-xs px-8 py-3 rounded shadow-md transition-all active:scale-95 overflow-hidden",
            (selectedIds.length === 0 || verifying) && "opacity-50 cursor-not-allowed grayscale"
          )}
        >
          <span className="relative z-10">
            {verifying ? '[VERIFYING...]' : `[VERIFY & PROMOTE] (${holdProgress > 0 ? 'HOLDING...' : 'Hold 2s'})`}
          </span>
          {holdProgress > 0 && (
            <div 
              className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-100" 
              style={{ width: `${holdProgress}%` }} 
            />
          )}
        </button>
      </div>

    </div>
  );
}
