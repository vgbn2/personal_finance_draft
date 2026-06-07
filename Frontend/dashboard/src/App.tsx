/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { OverviewPanel } from './components/panels/OverviewPanel';
import { SignalPanel } from './components/panels/SignalPanel';
import TelemetryPanel from './components/panels/TelemetryPanel';
import { MarketIntelPanel } from './components/panels/MarketIntelPanel';
import { BacktestPanel } from './components/panels/BacktestPanel';
import { QuoteHealthPanel } from './components/panels/QuoteHealthPanel';
import { AuditLogPanel } from './components/panels/AuditLogPanel';
import { SigmaBandPanel } from './components/panels/SigmaBandPanel';
import { BotPanel } from './components/panels/BotPanel';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import { TabId } from './types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-[var(--text-muted)] font-mono text-sm animate-pulse">Initializing...</div>
      </div>
    );
  }

  if (!session && supabase) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[var(--bg-primary)]">
      <TopBar activeTab={activeTab} onTabChange={setActiveTab} session={session} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 relative overflow-hidden flex flex-col bg-[var(--bg-primary)]">
          {activeTab === 'overview' && <OverviewPanel />}
          {activeTab === 'signals' && <SignalPanel />}
          {activeTab === 'market_intel' && <MarketIntelPanel />}
          {activeTab === 'backtest' && <BacktestPanel />}
          {activeTab === 'quote_health' && <QuoteHealthPanel />}
          {activeTab === 'audit_log' && <AuditLogPanel />}
          {activeTab === 'sigma_band' && <SigmaBandPanel />}
          {activeTab === 'bot' && <BotPanel />}
          {activeTab === 'settings' && <SettingsPage session={session} />}
          {activeTab === 'telemetry' && (
            <div className="flex-1 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <TelemetryPanel />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
