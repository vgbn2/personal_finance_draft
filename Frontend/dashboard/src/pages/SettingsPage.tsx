import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
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

export default function SettingsPage({ session }: Props) {
  const [risk, setRisk] = useState<RiskThresholds>({ max_position_pct: 0.05, max_drawdown_pct: 0.15 });
  const [broker, setBroker] = useState<BrokerPreference>({ default: 'alpaca' });
  const [alerts, setAlerts] = useState<AlertPreferences>({ email: true, push: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

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
          <h2 className="text-lg font-heading font-bold text-[var(--text-main)]">Settings</h2>
          <p className="text-[var(--text-muted)] font-mono text-xs">{session.user.email}</p>
        </div>

        {loading ? (
          <p className="text-[var(--text-muted)] font-mono text-sm animate-pulse">Loading config...</p>
        ) : (
          <>
            {/* Risk Thresholds */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
              <h3 className="font-mono text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Risk Thresholds</h3>

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
                    className="w-full accent-[var(--color-brand-cyan)]"
                  />
                </div>
              </div>
            </div>

            {/* Broker Preference */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-4">
              <h3 className="font-mono text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Default Broker</h3>
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
              <h3 className="font-mono text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Alert Preferences</h3>
              <div className="space-y-3">
                {([['email', 'Email alerts'], ['push', 'Push notifications']] as const).map(([key, label]) => (
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
