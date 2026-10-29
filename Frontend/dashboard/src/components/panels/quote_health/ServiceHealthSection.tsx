import React from 'react';
import { CheckCircle, ShieldAlert } from 'lucide-react';
import { formatMarketAge } from '../../../lib/market_monitor';

interface ServiceHealthSectionProps {
  serviceHealth: {
    counts: any;
    services: any[];
  } | null;
  serviceError: boolean;
  providers: any[];
  providerError: boolean;
}

export function ServiceHealthSection({
  serviceHealth,
  serviceError,
  providers,
  providerError,
}: ServiceHealthSectionProps) {
  return (
    <>
      <section
        data-service-health
        className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden min-w-0"
      >
        <div className="h-10 border-b border-[var(--border-subtle)] flex items-center justify-between px-4 sm:px-5 bg-[var(--bg-primary)]">
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
            Service health context
          </span>
          <span className="font-mono text-[9px] text-[var(--text-faint)]">
            separate from instrument freshness
          </span>
        </div>
        {serviceError || !serviceHealth ? (
          <div className="p-6 text-center font-mono text-[10px] text-[var(--color-brand-amber)]">
            Service heartbeat status is unavailable; canonical instrument freshness remains authoritative.
          </div>
        ) : (
          <div className="overflow-x-auto min-w-0">
            <table className="data-ledger min-w-[720px] w-full">
              <thead className="bg-[var(--bg-tertiary)]">
                <tr>
                  <th>Service</th>
                  <th>State</th>
                  <th>Heartbeat age</th>
                  <th>Last success</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {serviceHealth.services.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-[var(--text-faint)] font-mono text-[10px]">
                      No service heartbeats reported.
                    </td>
                  </tr>
                ) : (
                  serviceHealth.services.map((service: any) => (
                    <tr key={service.service}>
                      <td className="font-bold text-[var(--text-main)]">{service.service}</td>
                      <td
                        className={
                          service.state === 'healthy' || service.state === 'running'
                            ? 'text-[var(--color-brand-green)] font-semibold uppercase font-mono text-[10px]'
                            : 'text-[var(--color-brand-amber)] font-semibold uppercase font-mono text-[10px]'
                        }
                      >
                        {service.state}
                      </td>
                      <td className="font-mono text-[10px] text-[var(--text-muted)]">
                        {formatMarketAge(service.age_ms)}
                      </td>
                      <td className="font-mono text-[10px] text-[var(--text-muted)]">
                        {service.last_success_at
                          ? new Date(service.last_success_at).toLocaleString()
                          : 'Never'}
                      </td>
                      <td className="text-[var(--text-faint)] font-mono text-[10px]">
                        {service.error_code || service.reason || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden min-w-0">
        <div className="h-10 border-b border-[var(--border-subtle)] flex items-center px-4 sm:px-5 bg-[var(--bg-primary)]">
          <span className="font-heading text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
            Provider health context
          </span>
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
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-[var(--text-faint)] font-mono text-[10px]">
                      No provider-level status reported.
                    </td>
                  </tr>
                ) : (
                  providers.map((provider: any) => (
                    <tr key={String(provider.provider)}>
                      <td className="font-bold uppercase text-[var(--text-main)]">
                        {provider.provider}
                      </td>
                      <td className="font-mono text-[10px] uppercase text-[var(--text-muted)]">
                        {String(provider.status || 'unknown').toUpperCase()}
                      </td>
                      <td className="text-right">
                        {provider.configured ? (
                          <CheckCircle className="w-4 h-4 text-[var(--color-brand-green)] inline" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-[var(--color-brand-amber)] inline" />
                        )}
                      </td>
                      <td className="text-right font-mono text-[10px]">
                        {Number(provider.records || 0).toLocaleString()}
                      </td>
                      <td className="text-right text-[var(--color-brand-amber)] font-mono text-[10px]">
                        {Number(provider.stale_records || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
