const WebSocket = require('ws');

export const POLYBOLT_URL = 'wss://ws-live-data.polymarket.com';
export type PolymarketBookState = 'INVALID_AWAITING_SNAPSHOT' | 'SYNCHRONIZED';

export interface PolyBoltSnapshotResult {
  ok: boolean;
  book?: unknown;
  error?: string;
}

export type PolyBoltSnapshotFetcher = (assetId: string) => Promise<PolyBoltSnapshotResult>;

export interface PolyBoltMonitorOptions {
  fetchSnapshot: PolyBoltSnapshotFetcher;
  url?: string;
  reconnectDelay?: (closeCode: number) => number | null;
  log?: Pick<Console, 'warn' | 'error'>;
}

interface AssetStatus {
  state: PolymarketBookState;
  bbo?: { best_bid: string; best_ask: string; hash?: string; timestamp?: number };
  book?: unknown;
  error?: string;
}

export interface PolyBoltMonitorStatus {
  connected: boolean;
  recovering: boolean;
  lastSeq: number | null;
  assets: Record<string, AssetStatus>;
}

export interface PolyBoltMonitor {
  setAssetIds(assetIds: string[]): Promise<void>;
  getStatus(): PolyBoltMonitorStatus;
  stop(): void;
}

export function reconnectDelayMs(closeCode: number, random = Math.random): number | null {
  if (closeCode === 4008) return null;
  if (closeCode === 4003) return Math.floor(random() * 10_001);
  return 1_000;
}

function normalizedAssetIds(assetIds: string[]): string[] {
  const unique = [...new Set(assetIds.map((assetId) => String(assetId || '').trim()).filter(Boolean))];
  if (unique.length > 64) {
    throw new Error(`PolyBolt supports at most 64 active subscriptions, received ${unique.length}`);
  }
  return unique.sort();
}

function sameAssetIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((assetId, index) => assetId === right[index]);
}

export function startPolyBoltBboMonitor(options: PolyBoltMonitorOptions): PolyBoltMonitor {
  if (typeof options.fetchSnapshot !== 'function') {
    throw new Error('PolyBolt monitor requires fetchSnapshot');
  }

  const url = options.url || POLYBOLT_URL;
  const resolveReconnectDelay = options.reconnectDelay || reconnectDelayMs;
  const log = options.log || console;
  const assets = new Map<string, AssetStatus>();
  let desiredAssetIds: string[] = [];
  let socket: any = null;
  let connectionGeneration = 0;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let recoveryPromise: Promise<void> | null = null;
  let connected = false;
  let recovering = false;
  let stopped = false;
  let lastSeq: number | null = null;

  function clearReconnectTimer(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function invalidateAll(error?: string): void {
    for (const assetId of desiredAssetIds) {
      assets.set(assetId, {
        state: 'INVALID_AWAITING_SNAPSHOT',
        ...(error ? { error } : {}),
      });
    }
  }

  function disconnect(): void {
    connectionGeneration += 1;
    connected = false;
    lastSeq = null;
    clearReconnectTimer();
    const activeSocket = socket;
    socket = null;
    if (!activeSocket) return;
    try {
      activeSocket.removeAllListeners();
      activeSocket.close();
    } catch {
      try { activeSocket.terminate(); } catch {}
    }
  }

  function subscribe(activeSocket: any): void {
    activeSocket.send(JSON.stringify({
      op: 'subscribe',
      rid: `polybolt-${Date.now()}`,
      subscriptions: desiredAssetIds.map((assetId) => ({
        channel: 'price.polymarket',
        filter: { asset_id: assetId },
      })),
    }));
  }

  function scheduleRecovery(closeCode: number): void {
    const delay = resolveReconnectDelay(closeCode);
    invalidateAll(delay === null ? `PolyBolt closed with terminal code ${closeCode}` : undefined);
    if (delay === null || stopped || desiredAssetIds.length === 0) return;
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void recoverAndReconnect();
    }, delay);
  }

  function connect(): void {
    if (stopped || desiredAssetIds.length === 0) return;
    const generation = ++connectionGeneration;
    const nextSocket = new WebSocket(url);
    socket = nextSocket;
    lastSeq = null;

    nextSocket.on('open', () => {
      if (stopped || generation !== connectionGeneration) return;
      connected = true;
      subscribe(nextSocket);
    });

    nextSocket.on('message', (raw: any) => {
      if (stopped || generation !== connectionGeneration) return;
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (message?.channel !== 'price.polymarket' || !Number.isInteger(message?.seq)) return;
      if (lastSeq !== null && message.seq !== lastSeq + 1) {
        log.warn(`PolyBolt sequence gap: expected ${lastSeq + 1}, received ${message.seq}`);
        void recoverAndReconnect();
        return;
      }
      lastSeq = message.seq;
      const payload = message.payload;
      const assetId = String(payload?.asset_id || '');
      const current = assets.get(assetId);
      if (!current || !desiredAssetIds.includes(assetId)) return;
      assets.set(assetId, {
        ...current,
        bbo: {
          best_bid: String(payload.best_bid ?? ''),
          best_ask: String(payload.best_ask ?? ''),
          ...(payload.hash ? { hash: String(payload.hash) } : {}),
          ...(Number.isFinite(Number(payload.timestamp)) ? { timestamp: Number(payload.timestamp) } : {}),
        },
      });
    });

    nextSocket.on('close', (code: number) => {
      if (stopped || generation !== connectionGeneration) return;
      socket = null;
      connected = false;
      lastSeq = null;
      scheduleRecovery(code);
    });

    nextSocket.on('error', (error: Error) => {
      if (generation === connectionGeneration) {
        log.error(`PolyBolt socket error: ${error.message}`);
      }
    });
  }

  async function recoverAndReconnect(): Promise<void> {
    if (recoveryPromise) return recoveryPromise;
    if (stopped || desiredAssetIds.length === 0) return;

    const recoveryAssetIds = [...desiredAssetIds];
    recovering = true;
    invalidateAll();
    disconnect();
    const recoveryGeneration = connectionGeneration;

    recoveryPromise = (async () => {
      const results = await Promise.allSettled(
        recoveryAssetIds.map(async (assetId) => ({ assetId, result: await options.fetchSnapshot(assetId) })),
      );
      if (stopped || recoveryGeneration !== connectionGeneration) return;

      for (const settled of results) {
        if (settled.status === 'fulfilled') {
          const { assetId, result } = settled.value;
          assets.set(assetId, result.ok && result.book !== undefined
            ? { state: 'SYNCHRONIZED', book: result.book }
            : { state: 'INVALID_AWAITING_SNAPSHOT', error: result.error || 'REST snapshot unavailable' });
        } else {
          const message = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
          const assetId = recoveryAssetIds[results.indexOf(settled)];
          assets.set(assetId, { state: 'INVALID_AWAITING_SNAPSHOT', error: message });
        }
      }
      connect();
    })().finally(() => {
      recovering = false;
      recoveryPromise = null;
    });

    return recoveryPromise;
  }

  async function setAssetIds(assetIds: string[]): Promise<void> {
    const nextAssetIds = normalizedAssetIds(assetIds);
    if (sameAssetIds(nextAssetIds, desiredAssetIds)) return;

    desiredAssetIds = nextAssetIds;
    disconnect();
    assets.clear();
    invalidateAll();

    if (recoveryPromise) await recoveryPromise;
    if (stopped || desiredAssetIds.length === 0) return;
    await recoverAndReconnect();
  }

  function getStatus(): PolyBoltMonitorStatus {
    return {
      connected,
      recovering,
      lastSeq,
      assets: Object.fromEntries(
        [...assets.entries()].map(([assetId, status]) => [assetId, {
          ...status,
          ...(status.bbo ? { bbo: { ...status.bbo } } : {}),
        }]),
      ),
    };
  }

  function stop(): void {
    stopped = true;
    disconnect();
  }

  return { setAssetIds, getStatus, stop };
}
