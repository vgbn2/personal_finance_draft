import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Database, Layers, Globe, Activity, CheckCircle, AlertCircle } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { API_ENDPOINTS, API_BASE_URL, DEFAULT_HEADERS } from '../../lib/api';

interface UniverseEntry {
  symbol: string;
  family: string;
  provider: string;
  records: number;
  first_timestamp: string;
  last_timestamp: string;
}

interface MarketUniverse {
  ok: boolean;
  entries: UniverseEntry[];
}

export function MarketIntelPanel() {
  const [universe, setUniverse] = useState<MarketUniverse | null>(null);
  const [quality, setQuality] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const staleRecords = quality?.freshness?.stale_records ?? quality?.stale_records ?? 0;
  const freshnessState = quality?.freshness?.state || (staleRecords > 0 ? 'Degraded' : 'Nominal');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [uniRes, qualRes] = await Promise.all([
          fetch(API_ENDPOINTS.UNIVERSE, { headers: DEFAULT_HEADERS }),
          fetch(API_ENDPOINTS.STATUS, { headers: DEFAULT_HEADERS })
        ]);
        
        const uniData = await uniRes.json();
        const qualData = await qualRes.json();
        
        if (uniData.ok) setUniverse(uniData);
        if (qualData.ok) setQuality(qualData);
      } catch (err) {
        console.error('Failed to fetch market intel', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Stream real-time market data
    const socket = io(API_BASE_URL || undefined);
    socket.on('market_data', (payload: any) => {
      if (payload.universe?.ok) setUniverse(payload.universe);
      if (payload.status?.ok) setQuality(payload.status);
      else if (payload.dataSummary?.ok) {
        setQuality({
          usable_records: payload.dataSummary.quality?.usable_records ?? 0,
          stale_records: payload.dataSummary.quality?.stale_records ?? 0,
          freshness: {
            stale_records: payload.dataSummary.quality?.stale_records ?? 0,
          },
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-[10px] text-[var(--text-faint)]">
        Hydrating Market Universe...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 animate-in slide-in-from-bottom-2 duration-300">
      
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-5 rounded-xl flex flex-col gap-1 relative overflow-hidden group shadow-sm">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-brand-cyan)]" />
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-3 h-3" /> Total Symbols
          </span>
          <span className="font-mono text-2xl text-[var(--text-main)] font-semibold tracking-tight">
            {universe?.entries.length || 0}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-faint)]">Active Universe</span>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-5 rounded-xl flex flex-col gap-1 relative overflow-hidden group shadow-sm">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-brand-green)]" />
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
            <CheckCircle className="w-3 h-3" /> Usable Records
          </span>
          <span className="font-mono text-2xl text-[var(--text-main)] font-semibold tracking-tight">
            {quality?.usable_records?.toLocaleString() || '0'}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-faint)]">Verified Integrity</span>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-5 rounded-xl flex flex-col gap-1 relative overflow-hidden group shadow-sm">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-brand-amber)]" />
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-3 h-3" /> Data Freshness
          </span>
          <span className="font-mono text-2xl text-[var(--text-main)] font-semibold tracking-tight uppercase">
            {freshnessState}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-faint)]">
            {staleRecords} stale items
          </span>
        </div>
      </div>

      {/* Universe Table */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl flex flex-col shadow-sm overflow-hidden">
        <div className="h-10 border-b border-[var(--border-subtle)] flex items-center px-5 shrink-0 bg-[var(--bg-primary)] justify-between">
           <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)] flex items-center gap-2">
             <Database className="w-3 h-3" /> Market Universe Map
           </span>
           <span className="text-[10px] font-mono text-[var(--text-faint)]">
             Last Refreshed: {new Date().toLocaleTimeString()}
           </span>
        </div>
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead>
              <tr className="bg-[var(--bg-primary)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                <th className="px-5 py-3 font-semibold uppercase tracking-tighter">Symbol</th>
                <th className="px-5 py-3 font-semibold uppercase tracking-tighter">Family</th>
                <th className="px-5 py-3 font-semibold uppercase tracking-tighter">Provider</th>
                <th className="px-5 py-3 font-semibold uppercase tracking-tighter text-right">Records</th>
                <th className="px-5 py-3 font-semibold uppercase tracking-tighter">Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {universe?.entries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-[var(--bg-primary)] transition-colors group">
                  <td className="px-5 py-3 font-bold text-[var(--color-brand-cyan)]">{entry.symbol}</td>
                  <td className="px-5 py-3 text-[var(--text-muted)] uppercase">{entry.family}</td>
                  <td className="px-5 py-3 text-[var(--text-main)]">{entry.provider}</td>
                  <td className="px-5 py-3 text-right font-semibold">{entry.records.toLocaleString()}</td>
                  <td className="px-5 py-3 text-[10px] text-[var(--text-faint)]">
                    {new Date(entry.first_timestamp).toLocaleDateString()} → {new Date(entry.last_timestamp).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
