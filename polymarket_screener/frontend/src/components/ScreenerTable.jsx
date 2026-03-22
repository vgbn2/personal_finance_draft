import React from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap } from 'lucide-react';

const SignalBadge = ({ signal }) => {
  const styles = {
    STRONG_BUY: 'bg-brand-green/10 text-brand-green border-brand-green/30',
    BUY: 'bg-brand-green/5 text-brand-green/80 border-brand-green/20',
    NEUTRAL: 'bg-bg-3 text-text-muted border-border',
    SELL: 'bg-brand-red/5 text-brand-red/80 border-brand-red/20',
    STRONG_SELL: 'bg-brand-red/10 text-brand-red border-brand-red/30',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${styles[signal] || styles.NEUTRAL}`}>
      {signal}
    </span>
  );
};

export default function ScreenerTable({ markets = [] }) {
  return (
    <div className="overflow-hidden glass-panel">
      <div className="px-4 py-3 border-bottom border-border-dim flex justify-between items-center bg-bg-1/50">
        <h3 className="text-xs font-display font-semibold text-text uppercase tracking-wider flex items-center gap-2">
          <Activity size={14} className="text-brand-green" />
          Live Market Screener
        </h3>
        <span className="text-[10px] text-text-dim font-mono">{markets.length} Markets Active</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-dim bg-bg-2/30">
              <th className="px-4 py-2 text-[9px] font-semibold text-text-dim uppercase tracking-widest">Market</th>
              <th className="px-4 py-2 text-[9px] font-semibold text-text-dim uppercase tracking-widest text-right">Price</th>
              <th className="px-4 py-2 text-[9px] font-semibold text-text-dim uppercase tracking-widest text-right">Vol (24h)</th>
              <th className="px-4 py-2 text-[9px] font-semibold text-text-dim uppercase tracking-widest text-center">Signal</th>
              <th className="px-4 py-2 text-[9px] font-semibold text-text-dim uppercase tracking-widest">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/30">
            <AnimatePresence mode="popLayout">
              {markets.map((m) => (
                <Motion.tr 
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                  className="group cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-text group-hover:text-brand-green transition-colors">{m.label}</span>
                      <span className="text-[9px] text-text-dim font-mono uppercase truncate max-w-[150px]">{m.id}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Motion.span 
                      key={m.price}
                      initial={{ color: '#00ff87' }}
                      animate={{ color: '#e8e8e8' }}
                      className="text-xs font-mono font-medium"
                    >
                      ${m.price?.toFixed(3)}
                    </Motion.span>
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-text-muted font-mono">
                    ${(m.volume_24h / 1000).toFixed(1)}k
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SignalBadge signal={m.signal} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {m.trend?.slice(-5).map((t, i) => (
                        <div 
                          key={i} 
                          className="w-1 bg-brand-green/30 rounded-full" 
                          style={{ height: `${Math.max(4, t * 20)}px` }}
                        />
                      ))}
                      <Zap size={10} className="ml-1 text-brand-amber animate-pulse" />
                    </div>
                  </td>
                </Motion.tr>
              ))}
            </AnimatePresence>
            {markets.length === 0 && (
              <tr>
                <td colSpan="5" className="px-4 py-12 text-center text-text-dim text-xs italic font-mono">
                  Awaiting STATE_SYNC from backend...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
