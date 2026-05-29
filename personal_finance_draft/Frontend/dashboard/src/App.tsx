/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { OverviewPanel } from './components/panels/OverviewPanel';
import { SignalPanel } from './components/panels/SignalPanel';
import TelemetryPanel from './components/panels/TelemetryPanel';
import { MarketIntelPanel } from './components/panels/MarketIntelPanel';
import { BacktestPanel } from './components/panels/BacktestPanel';
import { QuoteHealthPanel } from './components/panels/QuoteHealthPanel';
import { AuditLogPanel } from './components/panels/AuditLogPanel';
import { TabId } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[var(--bg-primary)]">
      <TopBar activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 relative overflow-hidden flex flex-col bg-[var(--bg-primary)]">
          {activeTab === 'overview' && <OverviewPanel />}
          {activeTab === 'signals' && <SignalPanel />}
          {activeTab === 'market_intel' && <MarketIntelPanel />}
          {activeTab === 'backtest' && <BacktestPanel />}
          {activeTab === 'quote_health' && <QuoteHealthPanel />}
          {activeTab === 'audit_log' && <AuditLogPanel />}
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

