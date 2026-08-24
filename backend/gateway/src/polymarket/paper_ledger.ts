import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LEDGER_SCHEMA_VERSION = 1;
export const GENESIS_CHECKSUM = '0'.repeat(64);
export const LEDGER_FILE = 'events.jsonl';
export const SNAPSHOT_FILE = 'portfolio.v1.json';
export const LOCK_FILE = 'ledger.lock';
export const LOCK_MAX_AGE_MS = 10 * 60 * 1000;

export interface LedgerEvent {
  schema_version: number;
  sequence: number;
  event_id: string;
  event_type: string;
  event_time: string;
  prior_checksum: string;
  event_checksum?: string;
  cash_after?: number;
  cash_delta?: number;
  fees?: number;
  slippage?: number;
  position?: any;
  paper_fill?: any;
  token_id?: string;
  realized_pnl?: number;
  [key: string]: any;
}

export interface LedgerProjection {
  virtual_balance: number;
  starting_balance: number;
  opened_at: string | null;
  updated_at: string | null;
  realized_pnl: number;
  total_fees: number;
  total_slippage: number;
  positions: any[];
  fills: any[];
  settlements: any[];
  sequence: number;
  last_checksum: string;
}

export function stableObject(value: any): any {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableObject(value[key])]),
  );
}

export function digest(value: any): string {
  return crypto.createHash('sha256').update(
    typeof value === 'string' ? value : JSON.stringify(stableObject(value)),
  ).digest('hex');
}

export function checksumEvent(event: LedgerEvent): string {
  const unsigned = { ...event };
  delete unsigned.event_checksum;
  return digest(unsigned);
}

export function ledgerPaths(storageDir: string) {
  return {
    ledger: path.join(storageDir, LEDGER_FILE),
    snapshot: path.join(storageDir, SNAPSHOT_FILE),
    lock: path.join(storageDir, LOCK_FILE),
  };
}

export function readLedger(storageDir: string): { ok: boolean; events: LedgerEvent[]; last_checksum: string; error?: string } {
  const { ledger } = ledgerPaths(storageDir);
  if (!fs.existsSync(ledger)) {
    return { ok: true, events: [], last_checksum: GENESIS_CHECKSUM };
  }
  const content = fs.readFileSync(ledger, 'utf8');
  if (content && !content.endsWith('\n')) {
    return { ok: false, error: 'paper ledger has a truncated final event', events: [], last_checksum: GENESIS_CHECKSUM };
  }
  const events: LedgerEvent[] = [];
  let priorChecksum = GENESIS_CHECKSUM;
  const lines = content.split('\n').filter(Boolean);
  for (let index = 0; index < lines.length; index++) {
    let event: LedgerEvent;
    try {
      event = JSON.parse(lines[index]);
    } catch {
      return { ok: false, error: `paper ledger event ${index + 1} is malformed`, events, last_checksum: priorChecksum };
    }
    if (event.schema_version !== LEDGER_SCHEMA_VERSION || event.sequence !== index + 1) {
      return { ok: false, error: `paper ledger sequence/schema mismatch at event ${index + 1}`, events, last_checksum: priorChecksum };
    }
    if (event.prior_checksum !== priorChecksum || event.event_checksum !== checksumEvent(event)) {
      return { ok: false, error: `paper ledger checksum mismatch at event ${index + 1}`, events, last_checksum: priorChecksum };
    }
    events.push(event);
    priorChecksum = event.event_checksum!;
  }
  return { ok: true, events, last_checksum: priorChecksum };
}

export function replayLedger(events: LedgerEvent[], fallbackBalance = 100): LedgerProjection {
  let startingBalance = fallbackBalance;
  let cash = fallbackBalance;
  let openedAt: string | null = null;
  let updatedAt: string | null = null;
  let realizedPnl = 0;
  let fees = 0;
  let slippage = 0;
  const positions = new Map<string, any>();
  const fills: any[] = [];
  const settlements: any[] = [];

  for (const event of events) {
    updatedAt = event.event_time;
    if (!openedAt) openedAt = event.event_time;
    if (event.event_type === 'ledger_initialized') {
      startingBalance = Number(event.cash_after);
      cash = startingBalance;
      continue;
    }
    cash = Number((cash + Number(event.cash_delta || 0)).toFixed(6));
    fees = Number((fees + Number(event.fees || 0)).toFixed(6));
    slippage = Number((slippage + Number(event.slippage || 0)).toFixed(6));
    if (event.event_type === 'paper_fill' && event.position) {
      positions.set(String(event.token_id), { ...event.position });
      fills.push(event.paper_fill);
    }
    if (event.event_type === 'position_settled') {
      positions.delete(String(event.token_id));
      settlements.push(event);
      realizedPnl = Number((realizedPnl + Number(event.realized_pnl || 0)).toFixed(6));
    }
  }

  const activePositions = Array.from(positions.values()).filter((pos) => Number(pos.shares || 0) > 0);
  return {
    virtual_balance: Number(cash.toFixed(6)),
    starting_balance: Number(startingBalance.toFixed(6)),
    opened_at: openedAt,
    updated_at: updatedAt,
    realized_pnl: Number(realizedPnl.toFixed(6)),
    total_fees: Number(fees.toFixed(6)),
    total_slippage: Number(slippage.toFixed(6)),
    positions: activePositions,
    fills,
    settlements,
    sequence: events.length,
    last_checksum: events.length > 0 ? events[events.length - 1].event_checksum! : GENESIS_CHECKSUM,
  };
}

export function loadLedgerProjection(storageDir: string, fallbackBalance = 100): { ok: boolean; projection?: LedgerProjection; error?: string } {
  const loaded = readLedger(storageDir);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  return { ok: true, projection: replayLedger(loaded.events, fallbackBalance) };
}
