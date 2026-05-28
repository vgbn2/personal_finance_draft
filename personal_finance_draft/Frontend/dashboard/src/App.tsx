/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { OverviewPanel } from './components/panels/OverviewPanel';
import { SignalPanel } from './components/panels/SignalPanel';
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
          
          {/* Missing view placeholders */}
          {['market_intel', 'backtest', 'quote_health', 'audit_log'].includes(activeTab) && (
            <div className="flex-1 flex items-center justify-center p-8 text-[var(--text-muted)] animate-in fade-in duration-500">
              <div className="text-center font-mono border border-dashed border-[var(--border-focus)] p-8 rounded bg-[var(--bg-secondary)]">
                <p className="text-xs uppercase tracking-widest mb-1">Module Offline</p>
                <p className="text-[10px] opacity-70">Awaiting C++ Core hydration for {activeTab.replace('_', ' ')}.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

