import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatMarketAge, formatMarketValue } from '../../../lib/market_monitor';

export type SortDirection = 'asc' | 'desc';

interface InstrumentTableProps {
  visibleRows: any[];
  totalRows: number;
  query: string;
  setQuery: (q: string) => void;
  family: string;
  setFamily: (f: string) => void;
  families: string[];
  freshness: string;
  setFreshness: (f: string) => void;
  sortKey: string;
  sortDirection: SortDirection;
  onSort: (key: string) => void;
}

function freshnessTone(state: string) {
  if (state === 'fresh') return 'bg-[var(--color-brand-green)]/10 text-[var(--color-brand-green)] border border-[var(--color-brand-green)]/20';
  if (state === 'delayed') return 'bg-[var(--color-brand-amber)]/10 text-[var(--color-brand-amber)] border border-[var(--color-brand-amber)]/20';
  return 'bg-[var(--color-brand-red)]/10 text-[var(--color-brand-red)] border border-[var(--color-brand-red)]/20';
}

function updateTone(state: string) {
  if (state === 'running' || state === 'queued') {
    return 'bg-[var(--color-brand-cyan)]/10 text-[var(--color-brand-cyan)] border border-[var(--color-brand-cyan)]/20';
  }
  if (state === 'failed') return 'bg-[var(--color-brand-red)]/10 text-[var(--color-brand-red)] border border-[var(--color-brand-red)]/20';
  if (state === 'succeeded') return 'bg-[var(--color-brand-green)]/10 text-[var(--color-brand-green)] border border-[var(--color-brand-green)]/20';
  return 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-subtle)]';
}

export function InstrumentTable({
  visibleRows,
  totalRows,
  query,
  setQuery,
  family,
  setFamily,
  families,
  freshness,
  setFreshness,
  sortKey,
  sortDirection,
  onSort,
}: InstrumentTableProps) {
  return (
    <section className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden min-w-0">
      <div className="p-3 sm:p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
        <div>
          <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
            Configured instruments
          </h3>
          <p className="font-mono text-[9px] text-[var(--text-faint)]">
            {visibleRows.length} of {totalRows} verified rows shown
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 min-w-0">
          <label className="relative min-w-0">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--text-faint)]" />
            <span className="sr-only">Filter instruments</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Symbol, name, provider"
              className="w-full sm:w-52 pl-8 pr-2.5 py-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-[10px] focus:outline-none focus:border-[var(--color-brand-cyan)] transition-colors"
            />
          </label>
          <select
            aria-label="Filter by family"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            className="py-1.5 px-2.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-[10px] focus:outline-none focus:border-[var(--color-brand-cyan)] transition-colors cursor-pointer"
          >
            <option value="all">All families</option>
            {families.map((value: string) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by freshness"
            value={freshness}
            onChange={(e) => setFreshness(e.target.value)}
            className="py-1.5 px-2.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono text-[10px] focus:outline-none focus:border-[var(--color-brand-cyan)] transition-colors cursor-pointer"
          >
            <option value="all">All freshness</option>
            {['fresh', 'delayed', 'stale', 'missing', 'invalid'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto min-w-0">
        <table className="data-ledger min-w-[980px] w-full">
          <thead className="bg-[var(--bg-tertiary)] sticky top-0">
            <tr>
              {[
                ['symbol', 'Instrument'],
                ['value', 'Last value'],
                ['family', 'Family'],
                ['provider', 'Source'],
                ['observed_at', 'Observed'],
                ['age_ms', 'Age'],
                ['freshness_state', 'Freshness'],
                ['update_state', 'Update'],
              ].map(([key, label]) => (
                <th key={key}>
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    className="uppercase hover:text-[var(--text-main)] transition-colors font-mono font-semibold"
                  >
                    {label}
                    {sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-10 font-mono text-[10px] text-[var(--text-faint)]"
                >
                  {totalRows === 0
                    ? 'No configured price-bearing instruments are available.'
                    : 'No instruments match the current filters.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((row: any) => (
                <tr
                  key={row.instrument_id}
                  className="hover:bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] last:border-0 transition-colors"
                >
                  <td>
                    <div className="font-bold text-[var(--text-main)]">{row.symbol}</div>
                    <div
                      className="text-[9px] text-[var(--text-faint)] max-w-40 truncate font-mono"
                      title={row.display_name || row.symbol}
                    >
                      {row.display_name || row.market}
                    </div>
                  </td>
                  <td>
                    <div className="font-semibold font-mono">{formatMarketValue(row)}</div>
                    {row.freshness_state === 'stale' && (
                      <div className="text-[9px] text-[var(--color-brand-amber)] font-mono">
                        last known
                      </div>
                    )}
                  </td>
                  <td className="uppercase font-mono text-[10px] text-[var(--text-muted)]">
                    {row.family}
                  </td>
                  <td>
                    <div className="max-w-36 truncate font-mono text-[10px]" title={row.provider}>
                      {row.provider}
                    </div>
                    <div className="text-[9px] text-[var(--text-faint)] font-mono">
                      {row.provider_state}
                    </div>
                  </td>
                  <td className="font-mono text-[10px] text-[var(--text-muted)]">
                    {row.observed_at ? new Date(row.observed_at).toLocaleString() : 'Never observed'}
                  </td>
                  <td className="font-mono text-[10px]">{formatMarketAge(row.age_ms)}</td>
                  <td>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[9px] font-bold uppercase font-mono tracking-wider',
                        freshnessTone(row.freshness_state),
                      )}
                    >
                      {row.freshness_state}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-[9px] font-bold uppercase font-mono tracking-wider',
                        updateTone(row.update_state),
                      )}
                    >
                      {row.update_state}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
