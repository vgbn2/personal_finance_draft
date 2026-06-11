import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
const { resolveSupabaseSettings } = require('../../../shared/lib/auth/supabase_env.js');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotConfig {
  enabled: boolean;
  liveTrading: boolean;
  intervalMinutes: number;
  maxPositions: number;
  positionSizeUsdc: number;
  minEdgeThreshold: number;
  stopLossPct: number;
  edgeCaptureRatio: number;
  fokCooldownMinutes: number;
  maxPositionAgeHours: number;
}

export interface BotPosition {
  positionId: string;
  tokenId: string;
  slug: string;
  side: 'YES' | 'NO';
  entryPrice: number;
  fillPrice: number;
  shares: number;
  targetPrice: number;
  stopPrice: number;
  entryTimestamp: string;
  aiProbabilityAtEntry: number;
  lastFokFailTimestamp: string | null;
}

export interface CycleResult {
  cycleId: string;
  startedAt: string;
  completedAt: string | null;
  balanceBefore: number;
  balanceAfter: number | null;
  sellsExecuted: number;
  buysFilled: number;
  errors: string[];
  dryRun: boolean;
}

export interface BotState {
  version: number;
  config: BotConfig;
  positions: BotPosition[];
  cycleHistory: CycleResult[];
  lastCycleAt: string | null;
  lockedAt: string | null;
}

// ─── Paths ────────────────────────────────────────────────────────────────────

// __dirname is available via tsx at runtime and in the CommonJS build output.
// gateway/src → gateway → backend → repo root (3 hops)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CACHE_DIR  = path.join(REPO_ROOT, 'storage', 'data', 'cache');
const STATE_PATH = path.join(CACHE_DIR, 'bot_state.json');
const LOCK_PATH  = path.join(CACHE_DIR, 'bot_cycle.lock');

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: BotConfig = {
  enabled:             false,
  liveTrading:         false,
  intervalMinutes:     15,
  maxPositions:        5,
  positionSizeUsdc:    10,
  minEdgeThreshold:    0.06,
  stopLossPct:         0.30,
  edgeCaptureRatio:    0.50,
  fokCooldownMinutes:  30,
  maxPositionAgeHours: 168,
};

const DEFAULT_STATE: BotState = {
  version:      1,
  config:       DEFAULT_CONFIG,
  positions:    [],
  cycleHistory: [],
  lastCycleAt:  null,
  lockedAt:     null,
};

// ─── Supabase helper (fire-and-forget writes) ─────────────────────────────────

function getSupabaseClient() {
  const { url, secretKey } = resolveSupabaseSettings(process.env);
  const key = secretKey;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function syncToSupabase(state: BotState): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    await sb.from('bot_state').upsert({ id: 'singleton', state, updated_at: new Date().toISOString() });
  } catch {
    // non-fatal — JSON file is the primary store
  }
}

async function loadFromSupabase(): Promise<BotState | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data } = await sb.from('bot_state').select('state').eq('id', 'singleton').single();
    return (data?.state as BotState) ?? null;
  } catch {
    return null;
  }
}

// ─── State I/O ────────────────────────────────────────────────────────────────

export function loadBotState(): BotState {
  if (fs.existsSync(STATE_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as Partial<BotState>;
      return {
        ...DEFAULT_STATE,
        ...raw,
        config: { ...DEFAULT_CONFIG, ...(raw.config ?? {}) },
      };
    } catch {
      // fallthrough to default
    }
  }
  return { ...DEFAULT_STATE, config: { ...DEFAULT_CONFIG } };
}

export async function loadBotStateWithFallback(): Promise<BotState> {
  if (fs.existsSync(STATE_PATH)) {
    return loadBotState();
  }
  const remote = await loadFromSupabase();
  if (remote) {
    saveBotState(remote); // hydrate local cache
    return remote;
  }
  return loadBotState();
}

export function saveBotState(state: BotState): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_PATH);
  // fire-and-forget Supabase sync
  syncToSupabase(state).catch(() => {});
}

// ─── Cycle lock ───────────────────────────────────────────────────────────────

interface LockFile { pid: number; startedAt: string }
const LOCK_MAX_AGE_MS = 10 * 60 * 1000;

export function acquireLock(): boolean {
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) as LockFile;
      const age = Date.now() - new Date(lock.startedAt).getTime();
      if (age < LOCK_MAX_AGE_MS) {
        // Check if the holding process is still alive
        try {
          process.kill(lock.pid, 0);
          return false; // process alive, lock is valid
        } catch (e: any) {
          if (e.code !== 'ESRCH') return false; // unexpected error — stay cautious
          // ESRCH = process not found → stale lock, fall through to acquire
        }
      }
      // stale lock — remove it
    } catch {
      // malformed lock file — remove it
    }
    fs.unlinkSync(LOCK_PATH);
  }
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
  return true;
}

export function releaseLock(): void {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* already gone */ }
}
