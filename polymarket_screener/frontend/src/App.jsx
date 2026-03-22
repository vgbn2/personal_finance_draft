import React from 'react';
import { useSocket } from './hooks/useSocket';
import ScreenerTable from './components/ScreenerTable';
import { LayoutDashboard, Shield, TrendingUp, Info } from 'lucide-react';

export default function App() {
  const { state, connected } = useSocket('ws://localhost:8000/ws/state');

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-brand-green/30 flex flex-col">
      {/* Topbar Navigation Overlay */}
      <header className="h-12 border-b border-border bg-bg-1/80 backdrop-blur-md flex items-center px-6 sticky top-0 z-50 justify-between">
        <div className="flex items-center gap-6">
          <div className="font-display font-bold text-lg tracking-tighter text-white">
            POLY<span className="text-brand-green italic">/</span>SCREEN
            <small className="ml-2 text-[9px] font-mono font-normal text-text-dim">v0.2.0</small>
          </div>
          
          <nav className="hidden md:flex gap-4">
            {['Screener', 'Analytics', 'Risk', 'Portfolio'].map(tab => (
              <button key={tab} className={`text-[10px] uppercase tracking-widest font-medium transition-colors ${tab === 'Screener' ? 'text-brand-green neon-text-green' : 'text-text-dim hover:text-text'}`}>
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-sm border text-[10px] font-mono flex items-center gap-2 transition-all duration-500 ${connected ? 'bg-brand-green/5 border-brand-green/30 text-brand-green' : 'bg-brand-red/5 border-brand-red/30 text-brand-red animation-pulse'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-brand-green shadow-[0_0_8px_#00ff87]' : 'bg-brand-red transition-pulse'}`} />
            {connected ? 'WS: 127.0.0.1:8000' : 'WS: RECONNECTING'}
          </div>
          
          <div className="flex bg-bg-2 border border-border2 rounded-sm overflow-hidden">
            <button className="px-3 py-1 text-[9px] font-bold bg-brand-amber/10 text-brand-amber">● PAPER</button>
            <button className="px-3 py-1 text-[9px] font-bold text-text-dim hover:bg-bg-3">LIVE</button>
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Screener */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          <ScreenerTable markets={state.screener} />
          
          {/* Internal Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard 
              label="Portfolio Alpha" 
              value={`${state.portfolio.alpha.toFixed(2)}%`}
              sub="Vs Target Benchmark"
              icon={<TrendingUp size={14} className="text-brand-green" />}
            />
            <MetricCard 
              label="Survival Rate" 
              value={`${state.portfolio.survival_rate.toFixed(1)}%`}
              sub="Monte Carlo 10k Paths"
              icon={<Shield size={14} className="text-brand-blue" />}
            />
            <MetricCard 
              label="Risk Exposure" 
              value={state.risk.label}
              sub={`P(Error) = ${state.risk.black_swan_prob.toFixed(3)}`}
              icon={<Info size={14} style={{ color: state.risk.color_hex }} />}
              borderStyle={{ borderColor: `${state.risk.color_hex}33` }}
              valueStyle={{ color: state.risk.color_hex }}
            />
          </div>
        </section>

        {/* Right Column: Greeks & Engine State */}
        <aside className="lg:col-span-4 flex flex-col gap-4">
          <div className="glass-panel p-4 flex flex-col gap-4">
            <h3 className="text-[10px] font-semibold text-text-dim uppercase tracking-widest mb-2 border-b border-border shadow-sm pb-2">Active Greeks</h3>
            <div className="grid grid-cols-2 gap-4">
              <GreekItem label="Delta Δ" value={state.greeks.delta} sub="Directional" />
              <GreekItem label="Gamma Γ" value={state.greeks.gamma} sub="Sensitivity" />
              <GreekItem label="Theta Θ" value={state.greeks.theta} sub="Time Decay" />
              <GreekItem label="Vega V" value={state.greeks.vega} sub="Volatility" />
            </div>
          </div>

          <div className="glass-panel p-4 bg-brand-green/5 border-brand-green/20 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-2 opacity-20"><LayoutDashboard size={40} /></div>
             <h4 className="text-[10px] font-bold text-brand-green uppercase tracking-tighter mb-1">Engine Heartbeat</h4>
             <p className="text-[11px] text-text-muted leading-tight">Backend is streaming localized market state every 500ms. All safety gates (Global, Temporal, Conviction) are strictly enforced.</p>
          </div>
        </aside>
      </main>

      <footer className="h-8 border-t border-border bg-bg-1 flex items-center px-6 text-[9px] text-text-dim gap-6">
        <span>ENGINE <b className="text-brand-green font-bold">RUNNING</b></span>
        <span>UPTIME <b className="text-text-muted">00:42:12</b></span>
        <div className="flex-1" />
        <span className="flex items-center gap-2">
           <span className="w-1.5 h-1.5 rounded-full bg-brand-green shadow-[0_0_4px_#00ff87]" />
           STALE GUARD ACTIVE
        </span>
      </footer>
    </div>
  );
}

function MetricCard({ label, value, sub, icon, borderStyle = {}, valueStyle = {} }) {
  return (
    <div className="glass-panel p-4 flex flex-col gap-1 border-l-2 border-l-brand-green" style={borderStyle}>
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-semibold text-text-dim uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-xl font-display font-bold text-white" style={valueStyle}>{value}</div>
      <div className="text-[9px] text-text-dim font-mono">{sub}</div>
    </div>
  );
}

function GreekItem({ label, value, sub }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-text-dim font-mono uppercase">{label}</span>
      <span className="text-sm font-bold text-white">{value.toFixed(4)}</span>
      <span className="text-[8px] text-text-dim/60 font-medium">{sub}</span>
    </div>
  );
}
