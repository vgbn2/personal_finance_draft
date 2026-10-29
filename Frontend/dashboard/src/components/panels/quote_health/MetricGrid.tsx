import React from 'react';

interface MetricGridProps {
  counts: {
    configured_price_bearing_total: number;
    price_bearing_total: number;
    freshness: {
      fresh: number;
      delayed: number;
      stale: number;
      missing: number;
    };
  };
  providerFailures: number;
  updating: number;
}

function MetricCard({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: number;
  tone: string;
  detail: string;
}) {
  return (
    <div
      className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-3.5 rounded-lg shadow-sm border-l-2 min-w-0 flex flex-col justify-between"
      style={{ borderLeftColor: tone }}
    >
      <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        {label}
      </span>
      <div className="font-mono text-xl text-[var(--text-main)] font-bold my-1 tracking-tight">
        {value.toLocaleString()}
      </div>
      <span className="text-[9px] text-[var(--text-faint)] truncate font-mono">
        {detail}
      </span>
    </div>
  );
}

export function MetricGrid({ counts, providerFailures, updating }: MetricGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
      <MetricCard
        label="Configured"
        value={counts.configured_price_bearing_total}
        tone="#0ea5e9"
        detail={`${counts.price_bearing_total} monitored`}
      />
      <MetricCard
        label="Fresh"
        value={counts.freshness.fresh}
        tone="#10b981"
        detail="Within 50% TTL"
      />
      <MetricCard
        label="Delayed"
        value={counts.freshness.delayed}
        tone="#f59e0b"
        detail="Within policy TTL"
      />
      <MetricCard
        label="Stale"
        value={counts.freshness.stale}
        tone="#f97316"
        detail="Past policy TTL"
      />
      <MetricCard
        label="Missing"
        value={counts.freshness.missing}
        tone="#f43f5e"
        detail="No canonical value"
      />
      <MetricCard
        label="Provider Failures"
        value={providerFailures}
        tone="#f43f5e"
        detail="Degraded / down"
      />
      <MetricCard
        label="Updating"
        value={updating}
        tone="#8b5cf6"
        detail="Queued or running"
      />
    </div>
  );
}
