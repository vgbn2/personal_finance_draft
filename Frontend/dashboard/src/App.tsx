/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { clearLocalSession, restoreVerifiedSession, verifySession } from './lib/session';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { OverviewPanel } from './components/panels/OverviewPanel';
import LoginPage from './pages/LoginPage';
import { TabId } from './types';

const SignalPanel = lazy(() => import('./components/panels/SignalPanel').then((module) => ({ default: module.SignalPanel })));
const TelemetryPanel = lazy(() => import('./components/panels/TelemetryPanel'));
const MarketIntelPanel = lazy(() => import('./components/panels/MarketIntelPanel').then((module) => ({ default: module.MarketIntelPanel })));
const BacktestPanel = lazy(() => import('./components/panels/BacktestPanel').then((module) => ({ default: module.BacktestPanel })));
const QuoteHealthPanel = lazy(() => import('./components/panels/QuoteHealthPanel').then((module) => ({ default: module.QuoteHealthPanel })));
const AuditLogPanel = lazy(() => import('./components/panels/AuditLogPanel').then((module) => ({ default: module.AuditLogPanel })));
const SigmaBandPanel = lazy(() => import('./components/panels/SigmaBandPanel').then((module) => ({ default: module.SigmaBandPanel })));
const BotPanel = lazy(() => import('./components/panels/BotPanel').then((module) => ({ default: module.BotPanel })));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    let revision = 0;

    const applyVerifiedSession = async (candidate: Session | null) => {
      const currentRevision = ++revision;
      const result = await verifySession(supabase.auth, candidate);
      if (active && currentRevision === revision) {
        setSession(result.session);
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, nextSession) => {
      void applyVerifiedSession(nextSession);
    });
    const restoreRevision = ++revision;
    void restoreVerifiedSession(supabase.auth).then((result) => {
      if (active && restoreRevision === revision) {
        setSession(result.session);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    if (!supabase) return true;
    const cleared = await clearLocalSession(supabase.auth);
    if (cleared) setSession(null);
    return cleared;
  }

  function handleTabChange(tab: TabId) {
    setActiveTab(tab);
    setSidebarOpen(false);
  }

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
    <div className="dashboard-shell h-screen w-full flex flex-col overflow-hidden bg-[var(--bg-primary)]">
      <TopBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        session={session}
        onLogout={handleLogout}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((open) => !open)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {sidebarOpen && (
          <button
            type="button"
            className="dashboard-sidebar-overlay"
            aria-label="Close research controls"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="dashboard-main flex-1 relative overflow-hidden flex flex-col bg-[var(--bg-primary)]">
          <Suspense fallback={<div className="flex-1 grid place-items-center font-mono text-sm text-[var(--text-muted)]">Loading panel...</div>}>
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
          </Suspense>
        </main>
      </div>
    </div>
  );
}
