import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { MetricTileData } from '../../types';
import { Terminal, ShieldCheck, Activity, AlertTriangle, Zap } from 'lucide-react';
import { API_ENDPOINTS, DEFAULT_HEADERS } from '../../lib/api';
import { subscribeToOrders } from '../../lib/supabase';

const METRICS: MetricTileData[] = [
  { label: 'Backend Status', value: '...', status: 'cyan', subtext: 'Connecting...' },
  { label: 'Kill Switch', value: '...', status: 'green', subtext: 'Monitoring...' },
  { label: 'Active Signals', value: '...', status: 'violet', subtext: 'Analyzing...' },
  { label: 'Quote Health', value: '...', status: 'amber', subtext: 'Checking...' },
];

export function OverviewPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<MetricTileData[]>(METRICS);
  const [correlation, setCorrelation] = useState<any>(null);

  useEffect(() => {
    const hydrateSystem = async () => {
      try {
        const [sysRes, killRes, signalRes] = await Promise.all([
          fetch(API_ENDPOINTS.SYSTEM_STATUS, { headers: DEFAULT_HEADERS }),
          fetch(API_ENDPOINTS.KILL_SWITCH, { headers: DEFAULT_HEADERS }),
          fetch(API_ENDPOINTS.SIGNAL, { headers: DEFAULT_HEADERS })
        ]);
        
        const data = await sysRes.json();
        const killData = await killRes.json();
        const signalData = await signalRes.json();
        
        if (data.ok) {
          setMetrics([
            { label: 'Backend Status', value: data.components.backend.available ? 'OK' : 'OFFLINE', status: data.components.backend.available ? 'cyan' : 'red', subtext: data.components.backend.type || 'N/A' },
            { 
              label: 'Kill Switch', 
              value: killData.ok ? (killData.status === 'engaged' ? 'TRIPPED' : 'NOMINAL') : 'UNKNOWN', 
              status: killData.ok ? (killData.status === 'engaged' ? 'red' : 'green') : 'amber', 
              subtext: killData.ok ? (killData.status === 'engaged' ? 'Breach Detected' : 'No Breaches') : 'Checking...' 
            },
            { 
              label: 'Active Signals', 
              value: signalData.ok ? String(signalData.active_signals || 0) : '...', 
              status: 'violet', 
              subtext: signalData.ok ? `${signalData.candidate_signals || 0} Candidates` : 'Analyzing...' 
            },
            { label: 'Quote Health', value: data.components.quotes.ok ? 'HEALTHY' : 'STALE', status: data.components.quotes.ok ? 'cyan' : 'amber', subtext: `${data.components.quotes.providers.length} providers` },
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch system status', err);
      }
    };

    const hydrateCorrelation = async () => {
      try {
        const assets = 'AAPL,MSFT,TSLA,NVDA,BTCUSDT,ETHUSDT,XAUUSD,BRENT,EURUSD';
        const res = await fetch(`${API_ENDPOINTS.CORRELATION}?symbols=${assets}&max_bars=120`, { headers: DEFAULT_HEADERS });
        const data = await res.json();
        if (data.ok) {
          setCorrelation(data);
        }
      } catch (err) {
        console.error('Failed to fetch correlation', err);
      }
    };
    
    hydrateSystem();
    hydrateCorrelation();

    // Initial logs
    setLogs([
      '[SYS] Initializing Sovereign Kernel v1.5.0...',
      '[DATA] Hydrating local cache from snapshot...',
      '[SECURITY] Real-time persistence active via Supabase.',
      '[OK] Dashboard connected to backend on port 8787.',
    ]);

    // REAL-TIME SUBSCRIPTION
    const unsubscribe = subscribeToOrders((payload) => {
      const order = payload.new;
      const timestamp = new Date(order.timestamp).toLocaleTimeString();
      const statusColor = order.status === 'filled' ? 'OK' : 
                          order.status === 'risk_rejected' ? 'SECURITY' : 
                          order.status === 'failed' ? 'WARN' : 'INFO';
      
      const logLine = `[${statusColor}] ${order.side.toUpperCase()} ${order.quantity} ${order.instrument_id} (Status: ${order.status.toUpperCase()})`;
      setLogs(prev => [...prev.slice(-100), logLine]);

      if (order.status === 'risk_rejected') {
        setMetrics(prev => prev.map(m => 
          m.label === 'Kill Switch' ? { ...m, value: 'TRIPPED', status: 'red', subtext: 'Breach Detected' } : m
        ));
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">
      
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((metric, idx) => {
          const colorMap = {
            cyan: 'var(--color-brand-cyan)',
            green: 'var(--color-brand-green)',
            violet: 'var(--color-brand-violet)',
            amber: 'var(--color-brand-amber)',
            red: 'var(--color-brand-red)'
          };
          
          return (
            <div key={idx} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-5 rounded-xl flex flex-col gap-1 relative overflow-hidden group hover:border-[var(--border-focus)] transition-colors shadow-sm">
              <div 
                className="absolute left-0 top-0 bottom-0 w-[3px]" 
                style={{ backgroundColor: colorMap[metric.status] }} 
              />
              <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{metric.label}</span>
              <span className="font-mono text-xl text-[var(--text-main)] font-semibold tracking-tight">{metric.value}</span>
              {metric.subtext && (
                <span className="font-mono text-[10px] text-[var(--text-faint)]">{metric.subtext}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-12 gap-6 h-[400px]">
        {/* Terminal Card (65% ~ col-span-8) */}
        <div className="col-span-8 bg-slate-900 border border-slate-800 rounded-xl relative flex flex-col overflow-hidden shadow-sm">
          <div className="h-10 border-b border-slate-800 flex items-center px-5 gap-3 bg-slate-800/50 shrink-0">
             <ShieldCheck className="w-4 h-4 text-[var(--color-brand-green)]" />
             <span className="font-mono text-[10px] text-slate-400 tracking-widest uppercase">Secured Log Stream [ENCRYPTED]</span>
             <div className="ml-auto w-2 h-2 rounded-full bg-[var(--color-brand-cyan)] animate-pulse shadow-[0_0_8px_var(--color-brand-cyan)]" />
          </div>
          <div className="flex-1 p-5 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-slate-500 shrink-0">[{new Date().toISOString().split('T')[1].slice(0, -1)}]</span>
                <span className={log?.includes('OK') ? 'text-[var(--color-brand-green)]' : 
                               log?.includes('WARN') ? 'text-[var(--color-brand-amber)]' : 
                               log?.includes('MODEL') ? 'text-[var(--color-brand-violet)]' : 
                               log?.includes('SECURITY') ? 'text-[var(--color-brand-cyan)]' : ''}>
                  {log}
                </span>
              </div>
            ))}
            <div className="w-2 h-4 bg-slate-500 animate-pulse mt-1 inline-block" />
          </div>
        </div>

        {/* Correlation Heatmap (35% ~ col-span-4) */}
        <div className="col-span-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl flex flex-col shadow-sm">
          <div className="h-10 border-b border-[var(--border-subtle)] flex items-center px-5 shrink-0 bg-[var(--bg-primary)]">
             <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">Live Correlation</span>
          </div>
          <div className="flex-1 p-4 flex flex-col h-full overflow-hidden">
            {correlation ? (
              <div className="flex-1 grid grid-cols-10 gap-1 h-full font-mono text-[7px] text-[var(--text-muted)] text-center">
                <div className="col-span-10 grid grid-cols-10 gap-1 mb-1">
                  <div></div>
                  {correlation.labels.map(a => <div key={a} className="flex items-center justify-center truncate">{a}</div>)}
                </div>
                
                {correlation.labels.map((assetRow, r) => (
                  <React.Fragment key={assetRow}>
                    <div className="flex items-center justify-end pr-2 truncate">{assetRow}</div>
                    {correlation.labels.map((assetCol, c) => {
                      const val = correlation.values[r][c];
                      
                      const red = val < 0 ? Math.floor(Math.abs(val) * 255) : 243;
                      const green = val > 0 ? Math.floor(Math.abs(val) * 200 + 55) : 244;
                      const blue = val < 0 ? Math.floor(Math.abs(val) * 255) : 246;
                      
                      const bg = r === c ? 'var(--color-brand-green)' : `rgb(${red}, ${green}, ${blue})`;
                      const opacity = r === c ? 0.8 : Math.max(0.2, Math.abs(val));

                      return (
                        <div 
                          key={`${r}-${c}`} 
                          className="w-full aspect-square relative flex items-center justify-center rounded-[1px] transition-all hover:scale-110 hover:z-10 hover:shadow-lg cursor-crosshair" 
                          style={{ backgroundColor: bg, opacity }}
                        >
                          <span className="font-mono text-[8px] text-black font-bold pointer-events-none tracking-tighter">
                            {val.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center font-mono text-[10px] text-[var(--text-faint)]">
                Fetching Pearson matrix...
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
