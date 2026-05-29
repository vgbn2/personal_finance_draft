import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Database, ShieldAlert, Activity, CheckCircle, RefreshCw } from 'lucide-react';
import { API_ENDPOINTS, DEFAULT_HEADERS } from '../../lib/api';

export function QuoteHealthPanel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.SYSTEM_STATUS, { headers: DEFAULT_HEADERS });
      const statusData = await res.json();
      if (statusData.ok || statusData.components) {
        setData(statusData.components.quotes);
      }
    } catch (err) {
      console.error('Failed to fetch system status', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-[10px] text-[var(--text-faint)]">
        Loading Quote Health Metrics...
      </div>
    );
  }

  const providers = data?.providers || [];
  const isHealthy = data?.ok && data?.enabled;

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4 rounded-xl shadow-sm">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest flex items-center gap-2">
            <Database className="w-3 h-3" /> External Data Ingestion
          </span>
          <span className="font-heading text-sm font-bold text-[var(--text-main)]">
            Quote Feed Health & Integrity
          </span>
        </div>
        <button 
          onClick={fetchStatus}
          disabled={loading}
          className="p-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className={cn(
          "border p-5 rounded-xl flex flex-col gap-1 shadow-sm border-l-4",
          isHealthy ? "bg-slate-900 border-slate-800 border-l-[var(--color-brand-green)]" : "bg-red-950/20 border-red-900/30 border-l-[var(--color-brand-red)]"
        )}>
          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
            <Activity className="w-3 h-3" /> Pipeline Status
          </span>
          <span className={cn("font-mono text-2xl font-semibold", isHealthy ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-red)]")}>
            {isHealthy ? 'HEALTHY' : 'DEGRADED'}
          </span>
          <span className="text-[9px] text-slate-600">Overall quote integrity</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col gap-1 shadow-sm border-l-4 border-l-[var(--color-brand-cyan)]">
          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
            <Database className="w-3 h-3" /> Total Records
          </span>
          <span className="font-mono text-2xl text-[var(--color-brand-cyan)] font-semibold">
            {(data?.records || 0).toLocaleString()}
          </span>
          <span className="text-[9px] text-slate-600">Usable history rows</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col gap-1 shadow-sm border-l-4 border-l-[var(--color-brand-amber)]">
          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
            <ShieldAlert className="w-3 h-3" /> Stale Records
          </span>
          <span className="font-mono text-2xl text-[var(--color-brand-amber)] font-semibold">
            {(data?.stale_records || 0).toLocaleString()}
          </span>
          <span className="text-[9px] text-slate-600">Records past TTL</span>
        </div>
      </div>

      <div className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl flex flex-col shadow-sm overflow-hidden min-h-[300px]">
        <div className="h-10 border-b border-[var(--border-subtle)] flex items-center px-5 shrink-0 bg-[var(--bg-primary)]">
           <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">Configured Providers</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="data-ledger w-full">
            <thead className="bg-[var(--bg-tertiary)] sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-mono text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">Provider</th>
                <th className="text-left px-4 py-2 font-mono text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">Status</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">Configured</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">Records</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">Stale</th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 font-mono text-[10px] text-[var(--text-faint)]">
                    No quote providers configured.
                  </td>
                </tr>
              ) : providers.map((p: any, idx: number) => (
                <tr key={idx} className="hover:bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] last:border-0 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[var(--text-main)] uppercase">{p.provider}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold tracking-wider",
                      p.status === 'ok' ? "bg-[var(--color-brand-green)]/10 text-[var(--color-brand-green)]" : "bg-[var(--color-brand-amber)]/10 text-[var(--color-brand-amber)]"
                    )}>
                      {p.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 text-xs">
                    {p.configured ? (
                      <CheckCircle className="w-4 h-4 text-[var(--color-brand-green)] inline" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-[var(--color-brand-amber)] inline" />
                    )}
                  </td>
                  <td className="text-right px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{(p.records || 0).toLocaleString()}</td>
                  <td className="text-right px-4 py-3 font-mono text-xs text-[var(--color-brand-amber)]">{(p.stale_records || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
