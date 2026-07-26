import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock3,
  Database,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { API_ENDPOINTS, getAuthHeaders } from '../../lib/api';
import {
  fetchCompleteMarketMonitor,
  filterAndSortMarketRows,
  formatMarketAge,
  formatMarketValue,
  normalizeMarketMonitorPayload,
} from '../../lib/market_monitor';

const REFRESH_INTERVAL_MS = 10_000;

type SortDirection = 'asc' | 'desc';

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Authentication is required to view the global market monitor.',
  network_error: 'The market monitor API is unreachable. Last-known data is retained when available.',
  api_error: 'The market monitor API returned an error. Retry after checking the private API service.',
  malformed_response: 'The market monitor response could not be verified.',
  malformed_pagination: 'The market monitor pagination contract could not be verified.',
  snapshot_changed_during_pagination: 'The snapshot changed during pagination. Retry for one consistent view.',
  response_too_large: 'The market monitor response exceeded the dashboard safety bound.',
};

function safeErrorCode(error: any) {
  return typeof error?.code === 'string' && SAFE_ERROR_MESSAGES[error.code]
    ? error.code
    : 'api_error';
}

function freshnessTone(state: string) {
  if (state === 'fresh') return 'bg-[var(--color-brand-green)]/10 text-[var(--color-brand-green)]';
  if (state === 'delayed') return 'bg-[var(--color-brand-amber)]/10 text-[var(--color-brand-amber)]';
  return 'bg-[var(--color-brand-red)]/10 text-[var(--color-brand-red)]';
}

function updateTone(state: string) {
  if (state === 'running' || state === 'queued') {
    return 'bg-[var(--color-brand-cyan)]/10 text-[var(--color-brand-cyan)]';
  }
  if (state === 'failed') return 'bg-[var(--color-brand-red)]/10 text-[var(--color-brand-red)]';
  if (state === 'succeeded') return 'bg-[var(--color-brand-green)]/10 text-[var(--color-brand-green)]';
  return 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]';
}

function MetricCard({ label, value, tone, detail }: {
  label: string;
  value: number;
  tone: string;
  detail: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm border-l-4 min-w-0" style={{ borderLeftColor: tone }}>
      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="font-mono text-xl text-[var(--text-main)] font-semibold">{value.toLocaleString()}</div>
      <span className="text-[9px] text-slate-600">{detail}</span>
    </div>
  );
}

export function QuoteHealthPanel() {
  const [monitor, setMonitor] = useState<any>(null);
  const [providerData, setProviderData] = useState<any>(null);
  const [providerError, setProviderError] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [freshness, setFreshness] = useState('all');
  const [sortKey, setSortKey] = useState('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    controller.current = new AbortController();
    try {
      const headers = await getAuthHeaders();
      const [monitorResult, providerResult] = await Promise.allSettled([
        fetchCompleteMarketMonitor({
          url: API_ENDPOINTS.MARKET_MONITOR,
          headers,
          signal: controller.current.signal,
        }),
        fetch(API_ENDPOINTS.SYSTEM_STATUS, {
          headers,
          signal: controller.current.signal,
        }).then(async (response) => {
          if (!response.ok) throw new Error('provider_status_unavailable');
          return response.json();
        }),
      ]);
      if (!mounted.current) return;
      const observedNow = Date.now();
      setNowMs(observedNow);
      if (monitorResult.status === 'fulfilled') {
        setMonitor(normalizeMarketMonitorPayload(monitorResult.value, observedNow));
        setErrorCode(null);
      } else if (monitorResult.reason?.name !== 'AbortError') {
        setErrorCode(safeErrorCode(monitorResult.reason));
      }
      if (providerResult.status === 'fulfilled') {
        const quotes = providerResult.value?.components?.quotes;
        setProviderData(quotes && typeof quotes === 'object' ? quotes : null);
        setProviderError(!quotes);
      } else if (providerResult.reason?.name !== 'AbortError') {
        setProviderError(true);
      }
    } catch (error: any) {
      if (mounted.current && error?.name !== 'AbortError') {
        setErrorCode(safeErrorCode(error));
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchStatus();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setNowMs(Date.now());
        fetchStatus();
      }
    }, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setNowMs(Date.now());
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      mounted.current = false;
      controller.current?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchStatus]);

  const currentMonitor = useMemo(() => {
    if (!monitor) return null;
    const snapshotAgeMs = Math.max(0, nowMs - monitor.generatedAtMs);
    const staleSnapshot = snapshotAgeMs > 30_000;
    return {
      ...monitor,
      snapshotAgeMs,
      staleSnapshot,
      degraded: monitor.degraded || staleSnapshot || Boolean(errorCode),
    };
  }, [monitor, nowMs, errorCode]);

  const families = useMemo(
    () => [...new Set((currentMonitor?.rows || []).map((row: any) => row.family))].sort(),
    [currentMonitor],
  );
  const visibleRows = useMemo(
    () => filterAndSortMarketRows(currentMonitor?.rows || [], {
      query,
      family,
      freshness,
      sortKey,
      sortDirection,
    }),
    [currentMonitor, query, family, freshness, sortKey, sortDirection],
  );

  const setSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  if (loading && !currentMonitor) {
    return (
      <div data-market-monitor-state="loading" className="flex-1 flex items-center justify-center font-mono text-[10px] text-[var(--text-faint)]">
        Loading authenticated global market snapshot...
      </div>
    );
  }

  if (!currentMonitor) {
    return (
      <div data-market-monitor-state={errorCode === 'unauthorized' ? 'unauthorized' : 'error'} className="flex-1 p-4 sm:p-6 grid place-items-center">
        <div className="max-w-xl w-full rounded-xl border border-red-900/40 bg-red-950/20 p-6 text-center">
          <ShieldAlert className="w-6 h-6 text-[var(--color-brand-red)] mx-auto mb-3" />
          <p className="font-heading text-sm font-bold text-[var(--text-main)]">Market monitor unavailable</p>
          <p className="mt-2 font-mono text-[10px] text-[var(--text-muted)]">
            {SAFE_ERROR_MESSAGES[errorCode || 'api_error']}
          </p>
          <button type="button" onClick={fetchStatus} className="btn-primary mx-auto mt-4">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const counts = currentMonitor.counts;
  const providerFailures = counts.provider.degraded + counts.provider.unreachable;
  const updating = counts.update.queued + counts.update.running;
  const providers = Array.isArray(providerData?.providers) ? providerData.providers : [];
  const degradedReasons = [
    ...new Set([
      ...(currentMonitor.degradation_reasons || []),
      ...(currentMonitor.diagnostics || []),
      ...(errorCode ? [errorCode] : []),
    ]),
  ];

  return (
    <div
      data-market-monitor-state={currentMonitor.degraded ? 'degraded' : 'ready'}
      className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4 rounded-xl shadow-sm">
        <div className="min-w-0">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest flex items-center gap-2">
            <Database className="w-3 h-3" /> Global Market Monitor
          </span>
          <h2 className="font-heading text-sm font-bold text-[var(--text-main)]">Canonical last-known instrument values</h2>
          <p className="font-mono text-[9px] text-[var(--text-faint)] mt-1">
            Snapshot age {formatMarketAge(currentMonitor.snapshotAgeMs)} · generated {new Date(currentMonitor.generatedAtMs).toLocaleString()} · {currentMonitor.storage_mode}
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh global market monitor"
          onClick={fetchStatus}
          disabled={refreshing}
          className="self-start lg:self-auto px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-2 font-mono text-[10px]"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {currentMonitor.degraded && (
        <div data-market-monitor-diagnostic className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 flex gap-3">
          <AlertTriangle className="w-4 h-4 text-[var(--color-brand-amber)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold text-[var(--color-brand-amber)]">DEGRADED MARKET SNAPSHOT</p>
            <p className="font-mono text-[9px] text-[var(--text-muted)] break-words">
              {degradedReasons.length > 0 ? degradedReasons.join(', ') : 'snapshot age exceeds the dashboard threshold'}
              {currentMonitor.malformedRows > 0 ? ` · ${currentMonitor.malformedRows} malformed row(s) excluded` : ''}
              {currentMonitor.duplicateRows > 0 ? ` · ${currentMonitor.duplicateRows} duplicate row(s) excluded` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
        <MetricCard label="Configured" value={counts.configured_price_bearing_total} tone="#38bdf8" detail={`${counts.price_bearing_total} monitored`} />
        <MetricCard label="Fresh" value={counts.freshness.fresh} tone="#22c55e" detail="Within 50% TTL" />
        <MetricCard label="Delayed" value={counts.freshness.delayed} tone="#f59e0b" detail="Within policy TTL" />
        <MetricCard label="Stale" value={counts.freshness.stale} tone="#f97316" detail="Past policy TTL" />
        <MetricCard label="Missing" value={counts.freshness.missing} tone="#ef4444" detail="No canonical value" />
        <MetricCard label="Provider Failures" value={providerFailures} tone="#ef4444" detail="Degraded or unreachable" />
        <MetricCard label="Updating" value={updating} tone="#a78bfa" detail="Queued or running" />
      </div>

      <section className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden min-w-0">
        <div className="p-3 sm:p-4 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <div>
            <h3 className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">Configured instruments</h3>
            <p className="font-mono text-[9px] text-[var(--text-faint)]">{visibleRows.length} of {currentMonitor.rows.length} verified rows shown</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 min-w-0">
            <label className="relative min-w-0">
              <Search className="absolute left-2 top-2.5 w-3 h-3 text-[var(--text-faint)]" />
              <span className="sr-only">Filter instruments</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Symbol, name, provider"
                className="w-full sm:w-52 pl-7 pr-2 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] font-mono text-[10px]"
              />
            </label>
            <select aria-label="Filter by family" value={family} onChange={(event) => setFamily(event.target.value)} className="py-2 px-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] font-mono text-[10px]">
              <option value="all">All families</option>
              {families.map((value: string) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="Filter by freshness" value={freshness} onChange={(event) => setFreshness(event.target.value)} className="py-2 px-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-subtle)] font-mono text-[10px]">
              <option value="all">All freshness</option>
              {['fresh', 'delayed', 'stale', 'missing', 'invalid'].map((value) => <option key={value} value={value}>{value}</option>)}
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
                    <button type="button" onClick={() => setSort(key)} className="uppercase hover:text-[var(--text-main)]">
                      {label}{sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 font-mono text-[10px] text-[var(--text-faint)]">
                    {currentMonitor.rows.length === 0
                      ? 'No configured price-bearing instruments are available.'
                      : 'No instruments match the current filters.'}
                  </td>
                </tr>
              ) : visibleRows.map((row: any) => (
                <tr key={row.instrument_id} className="hover:bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] last:border-0 transition-colors">
                  <td>
                    <div className="font-bold text-[var(--text-main)]">{row.symbol}</div>
                    <div className="text-[9px] text-[var(--text-faint)] max-w-40 truncate" title={row.display_name || row.symbol}>{row.display_name || row.market}</div>
                  </td>
                  <td>
                    <div className="font-semibold">{formatMarketValue(row)}</div>
                    {row.freshness_state === 'stale' && <div className="text-[9px] text-[var(--color-brand-amber)]">last known</div>}
                  </td>
                  <td className="uppercase">{row.family}</td>
                  <td>
                    <div className="max-w-36 truncate" title={row.provider}>{row.provider}</div>
                    <div className="text-[9px] text-[var(--text-faint)]">{row.provider_state}</div>
                  </td>
                  <td>{row.observed_at ? new Date(row.observed_at).toLocaleString() : 'Never observed'}</td>
                  <td>{formatMarketAge(row.age_ms)}</td>
                  <td>
                    <span className={cn('px-2 py-0.5 rounded text-[9px] font-bold uppercase', freshnessTone(row.freshness_state))}>
                      {row.freshness_state}
                    </span>
                  </td>
                  <td>
                    <span className={cn('px-2 py-0.5 rounded text-[9px] font-bold uppercase', updateTone(row.update_state))}>
                      {row.update_state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden min-w-0">
        <div className="h-10 border-b border-[var(--border-subtle)] flex items-center px-4 sm:px-5 bg-[var(--bg-primary)]">
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">Provider health context</span>
        </div>
        {providerError ? (
          <div className="p-6 text-center font-mono text-[10px] text-[var(--color-brand-amber)]">
            Provider-level status is unavailable; instrument freshness above remains authoritative.
          </div>
        ) : (
          <div className="overflow-x-auto min-w-0">
            <table className="data-ledger min-w-[640px] w-full">
              <thead className="bg-[var(--bg-tertiary)]">
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th className="text-right">Configured</th>
                  <th className="text-right">Records</th>
                  <th className="text-right">Stale</th>
                </tr>
              </thead>
              <tbody>
                {providers.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-[var(--text-faint)]">No provider-level status reported.</td></tr>
                ) : providers.map((provider: any) => (
                  <tr key={String(provider.provider)}>
                    <td className="font-bold uppercase">{provider.provider}</td>
                    <td>{String(provider.status || 'unknown').toUpperCase()}</td>
                    <td className="text-right">{provider.configured ? <CheckCircle className="w-4 h-4 text-[var(--color-brand-green)] inline" /> : <ShieldAlert className="w-4 h-4 text-[var(--color-brand-amber)] inline" />}</td>
                    <td className="text-right">{Number(provider.records || 0).toLocaleString()}</td>
                    <td className="text-right text-[var(--color-brand-amber)]">{Number(provider.stale_records || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="font-mono text-[9px] text-[var(--text-faint)] flex items-center gap-2">
        <Clock3 className="w-3 h-3" /> Auto-refreshes every 10 seconds while this tab is visible.
        {refreshing && <><Activity className="w-3 h-3 animate-spin" /> refresh in progress</>}
      </div>
    </div>
  );
}
