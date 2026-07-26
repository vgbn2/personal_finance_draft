import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Terminal as TerminalIcon, Wifi, WifiOff } from 'lucide-react';
import { API_BASE_URL, socketAuthProvider } from '../../lib/api';

interface LogEntry {
  timestamp: string;
  msg: string;
  level?: 'info' | 'warn' | 'error';
}

const TelemetryPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(API_BASE_URL, { auth: socketAuthProvider });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      addLog({ msg: 'WebSocket connected to backend', level: 'info' });
    });

    socket.on('connect_error', (error) => {
      setConnected(false);
      addLog({ msg: `WebSocket unavailable: ${error.message}`, level: 'warn' });
    });

    socket.on('disconnect', () => {
      setConnected(false);
      addLog({ msg: 'WebSocket disconnected', level: 'warn' });
    });

    socket.on('status', (data: any) => {
      addLog({ msg: data.msg, level: 'info' });
    });

    socket.on('telemetry', (data: any) => {
      addLog(data);
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const addLog = (entry: Partial<LogEntry>) => {
    const newEntry: LogEntry = {
      timestamp: entry.timestamp || new Date().toISOString(),
      msg: entry.msg || '',
      level: entry.level || 'info'
    };
    setLogs(prev => [...prev.slice(-99), newEntry]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-card)] rounded-lg border border-[var(--border-muted)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-muted)]">
        <div className="flex items-center gap-2">
          <TerminalIcon size={16} className="text-[var(--text-faint)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)]">Real-time Telemetry</span>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <div className="flex items-center gap-1 text-[var(--cyan)]">
              <Wifi size={12} />
              <span className="text-[10px] font-mono">LIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[var(--red)]">
              <WifiOff size={12} />
              <span className="text-[10px] font-mono">OFFLINE</span>
            </div>
          )}
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 p-4 font-mono text-[11px] overflow-y-auto space-y-1 selection:bg-[var(--cyan)] selection:text-[var(--bg-main)]"
      >
        {logs.length === 0 && (
          <div className="text-[var(--text-faint)] italic">Waiting for telemetry data...</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-[var(--text-faint)] shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
            <span className={
              log.level === 'error' ? 'text-[var(--red)]' : 
              log.level === 'warn' ? 'text-[var(--amber)]' : 
              'text-[var(--text-main)]'
            }>
              {log.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TelemetryPanel;
