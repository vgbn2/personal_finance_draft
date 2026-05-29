import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { ShieldCheck, Calendar, Info, AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AuditEvent {
  id: string;
  created_at: string;
  event_type: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  metadata: any;
}

export function AuditLogPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('audit_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
          
        if (error) throw error;
        setEvents(data || []);
      } catch (err) {
        console.error('Failed to fetch audit events', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();

    if (supabase) {
      const channel = supabase.channel('audit_log_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_events' }, payload => {
          setEvents(prev => [payload.new as AuditEvent, ...prev].slice(0, 100));
        })
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'info': return 'text-[var(--color-brand-cyan)]';
      case 'warn': return 'text-[var(--color-brand-amber)]';
      case 'error': return 'text-[var(--color-brand-red)]';
      case 'critical': return 'text-red-500 animate-pulse';
      default: return 'text-[var(--text-muted)]';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'info': return <Info className="w-4 h-4 text-[var(--color-brand-cyan)]" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-[var(--color-brand-amber)]" />;
      case 'error': return <ShieldAlert className="w-4 h-4 text-[var(--color-brand-red)]" />;
      case 'critical': return <ShieldAlert className="w-4 h-4 text-red-500" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 animate-in slide-in-from-bottom-2 duration-300">
      
      <div className="flex items-center justify-between bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4 rounded-xl shadow-sm">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-3 h-3" /> System Trace
          </span>
          <span className="font-heading text-sm font-bold text-[var(--text-main)]">
            Immutable Audit Ledger
          </span>
        </div>
      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl relative flex flex-col overflow-hidden shadow-sm">
        <div className="h-10 border-b border-slate-800 flex items-center px-5 gap-3 bg-slate-800/50 shrink-0 justify-between">
           <div className="flex items-center gap-2">
             <Calendar className="w-4 h-4 text-[var(--color-brand-green)]" />
             <span className="font-mono text-[10px] text-slate-400 tracking-widest uppercase">Chronological Event Stream</span>
           </div>
           <div className="w-2 h-2 rounded-full bg-[var(--color-brand-cyan)] animate-pulse shadow-[0_0_8px_var(--color-brand-cyan)]" />
        </div>
        
        <div className="flex-1 p-0 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center font-mono text-[10px] text-[var(--text-faint)]">
              Hydrating audit ledger...
            </div>
          ) : !supabase ? (
            <div className="p-8 text-center font-mono text-[10px] text-red-400">
              Supabase client not configured. Audit events unavailable.
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center font-mono text-[10px] text-[var(--text-faint)]">
              No audit events found.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 w-48 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString()}
                    </td>
                    <td className="p-4 w-12 text-center">
                      {getSeverityIcon(event.severity)}
                    </td>
                    <td className="p-4 font-mono text-xs">
                      <span className={cn("font-bold tracking-widest uppercase mr-3", getSeverityColor(event.severity))}>
                        [{event.event_type}]
                      </span>
                      <span className="text-slate-300 whitespace-pre-wrap font-sans text-sm">
                        {JSON.stringify(event.metadata)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
