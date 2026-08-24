import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS, getAuthHeaders } from '../../lib/api';
import { BotPosition } from '../../types';
import { cn } from '../../lib/utils';

type SubTab = 'images' | 'logs' | 'positions';

interface DockerImage {
  Repository: string;
  Tag: string;
  ID: string;
  Size: string;
  CreatedSince: string;
  Containers: string;
}

interface DockerContainer {
  Names: string;
  Status: string;
  Image: string;
}

export function InfraPanel() {
  const [sub, setSub] = useState<SubTab>('images');

  // images + containers
  const [images, setImages] = useState<DockerImage[]>([]);
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imagesError, setImagesError] = useState<string | null>(null);

  // logs
  const [selectedContainer, setSelectedContainer] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // positions
  const [positions, setPositions] = useState<BotPosition[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  async function fetchImages() {
    setImagesLoading(true);
    setImagesError(null);
    try {
      const res = await fetch(`${API_ENDPOINTS.INFRA}?resource=images`, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (data.ok) {
        setImages(Array.isArray(data.images) ? data.images : []);
        setContainers(Array.isArray(data.containers) ? data.containers : []);
      } else {
        setImagesError(data.error ?? 'Failed to load docker info');
      }
    } catch (e: any) {
      setImagesError(e.message);
    } finally {
      setImagesLoading(false);
    }
  }

  async function fetchLogs(container: string) {
    if (!container) return;
    setLogsLoading(true);
    setLogsError(null);
    setLogs([]);
    try {
      const res = await fetch(`${API_ENDPOINTS.INFRA}?resource=logs&container=${encodeURIComponent(container)}&lines=200`, {
        headers: await getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.logs)) setLogs(data.logs);
      else setLogsError(data.logs?.error ?? data.error ?? 'Failed to fetch logs');
    } catch (e: any) {
      setLogsError(e.message);
    } finally {
      setLogsLoading(false);
    }
  }

  async function fetchPositions() {
    setPosLoading(true);
    setPosError(null);
    try {
      const res = await fetch(API_ENDPOINTS.BOT_STATUS, { headers: await getAuthHeaders() });
      const data = await res.json();
      if (data.ok) setPositions(data.positions ?? []);
      else setPosError(data.error ?? 'Failed to load positions');
    } catch (e: any) {
      setPosError(e.message);
    } finally {
      setPosLoading(false);
    }
  }

  useEffect(() => { fetchImages(); }, []);

  function handleSubTab(t: SubTab) {
    setSub(t);
    if (t === 'positions' && positions.length === 0 && !posLoading) fetchPositions();
  }

  const tabCls = (t: SubTab) =>
    cn('px-4 py-1.5 text-xs font-mono rounded-sm transition-colors',
      sub === t
        ? 'bg-[var(--color-brand-cyan)] text-black'
        : 'text-[var(--text-muted)] hover:text-[var(--text-main)]');

  return (
    <div className="flex-1 flex flex-col p-6 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-sm font-semibold text-[var(--text-main)] tracking-wider uppercase">Infra</h2>
        <div className="flex gap-1 ml-4">
          {(['images', 'logs', 'positions'] as SubTab[]).map((t) => (
            <button key={t} type="button" className={tabCls(t)} onClick={() => handleSubTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ml-auto text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
          onClick={() => sub === 'images' ? fetchImages() : sub === 'logs' ? fetchLogs(selectedContainer) : fetchPositions()}
        >
          ↻ refresh
        </button>
      </div>

      {/* Images + Containers */}
      {sub === 'images' && (
        <div className="flex-1 overflow-auto flex flex-col gap-4">
          {imagesLoading && <p className="text-xs font-mono text-[var(--text-muted)] animate-pulse">Loading...</p>}
          {imagesError && <p className="text-xs font-mono text-red-400">{imagesError}</p>}
          {!imagesLoading && !imagesError && (
            <>
              <section>
                <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  Images ({images.length})
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        {['Repository', 'Tag', 'ID', 'Size', 'Age', 'Containers'].map((h) => (
                          <th key={h} className="text-left py-1 pr-4 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {images.map((img, i) => (
                        <tr key={i} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]">
                          <td className="py-1 pr-4 text-[var(--text-main)]">{img.Repository || '<none>'}</td>
                          <td className="py-1 pr-4 text-[var(--color-brand-cyan)]">{img.Tag || '<none>'}</td>
                          <td className="py-1 pr-4 text-[var(--text-muted)]">{img.ID?.slice(0, 12)}</td>
                          <td className="py-1 pr-4">{img.Size}</td>
                          <td className="py-1 pr-4 text-[var(--text-muted)]">{img.CreatedSince}</td>
                          <td className="py-1 pr-4">{img.Containers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest mb-2">
                  Running containers ({containers.length})
                </p>
                {containers.length === 0
                  ? <p className="text-xs font-mono text-[var(--text-muted)]">No running containers</p>
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono border-collapse">
                        <thead>
                          <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                            {['Name', 'Image', 'Status'].map((h) => (
                              <th key={h} className="text-left py-1 pr-4 font-normal">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {containers.map((c, i) => (
                            <tr key={i} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]">
                              <td className="py-1 pr-4 text-[var(--text-main)]">{c.Names}</td>
                              <td className="py-1 pr-4 text-[var(--text-muted)]">{c.Image}</td>
                              <td className={cn('py-1 pr-4', c.Status?.startsWith('Up') ? 'text-green-400' : 'text-amber-400')}>
                                {c.Status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </section>
            </>
          )}
        </div>
      )}

      {/* Logs */}
      {sub === 'logs' && (
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <div className="flex gap-2 items-center">
            <select
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs font-mono text-[var(--text-main)] px-2 py-1"
              value={selectedContainer}
              onChange={(e) => { setSelectedContainer(e.target.value); fetchLogs(e.target.value); }}
            >
              <option value="">— select container —</option>
              {containers.map((c) => (
                <option key={c.Names} value={c.Names.replace(/^\//, '')}>{c.Names}</option>
              ))}
            </select>
            {logsLoading && <span className="text-xs font-mono text-[var(--text-muted)] animate-pulse">Loading...</span>}
            {logsError && <span className="text-xs font-mono text-red-400">{logsError}</span>}
          </div>
          <div className="flex-1 overflow-auto bg-[var(--bg-secondary)] rounded border border-[var(--border-subtle)] p-3">
            {logs.length === 0 && !logsLoading
              ? <p className="text-xs font-mono text-[var(--text-muted)]">Select a container to view logs.</p>
              : logs.map((line, i) => (
                <div key={i} className={cn(
                  'text-[11px] font-mono leading-5',
                  /error|err|fail/i.test(line) ? 'text-red-400' :
                  /warn/i.test(line) ? 'text-amber-400' : 'text-[var(--text-muted)]'
                )}>{line}</div>
              ))
            }
          </div>
        </div>
      )}

      {/* Positions */}
      {sub === 'positions' && (
        <div className="flex-1 overflow-auto">
          {posLoading && <p className="text-xs font-mono text-[var(--text-muted)] animate-pulse">Loading...</p>}
          {posError && <p className="text-xs font-mono text-red-400">{posError}</p>}
          {!posLoading && !posError && (
            positions.length === 0
              ? <p className="text-xs font-mono text-[var(--text-muted)]">No open positions.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono border-collapse">
                    <thead>
                      <tr className="text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                        {['Slug', 'Side', 'Shares', 'Entry', 'Fill', 'Target', 'Stop', 'Age'].map((h) => (
                          <th key={h} className="text-left py-1 pr-4 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => {
                        const ms = Date.now() - new Date(p.entryTimestamp).getTime();
                        const age = Math.floor(ms / 3600000) > 0
                          ? `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`
                          : `${Math.floor(ms / 60000)}m`;
                        return (
                          <tr key={p.positionId} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]">
                            <td className="py-1 pr-4 text-[var(--text-main)] max-w-[200px] truncate">{p.slug}</td>
                            <td className={cn('py-1 pr-4 font-bold', p.side === 'YES' ? 'text-green-400' : 'text-red-400')}>{p.side}</td>
                            <td className="py-1 pr-4">{p.shares}</td>
                            <td className="py-1 pr-4">{(p.entryPrice * 100).toFixed(1)}¢</td>
                            <td className="py-1 pr-4">{(p.fillPrice * 100).toFixed(1)}¢</td>
                            <td className="py-1 pr-4 text-green-400">{(p.targetPrice * 100).toFixed(1)}¢</td>
                            <td className="py-1 pr-4 text-red-400">{(p.stopPrice * 100).toFixed(1)}¢</td>
                            <td className="py-1 pr-4 text-[var(--text-muted)]">{age}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}
