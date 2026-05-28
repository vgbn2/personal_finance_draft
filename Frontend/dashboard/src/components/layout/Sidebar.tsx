import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { API_ENDPOINTS, DEFAULT_HEADERS } from '../../lib/api';

export function Sidebar() {
  const [timeframe, setTimeframe] = useState('1h');
  const [model, setModel] = useState('XGBoost Ranker');
  const [universe, setUniverse] = useState<any[]>([]);

  useEffect(() => {
    const hydrateUniverse = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.UNIVERSE, { headers: DEFAULT_HEADERS });
        const data = await res.json();
        if (data.ok && Array.isArray(data.entries)) {
          setUniverse(data.entries);
        }
      } catch (err) {
        console.error('Failed to fetch universe', err);
      }
    };

    hydrateUniverse();
  }, []);
  
  return (
    <aside className="w-[260px] bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] overflow-y-auto h-full flex flex-col p-4 shrink-0">
      
      {/* Pillar 1: Data Ingestion */}
      <div className="sb-section">
        <h3 className="font-heading text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-3 flex items-center gap-2">
          <span>Data Ingestion</span>
        </h3>
        
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Timeframe</label>
            <div className="grid grid-cols-3 gap-1">
              {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={cn(
                    "text-xs font-mono py-1 rounded-md transition-colors",
                    timeframe === tf 
                      ? "bg-[var(--bg-tertiary)] border border-[var(--border-focus)] text-[var(--text-main)]" 
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-primary)] border border-transparent"
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Asset Universe</label>
            <select className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm rounded-md p-1.5 font-mono text-[10px]">
              {universe.length > 0 && (
                <optgroup label="Cached Symbols">
                  {universe.slice(0, 10).map(u => <option key={u.symbol}>{u.symbol}</option>)}
                </optgroup>
              )}
              <optgroup label="Stocks (Mag 7)">
                <option>AAPL</option>
                <option>MSFT</option>
                <option>TSLA</option>
                <option>NVDA</option>
                <option>AMD</option>
                <option>META</option>
                <option>GOOGL</option>
              </optgroup>
              <optgroup label="FX Pairs">
                <option>EURUSD</option>
                <option>GBPUSD</option>
                <option>USDJPY</option>
                <option>AUDUSD</option>
                <option>USDCAD</option>
              </optgroup>
              <optgroup label="Commodities">
                <option>XAUUSD (Gold)</option>
                <option>XAGUSD (Silver)</option>
                <option>Brent Oil</option>
                <option>WTI Crude</option>
              </optgroup>
              <optgroup label="Crypto">
                <option>BTCUSDT</option>
                <option>ETHUSDT</option>
                <option>SOLUSDT</option>
              </optgroup>
            </select>
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button className="text-[9px] font-mono py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-primary)]">Tech Giants</button>
              <button className="text-[9px] font-mono py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-primary)]">Major FX</button>
              <button className="text-[9px] font-mono py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-primary)]">Hard Cmdt</button>
              <button className="text-[9px] font-mono py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-primary)]">Full Univ</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)] flex justify-between">
              <span>History Depth</span>
              <span className="font-mono">5000 bars</span>
            </label>
            <input type="range" min="120" max="10000" defaultValue="5000" className="w-full accent-[var(--color-brand-cyan)]" />
          </div>
        </div>
      </div>

      {/* Pillar 2: Intelligence Engine */}
      <div className="sb-section model">
        <h3 className="font-heading text-xs font-bold text-[var(--color-brand-violet)] uppercase tracking-wider mb-3">
          Intelligence Engine
        </h3>
        
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Active Model</label>
            <select 
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm rounded-md p-1.5 font-mono text-[10px]"
            >
              <option>CNN Window v0</option>
              <option>XGBoost Ranker</option>
              <option>SVM Margin</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)] flex justify-between">
              <span>Confidence Gate</span>
              <span className="font-mono">0.65</span>
            </label>
            <input type="range" min="0" max="100" defaultValue="65" className="w-full accent-[var(--color-brand-violet)]" />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)] flex justify-between">
              <span>Inference Horizon</span>
              <span className="font-mono">10 bars</span>
            </label>
            <input type="range" min="1" max="20" defaultValue="10" className="w-full accent-[var(--color-brand-violet)]" />
          </div>
        </div>
      </div>

      {/* Pillar 3: Macro Regime */}
      <div className="sb-section macro">
        <h3 className="font-heading text-xs font-bold text-[var(--color-brand-amber)] uppercase tracking-wider mb-3">
          Macro Regime
        </h3>
        
        <div className="space-y-3">
           <label className="flex items-center gap-2 cursor-pointer">
             <input type="checkbox" defaultChecked className="accent-[var(--color-brand-amber)] rounded" />
             <span className="text-xs font-mono">FRED</span>
           </label>
           <label className="flex items-center gap-2 cursor-pointer">
             <input type="checkbox" defaultChecked className="accent-[var(--color-brand-amber)] rounded" />
             <span className="text-xs font-mono">World Bank</span>
           </label>
           <label className="flex items-center gap-2 cursor-pointer">
             <input type="checkbox" className="accent-[var(--color-brand-amber)] rounded" />
             <span className="text-xs font-mono">Kalshi</span>
           </label>

           <div className="pt-2 space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Regime Mode</label>
            <select className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm rounded-md p-1.5 font-mono text-[10px]">
              <option>Path-Signature Optimized</option>
              <option>Macro-Aware</option>
              <option>Baseline</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pillar 4: Risk & Execution */}
      <div className="sb-section risk !mb-4">
        <h3 className="font-heading text-xs font-bold text-[var(--color-brand-red)] uppercase tracking-wider mb-3">
          Risk & Execution
        </h3>
        
        <div className="space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs font-medium text-[var(--text-main)]">Circuit Breakers</span>
            <div className="relative inline-block w-8 h-4 bg-[var(--color-brand-red)] rounded-full transition-colors">
              <span className="absolute right-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform"></span>
            </div>
          </label>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)] flex justify-between">
              <span>Max Drawdown</span>
              <span className="font-mono">5%</span>
            </label>
            <input type="range" min="1" max="15" defaultValue="5" className="w-full accent-[var(--color-brand-red)]" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-muted)]">Execution Mode</label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="execution" className="accent-[var(--color-brand-red)]" />
                <span className="text-xs">Simulation</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="execution" defaultChecked className="accent-[var(--color-brand-red)]" />
                <span className="text-xs">Paper</span>
              </label>
              <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                <input type="radio" name="execution" disabled className="accent-[var(--color-brand-red)]" />
                <span className="text-xs line-through">[DISABLED] Live</span>
              </label>
            </div>
          </div>
        </div>
      </div>

    </aside>
  );
}
