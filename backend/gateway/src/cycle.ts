require('../../../shared/lib/runtime/env.js');
import * as crypto from 'node:crypto';
import {
  loadBotStateWithFallback,
  saveBotState,
  acquireLock,
  releaseLock,
  type BotPosition,
  type BotState,
  type CycleResult,
} from './bot_state';
import { fetchTradingInfo } from './market';
import { createClobClient } from './clob_factory';
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env.js');
// @ts-ignore
const { PersistenceBridge } = require('../../../shared/lib/runtime/persistence_bridge');
// @ts-ignore
const { fetchWithRetry } = require('../../../shared/lib/runtime/fetch_retry');
// @ts-ignore
const { resolveRuntimePolicy } = require('../../../shared/lib/settings/runtime_policy');

// ─── Gamma end-date helper ────────────────────────────────────────────────────

const GAMMA_API_CYCLE = 'https://gamma-api.polymarket.com';

/**
 * Returns the market's endDateIso (YYYY-MM-DD) from Gamma, or null when the
 * field is absent or the request fails.  slug format: "<eventSlug>--<marketSlug>"
 */
async function fetchMarketEndDateIso(slug: string): Promise<string | null> {
  try {
    const parts = slug.split('--');
    const eventSlug  = parts[0];
    const marketSlug = parts.slice(1).join('--');
    const res = await fetchWithRetry(`${GAMMA_API_CYCLE}/events?slug=${encodeURIComponent(eventSlug)}`);
    if (!res.ok) return null;
    const body = await res.json();
    const events: any[] = Array.isArray(body) ? body : body?.data ?? [];
    for (const event of events) {
      const markets: any[] = Array.isArray(event.markets) ? event.markets : [];
      const market = markets.find(
        (m: any) => m.marketSlug === marketSlug || m.slug === marketSlug,
      );
      if (market) {
        // Prefer endDateIso (YYYY-MM-DD string); fall back to endDate ISO datetime.
        const raw: unknown = market.endDateIso ?? market.endDate ?? null;
        if (typeof raw === 'string' && raw) return raw.slice(0, 10); // normalise to YYYY-MM-DD
        return null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Truth Machine ─────────────────────────────────────────────────────────────

interface TruthMachineBet {
  slug:           string;
  question:       string;
  side:           'YES' | 'NO';
  ai_probability: number;
  market_price:   number;
  edge:           number;
  confidence:     string;
  analyzed_at:    string;
}

async function fetchAiBets(): Promise<TruthMachineBet[]> {
  const res = await fetchWithRetry('https://truthmachine.live/api/best-bets?limit=50&min_edge=0');
  if (!res.ok) throw new Error(`Truth Machine API error: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body?.markets) ? body.markets : [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseIntervalArg(args: string[]): number {
  const idx = args.indexOf('--interval');
  if (idx !== -1 && args[idx + 1]) return Math.max(1, Number(args[idx + 1]) || 15);
  return 15;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function determinePositionExitReason(
  pos: Pick<BotPosition, 'side' | 'targetPrice' | 'stopPrice' | 'entryTimestamp' | 'aiProbabilityAtEntry'>,
  fairPrice: number,
  bet: Pick<TruthMachineBet, 'ai_probability'> | undefined,
  maxPositionAgeHours: number,
  nowMs = Date.now(),
): string | null {
  if (!Number.isFinite(fairPrice) || fairPrice <= 0) return null;
  const aiProb = bet?.ai_probability ?? pos.aiProbabilityAtEntry;
  const edge = pos.side === 'YES'
    ? aiProb - fairPrice
    : (1 - aiProb) - fairPrice;
  const ageHours = (nowMs - new Date(pos.entryTimestamp).getTime()) / 3600000;

  if (fairPrice >= 0.95) return 'resolved';
  if (fairPrice >= pos.targetPrice) return 'target';
  if (fairPrice <= pos.stopPrice) return 'stop_loss';
  if (edge <= 0 && bet) return 'ai_reversal';
  if (ageHours >= maxPositionAgeHours) return 'time_decay';
  return null;
}

export async function resolveObservablePositionPrice(
  pos: Pick<BotPosition, 'side' | 'tokenId'>,
  bet: Pick<TruthMachineBet, 'market_price'> | undefined,
  liveClient?: { getPrice(tokenId: string, side: string): Promise<any> },
): Promise<number | null> {
  let price: number;
  if (liveClient) {
    const response = await liveClient.getPrice(pos.tokenId, 'BUY');
    price = Number(response?.price ?? response);
  } else {
    const yesPrice = Number(bet?.market_price);
    price = pos.side === 'YES' ? yesPrice : 1 - yesPrice;
  }
  return Number.isFinite(price) && price > 0 && price <= 1 ? price : null;
}

export interface BotOrderIntent {
  instrumentId: string;
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
}

export interface BotPreTradeDecision {
  approved: boolean;
  reason?: string;
}

export type BotPreTradeAuthorizer = (order: BotOrderIntent) => Promise<BotPreTradeDecision>;

export interface BotExecutionOptions {
  authorizeOrder?: BotPreTradeAuthorizer;
}

function liveBotAuthorizationError(args: string[]): string | null {
  const policy = resolveRuntimePolicy({ args, broker: 'polymarket' });
  if (!policy.requested_live) return null;
  if (policy.can_execute) return null;
  if (policy.research_only) {
    return `Live Polymarket bot execution blocked in ${policy.requested_profile} mode`;
  }
  return 'Live Polymarket bot execution requires --live and CLI authorization';
}

export async function submitRiskApprovedFokOrder(
  client: any,
  intent: BotOrderIntent,
  orderType: any,
  authorizeOrder?: BotPreTradeAuthorizer,
): Promise<any> {
  if (!authorizeOrder) {
    throw new Error('Bot pre-trade risk authorizer is unavailable');
  }

  const decision = await authorizeOrder(intent);
  if (!decision.approved) {
    throw new Error(`Bot pre-trade risk rejected: ${decision.reason || 'unspecified reason'}`);
  }

  const signed = await client.createOrder({
    tokenID: intent.instrumentId,
    price: intent.price,
    size: intent.quantity,
    side: intent.side,
  });
  return client.postOrder(signed, orderType);
}

function isFokCoolingDown(pos: Pick<BotPosition, 'lastFokFailTimestamp'>, cooldownMinutes: number): boolean {
  if (!pos.lastFokFailTimestamp) return false;
  const elapsed = (Date.now() - new Date(pos.lastFokFailTimestamp).getTime()) / 60000;
  return elapsed < cooldownMinutes;
}

// ─── Health check ─────────────────────────────────────────────────────────────

export interface HealthResult {
  ok: boolean;
  checks: { label: string; ok: boolean; detail: string }[];
}

export async function runBotHealth(): Promise<HealthResult> {
  const checks: HealthResult['checks'] = [];
  const polySettings = resolvePolymarketClientSettings(process.env);

  // 1. Private key
  const pk = polySettings.privateKey;
  checks.push({ label: 'POLYMARKET_PRIVATE_KEY', ok: Boolean(pk), detail: pk ? `set (${pk.slice(0,6)}...)` : 'missing' });

  // 2. L2 credentials
  const hasL2 = Boolean(polySettings.apiKey && polySettings.apiSecret && polySettings.apiPassphrase);
  checks.push({ label: 'L2 credentials (API_KEY/SECRET/PASSPHRASE)', ok: hasL2, detail: hasL2 ? 'set' : 'missing — run: polymarket derive-creds' });

  // 3. CLOB reachable
  try {
    const client = await createClobClient();
    await client.getServerTime();
    checks.push({ label: 'CLOB API reachable', ok: true, detail: 'https://clob.polymarket.com' });
  } catch (e: any) {
    checks.push({ label: 'CLOB API reachable', ok: false, detail: e.message });
  }

  // 4. Truth Machine reachable
  try {
    const r = await fetchWithRetry('https://truthmachine.live/api/best-bets?limit=1&min_edge=0');
    checks.push({ label: 'Truth Machine API', ok: r.ok, detail: r.ok ? `${r.status} OK` : `${r.status} error` });
  } catch (e: any) {
    checks.push({ label: 'Truth Machine API', ok: false, detail: e.message });
  }

  // 5. pUSD balance (requires L2)
  if (hasL2 && pk) {
    try {
      const client = await createClobClient({ withCreds: true });
      const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
      const pUSD = Number(bal?.balance ?? 0);
      checks.push({ label: 'pUSD balance', ok: pUSD > 0, detail: `${pUSD.toFixed(2)} pUSD${pUSD === 0 ? ' — fund your Polygon wallet' : ''}` });
    } catch (e: any) {
      checks.push({ label: 'pUSD balance', ok: false, detail: e.message });
    }
  } else {
    checks.push({ label: 'pUSD balance', ok: false, detail: 'skipped — L2 credentials required' });
  }

  // 6. Bot state readable
  try {
    const state = await loadBotStateWithFallback();
    checks.push({ label: 'Bot state', ok: true, detail: `enabled=${state.config.enabled}, live=${state.config.liveTrading}, positions=${state.positions.length}` });
  } catch (e: any) {
    checks.push({ label: 'Bot state', ok: false, detail: e.message });
  }

  return { ok: checks.every(c => c.ok), checks };
}

// ─── Core cycle ───────────────────────────────────────────────────────────────

export async function runCycle(
  args: string[],
  options: BotExecutionOptions = {},
): Promise<CycleResult & { skipped?: string[]; wouldBuy?: any[] }> {
  const cycleId   = `cycle_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const startedAt = new Date().toISOString();
  const live      = process.env.LIVE_TRADING === 'true' || args.includes('--live');
  const errors: string[] = [];
  const skipped: string[] = [];
  const wouldBuy: any[]   = [];
  let sellsExecuted = 0;
  let buysFilled    = 0;
  let balanceBefore = 0;
  let balanceAfter: number | null = null;

  const authorizationError = liveBotAuthorizationError(args);
  if (authorizationError || (live && !options.authorizeOrder)) {
    return {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      balanceBefore,
      balanceAfter,
      sellsExecuted,
      buysFilled,
      errors: [authorizationError || 'Bot pre-trade risk authorizer is unavailable'],
      skipped,
      wouldBuy,
      dryRun: !live,
    };
  }

  // Check L2 credentials upfront — degrade gracefully instead of mid-cycle error
  const polySettings = resolvePolymarketClientSettings(process.env);
  const hasL2 = Boolean(polySettings.apiKey && polySettings.apiSecret && polySettings.apiPassphrase);
  if (!hasL2) {
    if (live) {
      return {
        cycleId,
        startedAt,
        completedAt: new Date().toISOString(),
        balanceBefore,
        balanceAfter,
        sellsExecuted,
        buysFilled,
        errors: ['Live Polymarket bot execution requires complete L2 credentials'],
        skipped,
        wouldBuy,
        dryRun: false,
      };
    }
    skipped.push('balance check skipped — L2 credentials not set (run: polymarket derive-creds)');
  }

  if (!acquireLock()) {
    return { cycleId, startedAt, completedAt: new Date().toISOString(), balanceBefore: 0, balanceAfter: null, sellsExecuted: 0, buysFilled: 0, errors: ['another cycle is already running'], dryRun: !live };
  }

  let state: BotState;
  try {
    state = await loadBotStateWithFallback();
  } catch (e: any) {
    releaseLock();
    return { cycleId, startedAt, completedAt: new Date().toISOString(), balanceBefore: 0, balanceAfter: null, sellsExecuted: 0, buysFilled: 0, errors: [`state load failed: ${e.message}`], dryRun: !live };
  }

  const { config } = state;
  const persistence = new PersistenceBridge();

  try {
    // ── Phase 1: Balance ──────────────────────────────────────────────────────
    let client: any;
    if (live && hasL2) {
      try {
        client = await createClobClient({ withCreds: true });
        const balData = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
        balanceBefore = Number(balData?.balance ?? 0);
      } catch (e: any) {
        errors.push(`balance fetch failed: ${e.message}`);
      }
    } else if (!live) {
      skipped.push('credentialed balance/client initialization skipped in paper mode');
    }
    if (live && !client) {
      return {
        cycleId,
        startedAt,
        completedAt: new Date().toISOString(),
        balanceBefore,
        balanceAfter,
        sellsExecuted,
        buysFilled,
        errors: errors.length ? errors : ['Live Polymarket bot client is unavailable'],
        skipped,
        wouldBuy,
        dryRun: false,
      };
    }

    // ── Phase 2: Fetch AI bets ────────────────────────────────────────────────
    let bets: TruthMachineBet[] = [];
    const betsBySlug = new Map<string, TruthMachineBet>();
    try {
      bets = await fetchAiBets();
      for (const bet of bets) betsBySlug.set(bet.slug, bet);
    } catch (e: any) {
      errors.push(`Truth Machine fetch failed: ${e.message}`);
    }

    // ── Phase 3: Review & sell open positions ─────────────────────────────────
    if (config.enabled || state.positions.length > 0) {
      for (const pos of state.positions) {
        try {
          const bet = betsBySlug.get(pos.slug);
          let fairPrice: number | null = null;
          try {
            fairPrice = await resolveObservablePositionPrice(pos, bet, live ? client : undefined);
          } catch {
            skipped.push(`position review skipped for ${pos.slug} - no observable exit price`);
          }
          if (fairPrice === null) {
            continue;
          }

          const exitReason = determinePositionExitReason(
            pos,
            fairPrice,
            bet,
            config.maxPositionAgeHours,
          );
          if (!exitReason) continue;
          console.log(`[BOT] ${live ? 'SELL' : 'DRY-RUN SELL'} ${pos.slug} (${pos.side}) — reason: ${exitReason}, fair: ${fairPrice}`);

          if (live && client) {
            try {
              const { OrderType } = await import('@polymarket/clob-client-v2');
              const resp = await submitRiskApprovedFokOrder(client, {
                instrumentId: pos.tokenId,
                price:   fairPrice,
                quantity: pos.shares,
                side:    'SELL',
              }, OrderType.FOK, options.authorizeOrder);
              if (resp?.status === 'matched') {
                sellsExecuted++;
                await persistence.logOrder({ instrumentId: pos.tokenId, side: 'sell', quantity: pos.shares, price: fairPrice, type: 'market', status: 'filled', timestamp: new Date() }, 'polymarket', { slug: pos.slug, positionId: pos.positionId });
                state.positions = state.positions.filter(p => p.positionId !== pos.positionId);
              } else {
                // FOK not matched — server should auto-cancel, but defensively attempt cancel if orderID present
                const orderId: string | undefined = resp?.orderID ?? resp?.order_id;
                let cancelNote = '';
                if (orderId) {
                  try {
                    await client.cancelOrder({ orderID: orderId });
                    cancelNote = '; cancel attempted: ok';
                  } catch (ce: any) {
                    cancelNote = `; cancel attempted: failed (${ce.message})`;
                  }
                }
                errors.push(`FOK sell unmatched for ${pos.slug} (status: ${resp?.status ?? 'unknown'})${cancelNote}`);
              }
            } catch (e: any) {
              errors.push(`sell order failed for ${pos.slug}: ${e.message}`);
            }
          } else {
            sellsExecuted++; // count in dry-run
            state.positions = state.positions.filter(p => p.positionId !== pos.positionId);
          }
        } catch (e: any) {
          errors.push(`review error for ${pos.slug}: ${e.message}`);
        }
      }
    }

    // ── Phase 4: Buy new positions ────────────────────────────────────────────
    if (!config.enabled) {
      skipped.push('buy scan skipped — bot disabled (run: bot config --key enabled --value true)');
    } else {
      const openSlugs  = new Set(state.positions.map(p => p.slug));
      const openCount  = state.positions.length;
      const slotsLeft  = config.maxPositions - openCount;

      if (slotsLeft <= 0) {
        skipped.push(`buy scan skipped — at max positions (${config.maxPositions}/${config.maxPositions})`);
      } else if (bets.length === 0) {
        skipped.push('buy scan skipped — no bets from Truth Machine (API may be unreachable)');
      } else {
        // Compute edge per bet, pick better side
        const allCandidates = bets.map(bet => {
          const yesEdge = bet.ai_probability - bet.market_price;
          const noPrice = 1 - bet.market_price;
          const noEdge  = (1 - bet.ai_probability) - noPrice;
          const side    = yesEdge >= noEdge ? 'YES' as const : 'NO' as const;
          const edge    = side === 'YES' ? yesEdge : noEdge;
          const price   = side === 'YES' ? bet.market_price : noPrice;
          return { bet, side, edge, price };
        }).sort((a, b) => b.edge - a.edge);

        const belowThreshold = allCandidates.filter(c => c.edge < config.minEdgeThreshold && !openSlugs.has(c.bet.slug));
        if (belowThreshold.length > 0) {
          skipped.push(`${belowThreshold.length} bets below minEdge ${(config.minEdgeThreshold * 100).toFixed(0)}% (top skipped: ${belowThreshold[0].bet.slug} @ ${(belowThreshold[0].edge * 100).toFixed(1)}%)`);
        }

        const candidates = allCandidates
          .filter(c => !openSlugs.has(c.bet.slug) && c.edge >= config.minEdgeThreshold)
          .slice(0, slotsLeft);

        for (const { bet, side, edge, price } of candidates) {
          // FOK cooldown: check if we recently failed on this slug
          const cooldownEntry = state.positions.find(p => p.slug === bet.slug && p.lastFokFailTimestamp);
          if (cooldownEntry && isFokCoolingDown(cooldownEntry, config.fokCooldownMinutes)) {
            skipped.push(`${bet.slug} — FOK cooldown active`);
            continue;
          }

          // Resolve slug → tokenId
          let info;
          try {
            info = await fetchTradingInfo(bet.slug);
          } catch (e: any) {
            errors.push(`market resolution failed for ${bet.slug}: ${e.message}`);
            continue;
          }
          if (!info) { errors.push(`could not resolve token for ${bet.slug}`); continue; }
          if (!info.active) { skipped.push(`${bet.slug} — market inactive`); continue; }
          if (info.negRisk) {
            skipped.push(`${bet.slug} — negRisk (needs manual allowance on polymarket.com)`);
            continue;
          }

          // Deadline guard — skip markets whose end date has already passed.
          // endDateIso is fetched from Gamma as YYYY-MM-DD; compared to today's date string.
          // If the field is absent (null), the market is unknown-deadline: do NOT skip.
          const endDateIso = await fetchMarketEndDateIso(bet.slug);
          if (endDateIso !== null) {
            const todayIso = new Date().toISOString().slice(0, 10);
            if (endDateIso < todayIso) {
              skipped.push(`${bet.slug} — past deadline (${endDateIso})`);
              continue;
            }
          }

          const tokenId = side === 'YES' ? info.yesTokenId : info.noTokenId;
          const shares  = config.positionSizeUsdc / price;
          const positionId = `${tokenId}_${Date.now()}`;

          // Always record what would be/was bought for dry-run visibility
          wouldBuy.push({
            slug:          bet.slug,
            question:      bet.question,
            side,
            price:         Number(price.toFixed(4)),
            edge:          Number((edge * 100).toFixed(1)),
            aiProb:        Number((bet.ai_probability * 100).toFixed(1)),
            sizeUsdc:      config.positionSizeUsdc,
            target:        Number((price + edge * config.edgeCaptureRatio).toFixed(4)),
          });

          console.log(`[BOT] ${live ? 'BUY' : 'DRY-RUN BUY'} ${bet.slug} ${side} @ ${price.toFixed(4)} (edge: ${(edge * 100).toFixed(1)}%)`);

          let fillPrice = price;
          let filled    = false;

          if (live && client) {
            try {
              const { OrderType: OrderTypeBuy } = await import('@polymarket/clob-client-v2');
              const resp = await submitRiskApprovedFokOrder(client, {
                instrumentId: tokenId,
                price,
                quantity: shares,
                side:    'BUY',
              }, OrderTypeBuy.FOK, options.authorizeOrder);
              if (resp?.status === 'matched') {
                fillPrice = Number(resp.price ?? price);
                filled    = true;
              } else {
                // Record cooldown on a placeholder entry
                const existingIdx = state.positions.findIndex(p => p.slug === bet.slug);
                if (existingIdx === -1) {
                  // We don't add a real position, just track the cooldown in a synthetic entry
                  // For simplicity: store cooldown slug in a temporary list embedded in state
                  (state as any)._fokCooldowns = (state as any)._fokCooldowns ?? {};
                  (state as any)._fokCooldowns[bet.slug] = new Date().toISOString();
                }
                errors.push(`FOK buy unmatched for ${bet.slug}`);
                continue;
              }
            } catch (e: any) {
              errors.push(`buy order failed for ${bet.slug}: ${e.message}`);
              continue;
            }
          } else {
            filled = true; // dry-run always "fills"
          }

          if (filled) {
            const edgeAtFill  = side === 'YES' ? bet.ai_probability - fillPrice : (1 - bet.ai_probability) - fillPrice;
            const effectiveEdge = edgeAtFill > 0.02 ? edgeAtFill : 0.02; // floor edge at 2% to avoid zero target
            const targetPrice = clamp(fillPrice + effectiveEdge * config.edgeCaptureRatio, fillPrice + 0.01, 0.95);
            const stopPrice   = fillPrice * (1 - config.stopLossPct);

            const newPos: BotPosition = {
              positionId,
              tokenId,
              slug:                 bet.slug,
              side,
              entryPrice:           price,
              fillPrice,
              shares,
              targetPrice,
              stopPrice,
              entryTimestamp:       new Date().toISOString(),
              aiProbabilityAtEntry: bet.ai_probability,
              lastFokFailTimestamp: null,
            };
            state.positions.push(newPos);
            buysFilled++;

            if (live) {
              await persistence.logOrder({ instrumentId: newPos.tokenId, side: 'buy', quantity: newPos.shares, price: fillPrice, type: 'market', status: 'filled', timestamp: new Date() }, 'polymarket', { slug: newPos.slug, positionId: newPos.positionId });
            }
          }
        }
      }
    }

    // ── Phase 5: Save + finalize ──────────────────────────────────────────────
    try {
      const balData2 = await client?.getBalanceAllowance({ asset_type: 'COLLATERAL' });
      balanceAfter = Number(balData2?.balance ?? 0);
    } catch { /* non-fatal */ }

    const result = {
      cycleId, startedAt,
      completedAt:  new Date().toISOString(),
      balanceBefore, balanceAfter,
      sellsExecuted, buysFilled,
      errors, skipped, wouldBuy,
      dryRun: !live,
    };

    const storeResult: CycleResult = { cycleId, startedAt, completedAt: result.completedAt, balanceBefore, balanceAfter, sellsExecuted, buysFilled, errors, dryRun: !live };
    state.lastCycleAt = result.completedAt;
    state.cycleHistory = [storeResult, ...state.cycleHistory].slice(0, 50);
    saveBotState(state);

    return result;

  } finally {
    releaseLock();
  }
}

// ─── Force-sell a specific position ──────────────────────────────────────────

export async function runForceSell(
  positionId: string,
  args: string[],
  options: BotExecutionOptions = {},
): Promise<{ ok: boolean; error?: string; pnl?: number }> {
  const live  = process.env.LIVE_TRADING === 'true' || args.includes('--live');
  const authorizationError = liveBotAuthorizationError(args);
  if (authorizationError) return { ok: false, error: authorizationError };
  if (live && !options.authorizeOrder) {
    return { ok: false, error: 'Bot pre-trade risk authorizer is unavailable' };
  }

  const state = await loadBotStateWithFallback();
  const pos   = state.positions.find(p => p.positionId === positionId);
  if (!pos) return { ok: false, error: `position ${positionId} not found` };

  if (!live) {
    state.positions = state.positions.filter(p => p.positionId !== positionId);
    saveBotState(state);
    return { ok: true, pnl: 0 };
  }

  try {
    const { OrderType } = await import('@polymarket/clob-client-v2');
    const client = await createClobClient({ withCreds: true });
    const priceResp = await client.getPrice(pos.tokenId, 'BUY');
    const fairPrice = Number(priceResp?.price ?? priceResp ?? 0);
    const resp = await submitRiskApprovedFokOrder(client, {
      instrumentId: pos.tokenId,
      price: fairPrice,
      quantity: pos.shares,
      side: 'SELL',
    }, OrderType.FOK, options.authorizeOrder);

    if (resp?.status !== 'matched') {
      // Defensively attempt cancel in case the FOK order rested (server should auto-cancel)
      const orderId: string | undefined = resp?.orderID ?? resp?.order_id;
      let cancelNote = '';
      if (orderId) {
        try {
          await client.cancelOrder({ orderID: orderId });
          cancelNote = '; cancel attempted: ok';
        } catch (ce: any) {
          cancelNote = `; cancel attempted: failed (${ce.message})`;
        }
      }
      return { ok: false, error: `FOK sell unmatched (status: ${resp?.status ?? 'unknown'})${cancelNote}` };
    }

    const pnl = (fairPrice - pos.fillPrice) * pos.shares;
    const forcePersistence = new PersistenceBridge();
    await forcePersistence.logOrder({ instrumentId: pos.tokenId, side: 'sell', quantity: pos.shares, price: fairPrice, type: 'market', status: 'filled', timestamp: new Date() }, 'polymarket', { slug: pos.slug, positionId: pos.positionId });
    state.positions = state.positions.filter(p => p.positionId !== positionId);
    saveBotState(state);
    return { ok: true, pnl };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── Continuous loop (mirrors runAutomatedStrategies) ─────────────────────────

export async function runBotLoop(args: string[], options: BotExecutionOptions = {}): Promise<void> {
  const live = process.env.LIVE_TRADING === 'true' || args.includes('--live');
  const authorizationError = liveBotAuthorizationError(args);
  if (authorizationError) throw new Error(authorizationError);
  if (live && !options.authorizeOrder) {
    throw new Error('Bot pre-trade risk authorizer is unavailable');
  }

  const intervalMinutes = parseIntervalArg(args);
  const intervalMs      = intervalMinutes * 60 * 1000;
  let passes            = 0;

  console.log(`[BOT] Starting loop — interval: ${intervalMinutes}min, live: ${args.includes('--live')}`);
  console.log('[BOT] Press Ctrl+C to stop.');

  const loop = async () => {
    passes++;
    console.log(`\n[BOT] === Pass ${passes} | ${new Date().toISOString()} ===`);
    try {
      const result = await runCycle(args, options);
      console.log(`[BOT] Cycle complete — sold: ${result.sellsExecuted}, bought: ${result.buysFilled}, errors: ${result.errors.length}`);
      if (result.errors.length) result.errors.forEach(e => console.warn(`  [ERR] ${e}`));
    } catch (e: any) {
      console.error(`[BOT] Cycle failed: ${e.message}`);
    }
    setTimeout(loop, intervalMs);
  };

  loop();
}
