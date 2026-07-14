import React, { useEffect, useState } from 'react';
import { Activity, Bot, Database, GitMerge, LayoutDashboard, LineChart, LogOut, Menu, Server, Settings, User, Lock, Unlock, TrendingUp, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { TabId } from '../../types';
import { cn } from '../../lib/utils';
import { subscribeToOrders } from '../../lib/supabase';

interface TopBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  session: Session | null;
  onLogout: () => Promise<boolean>;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
}

function SafetyLock() {
  const [isBreached, setIsBreached] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToOrders((payload) => {
      if (payload.new?.status === 'risk_rejected') {
        setIsBreached(true);
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className={cn(
      "flex items-center gap-2 border rounded-full px-3 py-1 h-8 transition-all duration-500",
      isBreached
        ? "bg-red-950/30 border-red-500/50 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.2)]"
        : "bg-slate-800/50 border-slate-700 text-slate-400"
    )}>
      {isBreached ? <Lock className="w-3 h-3 animate-pulse" /> : <Unlock className="w-3 h-3" />}
      <span className="font-mono text-[9px] font-bold tracking-widest uppercase">
        {isBreached ? 'Safety Engaged' : 'Safety Lock'}
      </span>
    </div>
  );
}

const TABS: { id: TabId; label: string; number: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', number: '01', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'signals', label: 'Signals', number: '02', icon: <Activity className="w-4 h-4" /> },
  { id: 'market_intel', label: 'Market Intel', number: '03', icon: <LineChart className="w-4 h-4" /> },
  { id: 'backtest', label: 'Backtest Ledger', number: '04', icon: <GitMerge className="w-4 h-4" /> },
  { id: 'quote_health', label: 'Quote Health', number: '05', icon: <Database className="w-4 h-4" /> },
  { id: 'audit_log', label: 'Audit Log', number: '06', icon: <Server className="w-4 h-4" /> },
  { id: 'telemetry', label: 'Telemetry', number: '07', icon: <Activity className="w-4 h-4" /> },
  { id: 'sigma_band', label: 'Sigma Band', number: '08', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'bot',        label: 'Edge Bot',   number: '09', icon: <Bot className="w-4 h-4" /> },
  { id: 'settings',   label: 'Settings',   number: '10', icon: <Settings className="w-4 h-4" /> },
];

export function TopBar({ activeTab, onTabChange, session, onLogout, sidebarOpen, onSidebarToggle }: TopBarProps) {
  const userEmail = session?.user?.email ?? null;
  const [logoutFailed, setLogoutFailed] = useState(false);

  async function handleLogout() {
    setLogoutFailed(!(await onLogout()));
  }

  return (
    <header className="dashboard-topbar bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex items-center justify-between px-6 z-[1000] sticky top-0 shrink-0">
      {/* Brand Slot */}
      <div className="dashboard-topbar-left flex items-center gap-6 min-w-0">
        <div className="dashboard-brand flex items-center gap-3 font-heading font-bold text-lg tracking-tight text-[var(--text-main)] whitespace-nowrap">
          <button
            type="button"
            className="dashboard-sidebar-toggle"
            aria-controls="dashboard-sidebar"
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? 'Close research controls' : 'Open research controls'}
            onClick={onSidebarToggle}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          Sovereign <em className="not-italic text-[var(--color-brand-cyan)] font-normal">Research OS</em>
        </div>

        {/* Global Tab Navigation */}
        <nav aria-label="Dashboard views" className="dashboard-tabs flex items-center h-full min-w-0 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "dashboard-tab h-14 px-4 flex items-center gap-2 text-sm font-medium transition-colors border-b-2 shrink-0",
                  isActive
                    ? "border-[var(--color-brand-cyan)] text-[var(--color-brand-cyan)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-tertiary)]"
                )}
              >
                <span className="font-mono text-xs opacity-60">[{tab.number}]</span>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global Actions & Auth */}
      <div className="dashboard-actions flex items-center gap-4 shrink-0">
        <div className="dashboard-aux-actions flex items-center gap-3 pr-4 border-r border-[var(--border-subtle)]">
          <SafetyLock />
          <button className="btn-ghost py-1.5 h-8">Ingest Snapshot</button>
          <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-full px-3 py-1 h-8">
            <div className="w-2 h-2 rounded-full bg-[var(--color-brand-green)] shadow-[0_0_8px_var(--color-brand-green)] animate-pulse" />
            <span className="font-mono text-[10px] font-bold text-[var(--color-brand-green)] tracking-wider">LIVE</span>
          </div>
        </div>

        {/* User */}
        <div className="flex items-center gap-2 text-[var(--text-muted)]">
          <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <span className="text-xs font-mono hidden xl:inline max-w-[140px] truncate">
            {userEmail ?? 'Guest'}
          </span>
          {userEmail && (
            <button
              onClick={handleLogout}
              title={logoutFailed ? 'Sign out failed; session is still active' : 'Sign out'}
              className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
