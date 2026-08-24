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
  schema_version?: number;
  ledger_sequence?: number;
  ledger_checksum?: string;
  virtual_balance: number;
  starting_balance: number;
  opened_at: string | null;
  updated_at: string | null;
  realized_pnl: number;
  total_fees?: number;
  total_slippage?: number;
  fees?: number;
  slippage?: number;
  positions: any[];
  fills: any[];
  settlements: any[];
  sequence?: number;
  last_checksum?: string;
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
      realizedPnl = Number((realizedPnl + Number(event.realized_pnl || 0)).toFixed(6));
      settlements.push(event.settlement);
    }
  }

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    ledger_sequence: events.length,
    ledger_checksum: events.length ? events[events.length - 1].event_checksum : GENESIS_CHECKSUM,
    virtual_balance: cash,
    starting_balance: startingBalance,
    positions: Array.from(positions.values()),
    fills,
    settlements,
    realized_pnl: realizedPnl,
    fees,
    slippage,
    opened_at: openedAt,
    updated_at: updatedAt,
  };
}

export function acquireLedgerLock(storageDir: string, now = new Date()): { ok: boolean; token?: string; error?: string; recovered_stale_lock?: boolean } {
  fs.mkdirSync(storageDir, { recursive: true });
  const { lock } = ledgerPaths(storageDir);
  const token = crypto.randomUUID();
  const body = JSON.stringify({ token, pid: process.pid, acquired_at: now.toISOString() });
  try {
    fs.writeFileSync(lock, body, { flag: 'wx', mode: 0o600 });
    return { ok: true, token };
  } catch (error: any) {
    if (error.code !== 'EEXIST') throw error;
  }

  let existing: any;
  try {
    existing = JSON.parse(fs.readFileSync(lock, 'utf8'));
  } catch {
    return { ok: false, error: 'paper ledger lock is malformed; manual recovery required' };
  }
  const age = now.getTime() - new Date(existing.acquired_at).getTime();
  if (!Number.isFinite(age) || age <= LOCK_MAX_AGE_MS) {
    return { ok: false, error: 'another paper ledger writer owns the lock' };
  }
  try {
    process.kill(Number(existing.pid), 0);
    return { ok: false, error: 'stale-aged paper ledger lock still has a live owner' };
  } catch (error: any) {
    if (error.code !== 'ESRCH') {
      return { ok: false, error: 'paper ledger lock ownership could not be verified' };
    }
  }
  fs.unlinkSync(lock);
  fs.writeFileSync(lock, body, { flag: 'wx', mode: 0o600 });
  return { ok: true, token, recovered_stale_lock: true };
}

export function releaseLedgerLock(storageDir: string, token?: string): boolean {
  if (!token) return false;
  const { lock } = ledgerPaths(storageDir);
  if (!fs.existsSync(lock)) return false;
  let existing: any;
  try {
    existing = JSON.parse(fs.readFileSync(lock, 'utf8'));
  } catch {
    return false;
  }
  if (existing.token !== token) return false;
  fs.unlinkSync(lock);
  return true;
}

export function atomicWriteJson(target: string, value: any): void {
  const tmp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

export function buildEvent(input: any, sequence: number, priorChecksum: string): LedgerEvent {
  const eventTime = input.event_time || new Date().toISOString();
  const idempotencyKey = String(input.idempotency_key || '');
  if (!idempotencyKey) throw new Error('paper ledger event requires idempotency_key');
  const event: LedgerEvent = {
    schema_version: LEDGER_SCHEMA_VERSION,
    event_id: input.event_id || digest(`${input.event_type}:${idempotencyKey}`).slice(0, 32),
    idempotency_key: idempotencyKey,
    cycle_id: input.cycle_id || null,
    sequence,
    event_type: input.event_type,
    event_time: eventTime,
    decision_time: input.decision_time || eventTime,
    data_as_of: input.data_as_of || eventTime,
    market_id: input.market_id || null,
    condition_id: input.condition_id || input.market_id || null,
    token_id: input.token_id || null,
    outcome: input.outcome || null,
    strategy: input.strategy || null,
    source: input.source || 'internal_polymarket_paper',
    order_intent: input.order_intent || null,
    policy_fingerprint: input.policy_fingerprint || null,
    risk_decision: input.risk_decision || { approved: true, mode: 'paper' },
    paper_fill: input.paper_fill || null,
    position: input.position || null,
    position_effect: input.position_effect || null,
    settlement: input.settlement || null,
    cash_delta: Number(input.cash_delta || 0),
    cash_after: input.cash_after === undefined ? null : Number(input.cash_after),
    realized_pnl: Number(input.realized_pnl || 0),
    fees: Number(input.fees || 0),
    slippage: Number(input.slippage || 0),
    prior_checksum: priorChecksum,
  };
  event.event_checksum = checksumEvent(event);
  return event;
}

export function appendLedgerEvents(storageDir: string, inputs: any[], options: any = {}): any {
  const lock = acquireLedgerLock(storageDir, options.now ? new Date(options.now) : new Date());
  if (!lock.ok) return lock;
  try {
    const loaded = readLedger(storageDir);
    if (!loaded.ok) return loaded;
    const existingKeys = new Set(loaded.events.map((event) => event.idempotency_key));
    const accepted: LedgerEvent[] = [];
    const duplicates: string[] = [];
    let priorChecksum = loaded.last_checksum;
    let sequence = loaded.events.length;
    for (const input of inputs) {
      if (existingKeys.has(input.idempotency_key)) {
        duplicates.push(input.idempotency_key);
        continue;
      }
      const event = buildEvent(input, ++sequence, priorChecksum);
      accepted.push(event);
      existingKeys.add(event.idempotency_key);
      priorChecksum = event.event_checksum!;
    }
    if (accepted.length > 0) {
      fs.appendFileSync(
        ledgerPaths(storageDir).ledger,
        accepted.map((event) => JSON.stringify(event)).join('\n') + '\n',
        { mode: 0o600 },
      );
    }
    if (options.injectCrashAfterAppend) throw new Error('injected crash after ledger append');
    const events = [...loaded.events, ...accepted];
    const projection = replayLedger(events, options.startingBalance);
    atomicWriteJson(ledgerPaths(storageDir).snapshot, projection);
    return { ok: true, accepted, duplicates, projection, recovered_stale_lock: Boolean(lock.recovered_stale_lock) };
  } finally {
    releaseLedgerLock(storageDir, lock.token);
  }
}

export function initializeLedger(storageDir: string, startingBalance = 100, options: any = {}): any {
  const loaded = readLedger(storageDir);
  if (!loaded.ok) return loaded;
  if (loaded.events.length > 0) {
    return {
      ok: true,
      accepted: [],
      duplicates: [],
      projection: replayLedger(loaded.events, startingBalance),
      existing: true,
    };
  }
  return appendLedgerEvents(storageDir, [{
    event_type: 'ledger_initialized',
    idempotency_key: `ledger_initialized:${Number(startingBalance)}`,
    event_time: options.now,
    cash_after: Number(startingBalance),
    source: options.source || 'internal_polymarket_paper',
  }], { ...options, startingBalance });
}

export function loadLedgerProjection(storageDir: string, startingBalance = 100): { ok: boolean; projection?: LedgerProjection; events?: LedgerEvent[]; error?: string } {
  const loaded = readLedger(storageDir);
  if (!loaded.ok) return loaded;
  return { ok: true, projection: replayLedger(loaded.events, startingBalance), events: loaded.events };
}
