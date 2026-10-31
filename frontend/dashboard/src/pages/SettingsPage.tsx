import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Cpu, Layers, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { API_ENDPOINTS, getAuthHeaders } from '../lib/api';

interface Props {
  session: Session | null;
}

interface RiskThresholds {
  max_position_pct: number;
  max_drawdown_pct: number;
}

interface BrokerPreference {
  default: string;
}

interface AlertPreferences {
  email: boolean;
  push: boolean;
}

const BROKERS = ['alpaca', 'binance', 'coinbase', 'gate_io', 'interactive_brokers', 'deribit'];

interface BrokerNodeInfo {
  id: string;
  name: string;
  statusLabel: string;
  badgeClass: string;
  description: string;
  envKeyHint?: string;
}

const BROKER_NODES: BrokerNodeInfo[] = [
  {
    id: 'virtual_paper',
    name: 'Virtual Paper Ledger',
    statusLabel: 'Active & Built-in',
    badgeClass: 'text-[var(--color-brand-green)] border-[var(--color-brand-green)]/30 bg-[var(--color-brand-green)]/10',
    description: 'Deterministic local paper engine ($100,000 USD virtual capital). Zero cloud dependency, instant fills.',
  },
  {
    id: 'polymarket',
    name: 'Polymarket CLOB',
    statusLabel: 'Paper / Public Feed',
    badgeClass: 'text-[var(--color-brand-cyan)] border-[var(--color-brand-cyan)]/30 bg-[var(--color-brand-cyan)]/10',
    description: 'Prediction market orderbook & outcome pricing. Defaults to virtual paper execution.',
    envKeyHint: 'Optional live keys: POLYMARKET_API_KEY',
  },
  {
    id: 'alpaca',
    name: 'Alpaca Markets',
    statusLabel: 'Pluggable Adapter',
    badgeClass: 'text-[var(--color-brand-cyan)] border-[var(--color-brand-cyan)]/30 bg-[var(--color-brand-cyan)]/10',
    description: 'Equities & Crypto execution gateway. Falls back to internal paper ledger when keys are unset in .env.',
    envKeyHint: 'Optional keys: APCA_API_KEY_ID, APCA_API_SECRET_KEY',
  },
  {
    id: 'mt5',
    name: 'MetaTrader 5 Bridge',
    statusLabel: 'Port 8282 / Fallback',
    badgeClass: 'text-[var(--color-brand-cyan)] border-[var(--color-brand-cyan)]/30 bg-[var(--color-brand-cyan)]/10',
    description: 'Headless Wine 9 / Windows MT5 bridge socket. Automatic simulation fallback when terminal is offline.',
    envKeyHint: 'Daemon port: SOVEREIGN_MT5_PORT=8282',
  },
  {
    id: 'market_feeds',
    name: 'Binance & Yahoo Feeds',
    statusLabel: 'Public Feeds Active',
    badgeClass: 'text-[var(--color-brand-green)] border-[var(--color-brand-green)]/30 bg-[var(--color-brand-green)]/10',
    description: 'Unauthenticated public market streams for real-time OHLCV bars, orderbooks, and volatility feeds.',
  },
];

export default function SettingsPage({ session }: Props) {
  const [risk, setRisk] = useState<RiskThresholds>({ max_position_pct: 0.05, max_drawdown_pct: 0.15 });
  const [broker, setBroker] = useState<BrokerPreference>({ default: 'alpaca' });
  const [alerts, setAlerts] = useState<AlertPreferences>({ email: true, push: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const isLocalOperator = session?.user?.id === 'local-operator';

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadConfig = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(API_ENDPOINTS.CONFIG, { headers });
      const data = await res.json();
      if (data.ok && data.config) {
        if (data.config.risk_thresholds) setRisk(data.config.risk_thresholds);
        if (data.config.broker_preference) setBroker(data.config.broker_preference);
        if (data.config.alert_preferences) setAlerts(data.config.alert_preferences);
      }
    } catch { /* network error — keep defaults */ }
    setLoading(false);
  }, [session]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function saveKey(key: string, value: unknown) {
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(API_ENDPOINTS.CONFIG, {
        method: 'POST',
        headers,
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (data.ok) { showToast('Saved'); } else { showToast('Save failed: ' + data.error); }
    } catch { showToast('Network error'); }
    setSaving(false);
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--text-muted)] font-mono text-sm">Sign in to manage settings.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-heading font-bold text-[var(--text-main)]">System Settings</h2>
            {isLocalOperator && (
              <span className="px-2 py-0.5 rounded border border-[var(--color-brand-cyan)]/40 bg-[var(--color-brand-cyan)]/10 text-[var(--color-brand-cyan)] text-[10px] font-mono font-bold tracking-wider uppercase">
                Local Operator Mode
              </span>
            )}
          </div>
          <p className="text-[var(--text-muted)] font-mono text-xs">
            {isLocalOperator ? 'Local loopback instance (127.0.0.1) • Zero cloud requirement' : session.user.email}
          </p>
        </div>

        {/* Pluggable Brokerage & Integration Hub */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--color-brand-cyan)]" />
            <h3 className="font-mono text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              Pluggable Brokerage & Adapter Hub
            </h3>
          </div>
          <p className="text-[var(--text-muted)] font-mono text-xs leading-relaxed">
            All broker adapters are modular. In the absence of external API keys, Sovereign automatically falls back to the deterministic internal paper ledger and public market feeds.
          </p>

          <div className="space-y-3 pt-1">
            {BROKER_NODES.map((node) => (
              <div
                key={node.id}
                className="p-3.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-brand-green)]" />
                    <span className="font-mono text-xs font-bold text-[var(--text-main)]">{node.name}</span>
                  </div>
                  <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${node.badgeClass}`}>
                    {node.statusLabel}
                  </span>
                </div>
                <p className="text-[var(--text-muted)] font-mono text-[11px] leading-relaxed">
                  {node.description}
                </p>
                {node.envKeyHint && (
                  <p className="text-[var(--text-muted)]/70 font-mono text-[10px] italic">
                    {node.envKeyHint}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-[var(--text-muted)] font-mono text-sm animate-pulse">Loading config...</p>
        ) : (
          <>
            {/* Risk Thresholds */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--color-brand-cyan)]" />
                <h3 className="font-mono text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Risk Thresholds</h3>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="font-mono text-xs text-[var(--text-main)]">Max Position Size</label>
                    <span className="font-mono text-xs text-[var(--color-brand-cyan)]">{(risk.max_position_pct * 100).toFixed(1)}%</span>
                  </div>
                  <input
                    type="range" min="1" max="25" step="0.5"
                    value={risk.max_position_pct * 100}
                    onChange={(e) => setRisk(r => ({ ...r, max_position_pct: Number(e.target.value) / 100 }))}
                    onMouseUp={() => saveKey('risk_thresholds', risk)}
                    onTouchEnd={() => saveKey('risk_thresholds', risk)}
                    onBlur={() => saveKey('risk_thresholds', risk)}
                    className="w-full accent-[var(--color-brand-cyan)]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <label className="font-mono text-xs text-[var(--text-main)]">Max Drawdown</label>
                    <span className="font-mono text-xs text-[var(--color-brand-cyan)]">{(risk.max_drawdown_pct * 100).toFixed(1)}%</span>
                  </div>
                  <input
                    type="range" min="5" max="50" step="1"
                    value={risk.max_drawdown_pct * 100}
                    onChange={(e) => setRisk(r => ({ ...r, max_drawdown_pct: Number(e.target.value) / 100 }))}
                    onMouseUp={() => saveKey('risk_thresholds', risk)}
                    onTouchEnd={() => saveKey('risk_thresholds', risk)}
                    onBlur={() => saveKey('risk_thresholds', risk)}
                    className="w-full accent-[var(--color-brand-cyan)]"
                  />
                </div>
              </div>
            </div>

            {/* Broker Preference */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[var(--color-brand-cyan)]" />
                <h3 className="font-mono text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Default Broker</h3>
              </div>
              <select
                value={broker.default}
                onChange={(e) => {
                  const updated = { default: e.target.value };
                  setBroker(updated);
                  saveKey('broker_preference', updated);
                }}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] font-mono focus:outline-none focus:border-[var(--color-brand-cyan)]"
              >
                {BROKERS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Alert Preferences */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
              <h3 className="font-mono text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Out-of-Band Notification Preferences</h3>
              <p className="text-[var(--text-muted)] font-mono text-[11px]">
                Configures trade execution reports and margin breach alerts. Not required for app access.
              </p>
              <div className="space-y-3">
                {([['email', 'Email Execution Alerts'], ['push', 'Push Notifications']] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer">
                    <span className="font-mono text-sm text-[var(--text-main)]">{label}</span>
                    <div
                      onClick={() => {
                        const updated = { ...alerts, [key]: !alerts[key] };
                        setAlerts(updated);
                        saveKey('alert_preferences', updated);
                      }}
                      className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${alerts[key] ? 'bg-[var(--color-brand-cyan)]' : 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${alerts[key] ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg px-4 py-2 font-mono text-xs text-[var(--color-brand-green)] shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
            {toast}
          </div>
        )}

        {saving && (
          <p className="text-[var(--text-muted)] font-mono text-xs text-right">Saving...</p>
        )}
      </div>
    </div>
  );
}

