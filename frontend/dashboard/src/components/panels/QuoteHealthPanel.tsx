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
  Clock3,
  Database,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { API_ENDPOINTS, getAuthHeaders } from '../../lib/api';
import {
  fetchCompleteMarketMonitor,
  filterAndSortMarketRows,
  formatMarketAge,
  normalizeMarketMonitorPayload,
} from '../../lib/market_monitor';
import { MetricGrid } from './quote_health/MetricGrid';
import { InstrumentTable, SortDirection } from './quote_health/InstrumentTable';
import { ServiceHealthSection } from './quote_health/ServiceHealthSection';

const REFRESH_INTERVAL_MS = 10_000;

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

function useMarketMonitor() {
  const [monitor, setMonitor] = useState<any>(null);
  const [providerData, setProviderData] = useState<any>(null);
  const [providerError, setProviderError] = useState(false);
  const [serviceHealth, setServiceHealth] = useState<any>(null);
  const [serviceError, setServiceError] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

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
      const [monitorResult, providerResult, serviceResult] = await Promise.allSettled([
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
        fetch(API_ENDPOINTS.SERVICE_HEALTH, {
          headers,
          signal: controller.current.signal,
        }).then(async (response) => {
          if (!response.ok) throw new Error('service_health_unavailable');
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
      if (serviceResult.status === 'fulfilled') {
        const services = Array.isArray(serviceResult.value?.services) ? serviceResult.value.services : [];
        setServiceHealth({
          counts: serviceResult.value?.counts || null,
          services: services.filter((service: any) => (
            service && typeof service.service === 'string' && typeof service.state === 'string'
          )),
        });
        setServiceError(false);
      } else if (serviceResult.reason?.name !== 'AbortError') {
        setServiceError(true);
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

  return {
    currentMonitor,
    providerData,
    providerError,
    serviceHealth,
    serviceError,
    errorCode,
    loading,
    refreshing,
    fetchStatus,
  };
}

export function QuoteHealthPanel() {
  const {
    currentMonitor,
    providerData,
    providerError,
    serviceHealth,
    serviceError,
    errorCode,
    loading,
    refreshing,
    fetchStatus,
  } = useMarketMonitor();

  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [freshness, setFreshness] = useState('all');
  const [sortKey, setSortKey] = useState('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const families = useMemo(
    () => [...new Set<string>((currentMonitor?.rows || []).map((row: any) => String(row.family || '')))].sort(),
    [currentMonitor],
  );

  const visibleRows = useMemo(
    () =>
      filterAndSortMarketRows(currentMonitor?.rows || [], {
        query,
        family,
        freshness,
        sortKey,
        sortDirection,
      }),
    [currentMonitor, query, family, freshness, sortKey, sortDirection],
  );

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  if (loading && !currentMonitor) {
    return (
      <div
        data-market-monitor-state="loading"
        className="flex-1 flex items-center justify-center font-mono text-[10px] text-[var(--text-faint)]"
      >
        Loading authenticated global market snapshot...
      </div>
    );
  }

  if (!currentMonitor) {
    return (
      <div
        data-market-monitor-state={errorCode === 'unauthorized' ? 'unauthorized' : 'error'}
        className="flex-1 p-4 sm:p-6 grid place-items-center"
      >
        <div className="max-w-xl w-full rounded-xl border border-red-900/40 bg-red-950/20 p-6 text-center">
          <ShieldAlert className="w-6 h-6 text-[var(--color-brand-red)] mx-auto mb-3" />
          <p className="font-heading text-sm font-bold text-[var(--text-main)]">
            Market monitor unavailable
          </p>
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
          <h2 className="font-heading text-sm font-bold text-[var(--text-main)]">
            Canonical last-known instrument values
          </h2>
          <p className="font-mono text-[9px] text-[var(--text-faint)] mt-1">
            Snapshot age {formatMarketAge(currentMonitor.snapshotAgeMs)} · generated{' '}
            {new Date(currentMonitor.generatedAtMs).toLocaleString()} · {currentMonitor.storage_mode}
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh global market monitor"
          onClick={fetchStatus}
          disabled={refreshing}
          className="self-start lg:self-auto px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-2 font-mono text-[10px] cursor-pointer"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {currentMonitor.degraded && (
        <div
          data-market-monitor-diagnostic
          className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 flex gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-[var(--color-brand-amber)] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold text-[var(--color-brand-amber)]">
              DEGRADED MARKET SNAPSHOT
            </p>
            <p className="font-mono text-[9px] text-[var(--text-muted)] break-words">
              {degradedReasons.length > 0
                ? degradedReasons.join(', ')
                : 'snapshot age exceeds the dashboard threshold'}
              {currentMonitor.malformedRows > 0
                ? ` · ${currentMonitor.malformedRows} malformed row(s) excluded`
                : ''}
              {currentMonitor.duplicateRows > 0
                ? ` · ${currentMonitor.duplicateRows} duplicate row(s) excluded`
                : ''}
            </p>
          </div>
        </div>
      )}

      <MetricGrid counts={counts} providerFailures={providerFailures} updating={updating} />

      <InstrumentTable
        visibleRows={visibleRows}
        totalRows={currentMonitor.rows.length}
        query={query}
        setQuery={setQuery}
        family={family}
        setFamily={setFamily}
        families={families}
        freshness={freshness}
        setFreshness={setFreshness}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      <ServiceHealthSection
        serviceHealth={serviceHealth}
        serviceError={serviceError}
        providers={providers}
        providerError={providerError}
      />

      <div className="font-mono text-[9px] text-[var(--text-faint)] flex items-center gap-2">
        <Clock3 className="w-3 h-3" /> Auto-refreshes every 10 seconds while this tab is visible.
        {refreshing && (
          <>
            <Activity className="w-3 h-3 animate-spin" /> refresh in progress
          </>
        )}
      </div>
    </div>
  );
}
