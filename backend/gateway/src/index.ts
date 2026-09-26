import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClobClient, resolveOwnerAddress, polymarketGet } from './clob_factory';
import {
  BrokerAdapter,
  Position,
  TradeOrder,
  SimulationAdapter,
  GateIoAdapter,
  AlpacaAdapter,
  PolymarketAdapter,
  Mt5Adapter,
  DeribitAdapter,
  GateIoAdapterOptions,
  AlpacaAdapterOptions,
  PolymarketAdapterOptions,
  DeribitAdapterOptions,
} from './adapters';
import { runAggregatePortfolioCommand } from './commands/aggregate_portfolio';

export {
  BrokerAdapter,
  Position,
  TradeOrder,
  SimulationAdapter,
  GateIoAdapter,
  AlpacaAdapter,
  PolymarketAdapter,
  Mt5Adapter,
  DeribitAdapter,
  GateIoAdapterOptions,
  AlpacaAdapterOptions,
  PolymarketAdapterOptions,
  DeribitAdapterOptions,
};
import {
  runCycle,
  runBotLoop,
  runForceSell,
  runBotHealth,
  type BotExecutionOptions,
  type BotOrderIntent,
} from './cycle';
import { loadBotState, saveBotState } from './bot_state';
import {
  submitPolymarketOrder as submitPolymarketOrderExt,
  preflightPolymarketOrder,
  buildPolymarketBotExecutionOptions as buildPolymarketBotExecutionOptionsExt,
  processProposedOrdersFile,
} from './polymarket_execution';
import {
  fetchPolymarketPortfolio,
  fetchPolymarketDebug,
  fetchPolymarketAuthHealth,
  fetchPolymarketModes,
  fetchPolymarketCollateralProbe,
  fetchPolymarketInvestigate,
  fetchPolymarketProbe,
  fetchPolymarketTopology,
  fetchPolymarketTrace,
  fetchPolymarketOrderBook,
  fetchPolymarketPriceHistory,
  derivePolymarketApiCreds,
  renderPolymarketSection,
  renderPolymarketDebugSection,
  renderPolymarketAuthHealthSection,
  parseOptionValue,
  type PolymarketSection,
  type PolymarketDebugSection,
  type PolymarketCollateralProbeSection,
  type PolymarketAuthHealthSection,
  type PolymarketModeProbeResult,
  type PolymarketAuthStage,
} from './polymarket_account_adapter';
import {
  aggregatePolymarketFilledPositions,
  buildAggregatedPortfolioSnapshot,
  buildPolymarketCollateralProbeSnapshot,
  buildPolymarketDebugSnapshot,
  buildPolymarketTokenMetadata,
  buildTradePagination,
  classifyPolymarketGatewayError,
  describeGatewayError,
  fetchPolymarketGammaEvents,
  fetchPolymarketGammaMarkets,
  getConfiguredSignatureType,
  getConfiguredWalletAddress,
  loadPortfolio as loadInternalPaperPortfolio,
  markPolymarketHistoryIncomplete,
  mergeTokenMetadata,
  normalizePolymarketApiCreds,
  partitionPolymarketPositions,
  polymarketAddressRoles,
  polymarketModeCandidates,
  polymarketProbeCandidates,
  projectPolymarketPosition,
  runPolymarketPaperRun,
  summarizePolymarketApiCredShape,
  summarizePortfolio as summarizeInternalPaperPortfolio,
  traceCsvFile,
  validateProposedOrdersPayload,
} from './polymarket/index.js';
// @ts-ignore
const { runPolymarketOrderbookLiteBackfill } = require('../../cli/commands/trade/polymarket_backtest.js');
// @ts-ignore
const { buildAlpacaPortfolioAdapterSpecs } = require('../../../shared/lib/brokers/alpaca_portfolio_scope.js');
// @ts-ignore
const { resolvePolymarketClientSettings } = require('../../../shared/lib/brokers/polymarket_env.js');
// @ts-ignore
const { PersistenceBridge } = require('../../../shared/lib/runtime/persistence_bridge');
// @ts-ignore
const { resolveRuntimePolicy } = require('../../../shared/lib/settings/runtime_policy');
// @ts-ignore
const { verifyPin } = require('../../cli/lib/auth.js');
// @ts-ignore
const { getActivePropFirmProfile } = require('../../../shared/lib/profiles/prop_firms.js');

const ansi = {
  reset:       '\x1b[0m',
  bold:        '\x1b[1m',
  dim:         '\x1b[2m',
  red:         '\x1b[31m',
  green:       '\x1b[32m',
  yellow:      '\x1b[33m',
  magenta:     '\x1b[35m',
  boldGreen:   '\x1b[1;32m',
  boldYellow:  '\x1b[1;33m',
  boldMagenta: '\x1b[1;35m',
  boldCyan:    '\x1b[1;36m',
} as const;

enum OrderSide {
  BUY = 'buy',
  SELL = 'sell'
}

enum OrderStatus {
  PROPOSED = 'proposed',
  RISK_REJECTED = 'risk_rejected',
  SUBMITTED = 'submitted',
  FILLED = 'filled',
  FAILED = 'failed'
}

export interface RiskContext {
  referencePrice: number;
  portfolioEquity: number;
  currentDrawdown: number;
  maxDrawdown: number;
}

function firstPositiveBalance(balances: Record<string, number>): number {
  for (const key of ['EQUITY', 'pUSD', 'USD', 'USDT']) {
    const value = Number(balances[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export async function buildRiskContext(order: TradeOrder, adapter: BrokerAdapter, dryRun: boolean): Promise<RiskContext> {
  const explicitPrice = Number(order.price);
  const referencePrice = Number.isFinite(explicitPrice) && explicitPrice > 0
    ? explicitPrice
    : (typeof adapter.getQuote === 'function' ? Number(await adapter.getQuote(order.instrumentId)) : 0);
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error(`Unable to resolve a positive reference price for ${order.instrumentId}`);
  }

  const portfolioEquity = firstPositiveBalance(await adapter.getPortfolioBalance());
  if (!Number.isFinite(portfolioEquity) || portfolioEquity <= 0) {
    throw new Error('Unable to resolve positive portfolio equity from the broker account');
  }

  const drawdownInput = process.env.CURRENT_PORTFOLIO_DRAWDOWN;
  const currentDrawdown = drawdownInput === undefined && dryRun ? 0 : Number(drawdownInput);
  if (!Number.isFinite(currentDrawdown) || currentDrawdown < 0 || currentDrawdown > 1) {
    throw new Error('CURRENT_PORTFOLIO_DRAWDOWN must be explicitly set between 0 and 1 for live execution');
  }

  let maxDrawdown = Number(process.env.MAX_ALLOWED_DRAWDOWN || process.env.SOVEREIGN_MAX_DRAWDOWN || 0.30);
  if (order.broker === 'mt5') {
    try {
      const propProfile = getActivePropFirmProfile();
      const propMaxLoss = Number(propProfile?.rules?.max_total_loss);
      if (Number.isFinite(propMaxLoss) && propMaxLoss > 0 && propMaxLoss < maxDrawdown) {
        maxDrawdown = propMaxLoss;
      }
    } catch {
      // fallback to configured maxDrawdown
    }
  }
  if (!Number.isFinite(maxDrawdown) || maxDrawdown <= 0 || maxDrawdown > 1) {
    throw new Error('MAX_ALLOWED_DRAWDOWN must be between 0 and 1');
  }

  return { referencePrice, portfolioEquity, currentDrawdown, maxDrawdown };
}

/**
 * Bridge to simulate C++ Pre-Trade Risk logic
 */
class RiskEngineBridge {
  async checkRisk(order: TradeOrder, context: RiskContext): Promise<{ approved: boolean; reason?: string }> {
    console.log(`[RISK-ENGINE] Pre-trade check for ${order.instrumentId} (${order.quantity} units)`);

    // --- NEW: Global Kill Switch Check ---
    // @ts-ignore
    const { findBackendBinary } = require('../../../shared/lib/runtime/paths');
    const binary: string | null = findBackendBinary();

    if (!binary) {
      const message = 'CRITICAL: Risk Engine binary not found or non-executable (FAIL-CLOSED)';
      // ALLOW BYPASS in Dry-Run mode to prevent development deadlock
      if (process.env.LIVE_TRADING !== 'true' && !process.argv.includes('--live')) {
        console.warn(`${ansi.boldYellow}[WARNING] ${message}${ansi.reset}`);
        console.warn(`${ansi.boldYellow}[WARNING] Proceeding without C++ risk checks (DRY-RUN ONLY)${ansi.reset}`);
        return { approved: true };
      }
      return { 
        approved: false, 
        reason: message 
      };
    }

    const result = spawnSync(binary, ['kill-switch', 'status'], { encoding: 'utf8' });
    if (result.status === 0) {
      try {
        const status = JSON.parse(result.stdout);
        if (status.status === 'engaged') {
          return { approved: false, reason: 'GLOBAL KILL SWITCH ENGAGED' };
        }
      } catch (e) {
        return { 
          approved: false, 
          reason: 'CRITICAL: Risk Engine returned invalid status payload' 
        };
      }
    } else {
      return { 
        approved: false, 
        reason: 'CRITICAL: Risk Engine process failed during safety check' 
      };
    }
    
    // Preparation for C++ Risk Check
    let units = order.quantity;
    if (order.broker === 'mt5') {
      const unitsPerLot = order.unitsPerLot && order.unitsPerLot > 0
        ? order.unitsPerLot
        : (/^[A-Z]{6}$/.test(order.instrumentId)
            ? 100000
            : (/^(XAUUSD|XAGUSD|XAU|XAG)$/.test(order.instrumentId) ? 100 : 1));
      if (order.quantity < 50.0) {
        units = order.quantity * unitsPerLot;
      }
    }
    const notional = context.referencePrice * units;

    const riskCheckArgs = [
      'risk', 'check',
      '--notional', notional.toString(),
      '--equity', context.portfolioEquity.toString(),
      // Keep the legacy alias until previously built native binaries have aged out.
      '--volatility', context.portfolioEquity.toString(),
      '--drawdown', context.currentDrawdown.toString(),
      '--max-drawdown', context.maxDrawdown.toString()
    ];

    console.log(`[RISK-ENGINE-BRIDGE] Invoking: ${binary} ${riskCheckArgs.join(' ')}`);
    const riskResult = spawnSync(binary, riskCheckArgs, { encoding: 'utf8' });

    if (riskResult.status === 0 || riskResult.status === 2) {
       try {
          const decision = JSON.parse(riskResult.stdout);
          return {
             approved: decision.approved,
             reason: decision.reason
          };
       } catch (e) {
          return {
             approved: false,
             reason: `CRITICAL: Risk Engine returned malformed JSON: ${riskResult.stdout}`
          };
       }
    }

    return { 
      approved: false, 
      reason: `CRITICAL: Risk Engine execution failed (Code: ${riskResult.status})` 
    };
  }
}

class ExecutionGateway {
  private dryRun: boolean;
  private adapter: BrokerAdapter;
  private riskEngine: RiskEngineBridge;
  private persistence: any; // PersistenceBridge (CommonJS require — value, not a type)
  private paperMaxNotional: number | null;

  constructor(options: { dryRun?: boolean; adapter?: BrokerAdapter; paperMaxNotional?: number } = {}) {
    this.dryRun = options.dryRun ?? true;
    this.adapter = options.adapter || new AlpacaAdapter();
    this.riskEngine = new RiskEngineBridge();
    this.persistence = new PersistenceBridge();
    this.paperMaxNotional = Number.isFinite(options.paperMaxNotional) && Number(options.paperMaxNotional) > 0
      ? Number(options.paperMaxNotional)
      : null;
  }

  async validateOrder(order: TradeOrder): Promise<boolean> {
    console.log(`[EXECUTION] Validating order for ${order.instrumentId}`);
    
    // Basic structural validation
    if (order.quantity <= 0) {
      const msg = 'Quantity must be positive';
      console.error(`[RISK] Rejection: ${msg}`);
      order.error = msg;
      return false;
    }
    if (order.type === 'limit' && (!Number.isFinite(order.price || NaN) || (order.price || 0) <= 0)) {
      const msg = 'Limit orders require a positive price';
      console.error(`[RISK] Rejection: ${msg}`);
      order.error = msg;
      return false;
    }

    let riskContext: RiskContext;
    try {
      // Provider-paper execution is non-live and must not require live-only
      // drawdown state, while still running the native risk-engine check.
      riskContext = await buildRiskContext(order, this.adapter, this.dryRun || Boolean(order.providerPaper));
    } catch (error: any) {
      console.error(`[RISK] Rejection: ${error.message}`);
      order.error = error.message;
      return false;
    }

    if (order.providerPaper && this.paperMaxNotional !== null) {
      const notional = riskContext.referencePrice * order.quantity;
      if (!Number.isFinite(notional) || notional > this.paperMaxNotional) {
        const msg = `Paper Alpaca notional ${notional} exceeds cap ${this.paperMaxNotional}`;
        console.error(`[RISK] Rejection: ${msg}`);
        order.error = msg;
        return false;
      }
    }

    // Advanced risk engine validation (C++ Bridge)
    const riskResult = await this.riskEngine.checkRisk(order, riskContext);
    if (!riskResult.approved) {
      console.error(`[RISK] Rejection: ${riskResult.reason}`);
      order.error = riskResult.reason;
      return false;
    }

    return true;
  }

  async execute(order: TradeOrder): Promise<void> {
    const isValid = await this.validateOrder(order);
    if (!isValid) {
      order.status = OrderStatus.RISK_REJECTED;
      await this.persistence.logOrder(order, 'internal', { reason: 'risk_rejected' });
      return;
    }

    if (this.dryRun) {
      console.log(`[DRY-RUN] Would execute ${order.side} ${order.quantity} of ${order.instrumentId}`);
      order.status = OrderStatus.SUBMITTED;
      await this.persistence.logOrder(order, 'simulated');
    } else {
      try {
        const result = await this.adapter.placeOrder(order);
        const label = order.providerPaper ? 'PAPER-ALPACA' : 'LIVE';
        console.log(`[${label}] Order placed successfully: ${result.orderId} (Status: ${result.status})`);
        order.status = result.status === 'filled' ? OrderStatus.FILLED : OrderStatus.SUBMITTED;
        order.orderId = result.orderId;

        try {
          const subLedger = require('../../../shared/lib/runtime/sub_positions_ledger.js');
          if (order.side === 'buy') {
            subLedger.recordSubPositionEntry({
              symbol: order.instrumentId,
              strategyId: order.strategyId || order.strategy || 'manual',
              quantity: order.quantity,
              entryPrice: order.price || 0,
              source: order.source || (order.strategyId || order.strategy ? 'bot' : 'manual'),
              timeframe: order.timeframe || '1m',
              confidence: order.confidence || 1.0,
              signature: order.clientOrderId || order.signature,
              orderId: result.orderId,
              submittedAt: order.submittedAt || new Date().toISOString()
            });
          } else if (order.side === 'sell') {
            subLedger.recordSubPositionExit(
              order.instrumentId,
              order.strategyId || order.strategy || 'manual',
              order.quantity,
              { exitPrice: order.price || 0 }
            );
          }
        } catch (ledgerErr) {
          console.warn(`[LEDGER-SYNC] Warning: Could not record sub-position in ledger:`, ledgerErr);
        }

        await this.persistence.logOrder(order, order.providerPaper ? 'alpaca_paper' : 'alpaca', {
          order_id: result.orderId,
          strategy: order.strategyId || order.strategy || null,
          signature: order.clientOrderId || order.signature || null,
          paper: Boolean(order.providerPaper),
        }, result);

      } catch (error: any) {
        const label = order.providerPaper ? 'PAPER-ALPACA' : 'LIVE';
        console.error(`[${label}] Execution failed: ${error}`);
        order.status = OrderStatus.FAILED;
        order.error = error.message ?? String(error);
        await this.persistence.logOrder(order, order.providerPaper ? 'alpaca_paper' : 'alpaca', {
          error: error.message,
          strategy: order.strategy || null,
          paper: Boolean(order.providerPaper),
        });
      }
    }
  }

  async processProposedOrders(filePath: string): Promise<void> {
    return processProposedOrdersFile(filePath, this);
  }
}

function printUsage() {
  console.log(`
Sovereign Alpaca Execution Gateway

Usage:
  npx ts-node execution_gateway/src/index.ts [command] [options]

Commands:
  buy <symbol> <qty> [type] [price]    Place a buy order
  sell <symbol> <qty> [type] [price]   Place a sell order
  balance                              Show account balance
  positions                            Show account positions
  aggregate_portfolio                  Aggregate balances across all brokers
  polymarket portfolio                 Show pUSD, open orders, and filled positions
  polymarket debug                     Show signer/funder, balance, allowance, and account diagnostics
  polymarket auth-health               Run no-spend auth/read probes for the active Polymarket mode
  polymarket collateral-probe          Show signer/funder and collateral balance/allowance only
  polymarket modes                     Probe the main Polymarket signer/funder/signature-type combinations
                                       Add --collateral-only to keep the matrix read-light
  polymarket investigate --csv <path>  Trace a CSV export and probe downstream candidates automatically
  polymarket probe --address <addr>    Probe one arbitrary funder address with signature types 1 and 3
  polymarket topology                  Show Polymarket address roles and configured funder mode
  polymarket trace --csv <path>        Summarize funding-path inflows and downstream recipients from explorer CSV
  polymarket markets [limit]           List active prediction markets (public, no auth)
  polymarket orderbook --token <id>    Show public order book depth for one token id
  polymarket price-history --token <id> [--interval 1h] [--fidelity N]
                                       Show public price history for one token id
  polymarket paper-run                 Run paper-trading cycle without submitting CLOB orders
                                       Sizing: --sizing-mode notional|units|risk_budget --size <value>
                                       Risk sizing also requires --stop-price <0..1>
  polymarket buy <token> <qty> [price] Submit a live buy order for one token id
  polymarket sell <token> <qty> [price] Submit a live sell order for one token id
                                       Add --preflight to sign and validate without posting
                                       Add --tick-size <0.001> to reuse a known orderbook tick size
  polymarket derive-creds              Derive L2 API credentials from POLYMARKET_PRIVATE_KEY
  process [file]                       Process proposed orders from a JSON file

Options:
  --live                               Run in LIVE mode (default is dry-run)
  --paper-provider                     Submit to Alpaca Paper only; cannot be combined with --live
  --paper-max-notional <usd>           Cap each Alpaca Paper order (default: $100)
  --strategy <name>                    Strategy label persisted with the order
  --json                               Output as JSON
  --demo                               Run the demo sequence

Examples:
  npx ts-node execution_gateway/src/index.ts buy AAPL 10
  npx ts-node execution_gateway/src/index.ts sell TSLA 5 limit 180 --live
  npx ts-node execution_gateway/src/index.ts balance
  npx ts-node execution_gateway/src/index.ts polymarket portfolio
  `);
}

function createExecutionGatewayAdapter(adapter: any) {
  return new ExecutionGateway({ dryRun: false, adapter });
}

async function submitPolymarketOrder(tokenId: string, quantity: number, price?: number, tickSizeOverride?: string, side: 'buy' | 'sell' = 'buy'): Promise<any> {
  return submitPolymarketOrderExt(tokenId, quantity, price, tickSizeOverride, side, createExecutionGatewayAdapter);
}

function buildPolymarketBotExecutionOptions(): BotExecutionOptions {
  return buildPolymarketBotExecutionOptionsExt(createExecutionGatewayAdapter);
}

async function promptPin(): Promise<string> {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const pin = await rl.question('Enter Trade PIN to confirm LIVE execution: ');
    return pin.trim();
  } finally {
    rl.close();
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const environmentSurface = process.env.SOVEREIGN_ENVIRONMENT_SURFACE;
  if (!['gateway_public', 'gateway_account', 'execution'].includes(String(environmentSurface || ''))) {
    console.error('environment_surface_required');
    process.exitCode = 1;
    return;
  }

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const providerPaper = args.includes('--paper-provider');
  if (providerPaper && args.includes('--live')) {
    console.error('paper-provider cannot be combined with --live');
    process.exitCode = 1;
    return;
  }
  const command = (args[0] || '').toLowerCase();
  const wantsLive = args.includes('--live');
  const broker = parseOptionValue(args, '--broker')?.toLowerCase() || (command === 'polymarket' ? 'polymarket' : 'alpaca');
  let runtimePolicy = resolveRuntimePolicy({
    args,
    broker,
  });
  let isLive = runtimePolicy.can_execute;
  const useJson = args.includes('--json');

  if (wantsLive && !isLive && (command === 'buy' || command === 'sell')) {
    if (useJson || !process.stdin.isTTY) {
      if (useJson) {
        console.log(JSON.stringify({ ok: false, error: 'Unauthorized: live execution requires elevated permissions' }));
      } else {
        console.error('Error: Unauthorized: live execution requires elevated permissions');
      }
      process.exit(1);
    } else {
      const expectedPin = process.env.SOVEREIGN_TRADE_PIN;
      if (!expectedPin) {
        console.error('Error: SOVEREIGN_TRADE_PIN not set. Live execution blocked (Fail-Closed).');
        process.exit(1);
      }
      const enteredPin = await promptPin();
      if (!verifyPin(enteredPin, expectedPin)) {
        console.error('Error: Invalid Trade PIN. Live execution blocked.');
        process.exit(1);
      }
      process.env.SOVEREIGN_EXECUTION_AUTHORIZED = 'true';
      runtimePolicy = resolveRuntimePolicy({
        args,
        broker,
        executionAuthorized: true,
      });
      if (!runtimePolicy.can_execute) {
        console.error(`Error: Execution blocked by policy: ${runtimePolicy.blocking_reasons.join(', ')}`);
        process.exit(1);
      }
      isLive = runtimePolicy.can_execute;
    }
  }

  if (wantsLive && !isLive && (command === 'buy' || command === 'sell')) {
    if (useJson) {
      console.log(JSON.stringify({ ok: false, error: 'Unauthorized: live execution requires elevated permissions' }));
    } else {
      console.error('Error: Unauthorized: live execution requires elevated permissions');
    }
    process.exit(1);
  }

  const adapter = broker === 'mt5'
    ? new Mt5Adapter()
    : (broker === 'gate_io' || broker === 'gateio')
    ? new GateIoAdapter({ simulateIfMissingCredentials: !isLive })
    : (broker === 'deribit')
    ? new DeribitAdapter({ testnet: !isLive, simulateIfMissingCredentials: !isLive })
    : (broker === 'polymarket')
    ? new PolymarketAdapter({ simulateIfMissingCredentials: !isLive })
    : isLive
    ? new AlpacaAdapter({ paper: false, simulateIfMissingCredentials: false })
    : providerPaper
    ? new AlpacaAdapter({ paper: true, simulateIfMissingCredentials: false })
    : environmentSurface === 'gateway_account'
      ? new AlpacaAdapter({ simulateIfMissingCredentials: false })
      : new SimulationAdapter();
  const paperMaxNotional = parseOptionValue(args, '--paper-max-notional');
  const gateway = new ExecutionGateway({
    dryRun: providerPaper ? false : !isLive,
    adapter,
    paperMaxNotional: providerPaper ? Number(paperMaxNotional || process.env.ALPACA_PAPER_MAX_NOTIONAL || '100') : undefined,
  });

  try {
    if (command === 'buy' || command === 'sell') {
    // SANITIZATION
    const rawSymbol = String(args[1] || '').toUpperCase();
    const symbol = rawSymbol.replace(/[^A-Z0-9.\-_]/g, '');
    
    let qty: number;
    const rawQty = String(args[2] || '');
    if (rawQty.startsWith('amount:')) {
      const usdAmount = Number(rawQty.split(':')[1]);
      if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, error: 'Valid positive USD amount is required for amount: sizing' }));
        } else {
          console.error('Error: Valid positive USD amount is required for amount: sizing');
        }
        process.exit(1);
      }
      const price = await adapter.getQuote(symbol);
      if (price <= 0) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, error: `Unable to fetch current price for ${symbol} to calculate dollar-based sizing` }));
        } else {
          console.error(`Error: Unable to fetch current price for ${symbol} to calculate dollar-based sizing`);
        }
        process.exit(1);
      }
      qty = Math.floor(usdAmount / price);
      if (!useJson) {
        console.log(`[GATEWAY] Dollar-based sizing: $${usdAmount} / $${price} = ${qty} units`);
      }
    } else {
      qty = Number(rawQty);
    }
    
    // Filter out flags from potential type/price positions
    const nonFlagArgs = args.slice(3).filter(a => !a.startsWith('--'));
    const type = (nonFlagArgs[0] || 'market').toLowerCase() as 'market' | 'limit';
    const price = nonFlagArgs[1] ? Number(nonFlagArgs[1]) : undefined;

    if (!symbol || !Number.isFinite(qty) || qty <= 0) {
      if (useJson) {
          console.log(JSON.stringify({ ok: false, error: 'Symbol and valid positive quantity are required' }));
      } else {
          console.error('Error: Symbol and valid positive quantity are required (Check if amount: calculation resulted in 0)');
          printUsage();
      }
      process.exit(1);
    }
    
    if (type === 'limit' && (!price || !Number.isFinite(price) || price <= 0)) {
        if (useJson) {
            console.log(JSON.stringify({ ok: false, error: 'Limit orders require a valid positive price' }));
        } else {
            console.error('Error: Limit orders require a valid positive price');
        }
        process.exit(1);
    }

    const clientOrderId = parseOptionValue(args, '--client-order-id') || parseOptionValue(args, '--signature') || undefined;
    const strategyName = parseOptionValue(args, '--strategy') || undefined;
    const timeframe = parseOptionValue(args, '--timeframe') || undefined;
    const confidenceVal = parseOptionValue(args, '--confidence');
    const sourceVal = parseOptionValue(args, '--source') as 'bot' | 'manual' | undefined;
    const slVal = parseOptionValue(args, '--sl') || parseOptionValue(args, '--stop-loss');
    const tpVal = parseOptionValue(args, '--tp') || parseOptionValue(args, '--take-profit');
    const unitsPerLotVal = parseOptionValue(args, '--units-per-lot');
    const slNum = slVal ? Number(slVal) : undefined;
    const tpNum = tpVal ? Number(tpVal) : undefined;
    const unitsPerLotNum = unitsPerLotVal ? Number(unitsPerLotVal) : undefined;

    const order: TradeOrder = {
      instrumentId: symbol,
      side: command as OrderSide,
      quantity: qty,
      type,
      price,
      status: OrderStatus.PROPOSED,
      timestamp: new Date(),
      strategy: strategyName,
      strategyId: strategyName,
      clientOrderId,
      timeframe,
      confidence: confidenceVal ? Number(confidenceVal) : undefined,
      source: sourceVal || (strategyName ? 'bot' : 'manual'),
      submittedAt: new Date().toISOString(),
      providerPaper,
      broker,
      sl: slNum,
      tp: tpNum,
      stopLoss: slNum,
      takeProfit: tpNum,
      unitsPerLot: unitsPerLotNum,
    };

    await gateway.execute(order);
    const orderFailed = order.status === OrderStatus.FAILED || order.status === OrderStatus.RISK_REJECTED;
    if (orderFailed) {
      process.exitCode = 1;
      const errMsg = order.error || `Order ${order.status}`;
      if (useJson) {
        console.log(JSON.stringify({ ok: false, error: errMsg, order }));
      } else {
        console.error(`[GATEWAY] Order ${order.status}: ${errMsg}`);
      }
    } else {
      if (useJson) {
        console.log(JSON.stringify({ ok: true, order }));
      }
    }
  } else if (command === 'cancel') {
    const orderId = String(args[1] || '');
    if (!orderId) {
      if (useJson) console.log(JSON.stringify({ ok: false, error: 'Missing orderId' }));
      else console.error('Error: Missing orderId');
      process.exit(1);
    }
    try {
      const ok = await adapter.cancelOrder(orderId);
      if (useJson) console.log(JSON.stringify({ ok }));
      else console.log(`[GATEWAY] Cancel order ${orderId}: ${ok ? 'SUCCESS' : 'FAILED'}`);
    } catch (err: any) {
      if (useJson) console.log(JSON.stringify({ ok: false, error: err.message }));
      else console.error(`[GATEWAY] Cancel error: ${err.message}`);
      process.exit(1);
    }
  } else if (command === 'balance') {
    try {
      const balances = await adapter.getPortfolioBalance();
      if (useJson) {
        console.log(JSON.stringify(balances));
      } else {
        console.log(`[GATEWAY] Current Portfolio Balances:`, balances);
      }
    } catch (err: any) {
      if (useJson) console.log(JSON.stringify({ ok: false, error: err.message }));
      else console.error(`[GATEWAY] Balance error: ${err.message}`);
      process.exitCode = 1;
    }
  } else if (command === 'positions') {
    try {
      const rawPositions = await adapter.getPositions();
      let positions = rawPositions;
      try {
        const subLedger = require('../../../shared/lib/runtime/sub_positions_ledger.js');
        positions = subLedger.reconcilePositions(rawPositions);
      } catch {
        // Fallback to raw positions if ledger unavailable
      }
      if (useJson) {
        console.log(JSON.stringify({ ok: true, positions }));
      } else {
        console.log(`[GATEWAY] Current Positions:`, positions);
      }
    } catch (err: any) {
      if (useJson) console.log(JSON.stringify({ ok: false, error: err.message }));
      else console.error(`[GATEWAY] Positions error: ${err.message}`);
      process.exitCode = 1;
    }
  } else if (command === 'aggregate_portfolio') {
    const alpacaScope = parseOptionValue(args, '--alpaca-scope') || 'both';
    const source = {
      async collect(scope: string) {
        const specs = buildAlpacaPortfolioAdapterSpecs(scope);
        const mt5ConnectTimeout = Number(process.env.MT5_CONNECT_TIMEOUT_MS || (process.env.SOVEREIGN_NONINTERACTIVE === 'true' ? '50' : '100'));
        const mt5Adapter = new Mt5Adapter({ connectTimeoutMs: mt5ConnectTimeout });
        const liveAdapters = [
          ...specs.live.map((entry: { name: string; paper: boolean }) => ({
            name: entry.name,
            adapter: new AlpacaAdapter({ paper: entry.paper, simulateIfMissingCredentials: false }),
          })),
          { name: 'Gate.io', adapter: new GateIoAdapter({ simulateIfMissingCredentials: false }) },
          { name: 'Deribit (Options Live)', adapter: new DeribitAdapter({ testnet: false, simulateIfMissingCredentials: false }) },
          { name: 'MetaTrader 5', adapter: mt5Adapter },
        ];
        const livePaperAdapters = [
          ...specs.live_paper.map((entry: { name: string; paper: boolean }) => ({
            name: entry.name,
            adapter: new AlpacaAdapter({ paper: entry.paper, simulateIfMissingCredentials: false }),
          })),
          { name: 'Deribit (Options Testnet)', adapter: new DeribitAdapter({ testnet: true, simulateIfMissingCredentials: false }) },
        ];

        const fetchAdapterResults = (adapters: { name: string; adapter: BrokerAdapter }[]) =>
          Promise.all(adapters.map(async (entry) => {
            try {
              const [balance, positions] = await Promise.all([
                entry.adapter.getPortfolioBalance(),
                entry.adapter.getPositions(),
              ]);
              return { name: entry.name, ok: true, balance, positions };
            } catch (e: any) {
              return { name: entry.name, ok: false, error: e.message };
            }
          }));

        let liveResults: any[];
        let livePaperResults: any[];
        let polymarket: any;
        try {
          [liveResults, livePaperResults, polymarket] = await Promise.all([
            fetchAdapterResults(liveAdapters),
            fetchAdapterResults(livePaperAdapters),
            fetchPolymarketPortfolio(),
          ]);
        } finally {
          try {
            await mt5Adapter.stop();
          } catch {}
        }
        const internalPaperPortfolio = loadInternalPaperPortfolio();

        return { liveResults, livePaperResults, polymarket, internalPaperPortfolio };
      },
    };

    const success = await runAggregatePortfolioCommand({
      scope: alpacaScope,
      source,
      output: console,
      useJson,
    });
    if (!success) {
      process.exitCode = 1;
    }
  } else if (command === 'polymarket') {
    const sub = (args[1] || 'portfolio').toLowerCase();
    if (sub === 'portfolio' || sub === 'balance') {
      const pm = await fetchPolymarketPortfolio();
      if (useJson) {
        console.log(JSON.stringify(pm));
      } else {
        renderPolymarketSection(pm);
      }
    } else if (sub === 'debug') {
      const debug = await fetchPolymarketDebug();
      if (useJson) {
        console.log(JSON.stringify(debug));
      } else {
        renderPolymarketDebugSection(debug);
      }
    } else if (sub === 'auth-health') {
      const health = await fetchPolymarketAuthHealth();
      if (useJson) {
        console.log(JSON.stringify(health));
      } else {
        renderPolymarketAuthHealthSection(health);
      }
    } else if (sub === 'modes') {
      const modes = await fetchPolymarketModes({ collateralOnly: args.includes('--collateral-only') || args.includes('--light') });
      if (useJson) {
        console.log(JSON.stringify(modes));
      } else {
        console.log(JSON.stringify(modes, null, 2));
      }
    } else if (sub === 'collateral-probe') {
      const subArgs = args.slice(2);
      const address = parseOptionValue(subArgs, '--address');
      const rawSignatureType = parseOptionValue(subArgs, '--signature-type');
      const parsedSignatureType = rawSignatureType !== undefined ? Number(rawSignatureType) : undefined;
      const probe = await fetchPolymarketCollateralProbe({
        funderAddress: address,
        signatureType: Number.isInteger(parsedSignatureType) ? parsedSignatureType : undefined,
      });
      if (useJson) {
        console.log(JSON.stringify(probe));
      } else {
        console.log(JSON.stringify(probe, null, 2));
      }
    } else if (sub === 'investigate') {
      const investigate = await fetchPolymarketInvestigate(args.slice(2));
      if (useJson) {
        console.log(JSON.stringify(investigate));
      } else {
        console.log(JSON.stringify(investigate, null, 2));
      }
    } else if (sub === 'probe') {
      const address = parseOptionValue(args.slice(2), '--address');
      const probe = address
        ? await fetchPolymarketProbe(address)
        : { ok: false, address: '', results: [], error: 'Missing --address <0x...>' };
      if (useJson) {
        console.log(JSON.stringify(probe));
      } else {
        console.log(JSON.stringify(probe, null, 2));
      }
    } else if (sub === 'topology') {
      const topology = await fetchPolymarketTopology();
      if (useJson) {
        console.log(JSON.stringify(topology));
      } else {
        console.log(JSON.stringify(topology, null, 2));
      }
    } else if (sub === 'trace') {
      const trace = fetchPolymarketTrace(args.slice(2));
      if (useJson) {
        console.log(JSON.stringify(trace));
      } else {
        console.log(JSON.stringify(trace, null, 2));
      }
    } else if (sub === 'derive-creds') {
      const pk = process.env.POLYMARKET_PRIVATE_KEY;
      if (!pk) {
        console.error(`${ansi.red}POLYMARKET_PRIVATE_KEY not set in .env${ansi.reset}`);
        process.exit(1);
      }
      const revealCreds = args.includes('--reveal');
      const maskValue = (val: string) => revealCreds ? val : (val ? `${String(val).slice(0, 4)}…` : '');
      try {
        const { Wallet } = await import('ethers');
        const signer = new Wallet(pk);
        const settings = resolvePolymarketClientSettings(process.env, { privateKey: pk });
        const client = await createClobClient({
          privateKey: pk,
          funderAddress: settings.funderAddress,
          signatureType: settings.signatureType,
          host: settings.host,
        });
        console.log(`${ansi.boldYellow}Deriving L2 API credentials from wallet ${signer.address}...${ansi.reset}`);
        const derivation = await derivePolymarketApiCreds(client as any);
        const normalizedCreds = derivation.creds;
        if (useJson) {
          console.log(JSON.stringify({
            key: normalizedCreds.key,
            secret: maskValue(normalizedCreds.secret),
            passphrase: maskValue(normalizedCreds.passphrase),
            source: derivation.source,
            createRequestErrors: derivation.createRequestErrors,
            deriveRequestErrors: derivation.deriveRequestErrors,
          }));
        } else {
          if (derivation.source === 'derived') {
            console.log(`${ansi.yellow}Create API key failed or returned no key; derived an existing API key instead.${ansi.reset}`);
          } else {
            console.log(`${ansi.green}Created a new API key successfully.${ansi.reset}`);
          }
          if (derivation.createRequestErrors.length > 0) {
            console.log(`${ansi.yellow}Create attempt diagnostics:${ansi.reset} ${JSON.stringify(derivation.createRequestErrors[0])}`);
          }
          console.log(`\n${ansi.boldCyan}Paste these into your .env:${ansi.reset}`);
          if (!revealCreds) {
            console.log(`${ansi.yellow}(secret and passphrase masked — pass --reveal to show in full)${ansi.reset}`);
          }
          console.log(`POLYMARKET_API_KEY=${normalizedCreds.key}`);
          console.log(`POLYMARKET_API_SECRET=${maskValue(normalizedCreds.secret)}`);
          console.log(`POLYMARKET_API_PASSPHRASE=${maskValue(normalizedCreds.passphrase)}`);
        }
      } catch (e: any) {
        console.error(`${ansi.red}derive-creds failed: ${e.message}${ansi.reset}`);
        process.exit(1);
      }
    } else if (sub === 'markets') {
      try {
        const limitArg = args.find((arg, index) => index > 1 && /^\d+$/.test(arg));
        const categoryIndex = args.indexOf('--category');
        const category = categoryIndex >= 0 && args[categoryIndex + 1] ? args[categoryIndex + 1] : 'crypto';
        const limit = Number(limitArg) || 25;
        const result = await fetchPolymarketGammaMarkets(limit, { category });
        if (useJson) {
          console.log(JSON.stringify({ ok: true, source: result.source, category, count: result.count, sections: result.sections, data: result.data }));
        } else {
          const title = category === 'all' ? 'Active Markets' : `Active ${category.toUpperCase()} Markets`;
          console.log(`${ansi.boldCyan}${title} (${result.count}):${ansi.reset}`);
          if (result.data.length === 0) {
            console.log(`  ${ansi.yellow}No active ${category} markets returned from Gamma API.${ansi.reset}`);
          }
          result.sections.forEach((sectionGroup: any) => {
            console.log(`\n  ${ansi.boldYellow}${sectionGroup.section}${ansi.reset} ${ansi.yellow}(${sectionGroup.count})${ansi.reset}`);
            sectionGroup.data.forEach((m: any) => {
              const volume = m.volume ? `  vol: ${Number(m.volume).toLocaleString()}` : '';
              console.log(`    ${String(m.question || m.condition_id || '').slice(0, 72)}${ansi.yellow}${volume}${ansi.reset}`);
              (m.tokens ?? []).slice(0, 2).forEach((t: any) =>
                console.log(`      ${ansi.yellow}${String(t.outcome ?? '').padEnd(6)}${ansi.reset}  token: ${t.token_id}`)
              );
            });
          });
        }
      } catch (e: any) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, source: 'https://gamma-api.polymarket.com/markets', error: e.message }));
        } else {
          console.error(`${ansi.red}markets fetch failed: ${e.message}${ansi.reset}`);
        }
        process.exit(1);
      }
    } else if (sub === 'events') {
      try {
        const limitArg = args.find((arg: string, index: number) => index > 1 && /^\d+$/.test(arg));
        const categoryIndex = args.indexOf('--category');
        const category = categoryIndex >= 0 && args[categoryIndex + 1] ? args[categoryIndex + 1] : 'crypto';
        const limit = Number(limitArg) || 15;
        const result = await fetchPolymarketGammaEvents(limit, { category });
        console.log(JSON.stringify({ ok: true, source: result.source, category, count: result.count, data: result.data }));
      } catch (e: any) {
        if (useJson) {
          console.log(JSON.stringify({ ok: false, source: 'https://gamma-api.polymarket.com/events', error: e.message }));
        } else {
          console.error(`${ansi.red}events fetch failed: ${e.message}${ansi.reset}`);
        }
        process.exit(1);
      }
    } else if (sub === 'orderbook') {
      const tokenId = parseOptionValue(args.slice(2), '--token') || args[2];
      const book = await fetchPolymarketOrderBook(String(tokenId || ''));
      if (useJson) {
        console.log(JSON.stringify(book));
      } else if (!book.ok) {
        console.error(`${ansi.red}orderbook fetch failed: ${book.error}${ansi.reset}`);
        process.exit(1);
      } else {
        const bids = Array.isArray(book.book?.bids) ? book.book.bids : [];
        const asks = Array.isArray(book.book?.asks) ? book.book.asks : [];
        console.log(`${ansi.boldCyan}Polymarket Orderbook${ansi.reset} ${ansi.yellow}${book.tokenId}${ansi.reset}`);
        console.log(`  bids: ${bids.length}  asks: ${asks.length}`);
        console.log(`  top bids:`);
        bids.slice(0, 5).forEach((entry: any) => console.log(`    ${entry.price} x ${entry.size}`));
        console.log(`  top asks:`);
        asks.slice(0, 5).forEach((entry: any) => console.log(`    ${entry.price} x ${entry.size}`));
      }
    } else if (sub === 'price-history') {
      const tokenId = parseOptionValue(args.slice(2), '--token') || args[2];
      const interval = parseOptionValue(args.slice(2), '--interval') || '1h';
      const fidelityRaw = parseOptionValue(args.slice(2), '--fidelity');
      const fidelity = fidelityRaw ? Number(fidelityRaw) : undefined;
      const history = await fetchPolymarketPriceHistory(String(tokenId || ''), interval, fidelity);
      if (useJson) {
        console.log(JSON.stringify(history));
      } else if (!history.ok) {
        console.error(`${ansi.red}price-history fetch failed: ${history.error}${ansi.reset}`);
        process.exit(1);
      } else {
        const rows = Array.isArray(history.history) ? history.history : [];
        console.log(`${ansi.boldCyan}Polymarket Price History${ansi.reset} ${ansi.yellow}${history.tokenId}${ansi.reset} ${ansi.yellow}[${history.interval}]${ansi.reset}`);
        rows.slice(-10).forEach((row: any) => console.log(`  ${row.t ?? row.timestamp ?? ''}  p=${row.p ?? row.price ?? ''}`));
      }
    } else if (sub === 'paper-run') {
      const subArgs = args.slice(2);
      const strategy = parseOptionValue(subArgs, '--strategy') || 'low_prob_dip';
      const category = parseOptionValue(subArgs, '--category') || 'crypto';
      const limitRaw = parseOptionValue(subArgs, '--limit');
      const balanceRaw = parseOptionValue(subArgs, '--virtual-balance');
      const maxPositionRaw = parseOptionValue(subArgs, '--max-position-usd');
      const maxConcurrentRaw = parseOptionValue(subArgs, '--max-concurrent');
      const maxSpreadRaw = parseOptionValue(subArgs, '--max-spread');
      const maxEntryRaw = parseOptionValue(subArgs, '--max-entry-price');
      const minLiquidityRaw = parseOptionValue(subArgs, '--min-liquidity');
      const sizingModeRaw = parseOptionValue(subArgs, '--sizing-mode');
      const sizingValueRaw = parseOptionValue(subArgs, '--size');
      const stopPriceRaw = parseOptionValue(subArgs, '--stop-price');
      const limit = Math.max(1, Number.parseInt(limitRaw || '25', 10) || 25);
      try {
        const markets = await fetchPolymarketGammaMarkets(limit, { category });
        const sizingIntent = sizingModeRaw !== undefined || sizingValueRaw !== undefined || stopPriceRaw !== undefined
          ? {
              mode: sizingModeRaw || 'notional',
              value: sizingValueRaw !== undefined
                ? Number(sizingValueRaw)
                : (maxPositionRaw !== undefined ? Number(maxPositionRaw) : 1),
              currency: 'USD',
              ...(stopPriceRaw !== undefined ? { stopPrice: Number(stopPriceRaw) } : {}),
            }
          : undefined;
        const result = await runPolymarketPaperRun({
          strategy,
          markets: markets.data,
          virtualBalance: balanceRaw !== undefined ? Number(balanceRaw) : 100,
          maxPositionUsd: maxPositionRaw !== undefined ? Number(maxPositionRaw) : 1,
          maxConcurrent: maxConcurrentRaw !== undefined ? Number(maxConcurrentRaw) : 5,
          maxSpread: maxSpreadRaw !== undefined ? Number(maxSpreadRaw) : 0.08,
          maxEntryPrice: maxEntryRaw !== undefined ? Number(maxEntryRaw) : 0.15,
          minLiquidity: minLiquidityRaw !== undefined ? Number(minLiquidityRaw) : 0,
          sizingIntent,
          fetchOrderBook: fetchPolymarketOrderBook,
        });
        const payload = { ...result, source: markets.source, category };
        if (useJson) {
          console.log(JSON.stringify(payload));
          if (!payload.ok) process.exitCode = 1;
        } else if (!payload.ok) {
          console.error(`${ansi.red}paper-run failed: ${payload.error}${ansi.reset}`);
          process.exitCode = 1;
        } else {
          console.log(`${ansi.boldCyan}Polymarket Paper Run${ansi.reset} strategy=${strategy}`);
          console.log(`  sizing=${payload.sizing_intent.mode}:${payload.sizing_intent.value} max_position_usd=${maxPositionRaw !== undefined ? Number(maxPositionRaw) : 1}`);
          console.log(`  scanned=${payload.markets_scanned} fills=${payload.fills.length} skipped=${payload.skipped.length}`);
          console.log(`  balance=$${payload.summary.virtual_balance} open=${payload.summary.open_positions} equity_at_cost=$${payload.summary.equity_marked_at_cost}`);
          payload.fills.slice(0, 5).forEach((fill: any) => console.log(`    buy ${fill.shares} ${fill.outcome} @ ${fill.price}  ${String(fill.market || '').slice(0, 72)}`));
        }
      } catch (e: any) {
        const diagnostic = classifyPolymarketGatewayError(e);
        const payload = {
          ok: false,
          command: 'polymarket paper-run',
          source: 'https://gamma-api.polymarket.com/markets',
          category,
          limit,
          ...diagnostic,
        };
        if (useJson) console.log(JSON.stringify(payload));
        else console.error(`${ansi.red}paper-run failed: ${diagnostic.error}${ansi.reset}`);
        process.exit(1);
      }
    } else if (sub === 'history') {
      const historySub = (args[2] || 'backfill').toLowerCase();
      if (historySub !== 'backfill' && historySub !== 'orderbook-lite') {
        console.error(`Unknown polymarket history subcommand: ${historySub}. Available: backfill, orderbook-lite`);
        process.exit(1);
      }

      const subArgs = args.slice(3);
      if (historySub === 'backfill') {
        const history = require('../../../shared/lib/market/polymarket_history.js');
        const toNumber = (value: string | undefined, fallback: number): number => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const archiveResult = await history.backfillPolymarketArchive({
          daysBack: toNumber(parseOptionValue(subArgs, '--days'), 180),
          interval: parseOptionValue(subArgs, '--interval') || parseOptionValue(subArgs, '--timeframe') || '1h',
          maxMarkets: toNumber(parseOptionValue(subArgs, '--max-markets'), 500),
          startOffset: toNumber(parseOptionValue(subArgs, '--start-offset') || parseOptionValue(subArgs, '--offset'), 0),
          category: parseOptionValue(subArgs, '--category') || 'all',
          root: parseOptionValue(subArgs, '--archive-root'),
          includeNo: subArgs.includes('--include-no'),
          noCache: subArgs.includes('--no-cache'),
        });
        if (useJson) {
          console.log(JSON.stringify(archiveResult));
        } else {
          console.log(`${ansi.boldCyan}Polymarket History Archive Ingest${ansi.reset}`);
          console.log(`  markets:    ${archiveResult.markets_archived ?? 0}`);
          console.log(`  tokens:     ${archiveResult.tokens_archived ?? 0}`);
          console.log(`  prices:     ${archiveResult.price_points ?? 0}`);
          console.log(`  features:   ${archiveResult.feature_rows ?? 0}`);
          console.log(`  missing:    ${archiveResult.missing_history ?? 0}`);
        }
      } else {
        const toNumber = (value: string | undefined, fallback: number): number => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const orderbookLiteResult = await runPolymarketOrderbookLiteBackfill({
          tagId: toNumber(parseOptionValue(subArgs, '--tag-id'), 21),
          daysBack: toNumber(parseOptionValue(subArgs, '--days'), 365),
          strategy: parseOptionValue(subArgs, '--strategy') || 'low_prob_dip',
          maxMarkets: toNumber(parseOptionValue(subArgs, '--max-markets'), 200),
          entryThreshold: toNumber(parseOptionValue(subArgs, '--entry-threshold'), 0.15),
          interval: parseOptionValue(subArgs, '--interval') || parseOptionValue(subArgs, '--timeframe') || '1d',
          archiveRoot: parseOptionValue(subArgs, '--archive-root'),
          fee: toNumber(parseOptionValue(subArgs, '--fee'), 0),
          halfSpreadEstimate: toNumber(parseOptionValue(subArgs, '--half-spread') || parseOptionValue(subArgs, '--half-spread-estimate'), 0.01),
          impactY: toNumber(parseOptionValue(subArgs, '--impact-y'), 1),
          orderNotional: toNumber(parseOptionValue(subArgs, '--order-notional'), 10),
          rollingMarketVolume: parseOptionValue(subArgs, '--rolling-market-volume') !== undefined
            ? Number(parseOptionValue(subArgs, '--rolling-market-volume'))
            : undefined,
          captureThrottleMs: toNumber(parseOptionValue(subArgs, '--capture-throttle-ms') || parseOptionValue(subArgs, '--throttle-ms'), 250),
          pmxtApiKey: parseOptionValue(subArgs, '--pmxt-api-key') || process.env.PMXT_API_KEY || '',
          pmxtBaseUrl: parseOptionValue(subArgs, '--pmxt-base-url') || process.env.PMXT_BASE_URL || 'https://api.pmxt.dev',
          fromArchive: !subArgs.includes('--live-fetch') && !subArgs.includes('--no-archive'),
          repairMissing: subArgs.includes('--repair-missing'),
          noCache: subArgs.includes('--no-cache'),
        });
        if (useJson) {
          console.log(JSON.stringify(orderbookLiteResult));
        } else {
          console.log(`${ansi.boldCyan}Polymarket History Orderbook Lite${ansi.reset}`);
          console.log(`  downloaded: ${orderbookLiteResult.downloadedSnapshots ?? 0}`);
          console.log(`  failures:   ${orderbookLiteResult.failedSnapshots ?? 0}`);
        }
      }
    } else if (sub === 'buy' || sub === 'sell') {
      const tokenId = args[2];
      const quantity = Number(args[3]);
      const price = args[4] !== undefined ? Number(args[4]) : undefined;
      const tickSizeOverride = parseOptionValue(args.slice(2), '--tick-size');
      const preflightOnly = args.includes('--preflight');
      if (!preflightOnly && !runtimePolicy.can_execute) {
        const blocked = {
          ok: false,
          error: runtimePolicy.research_only
            ? `Live Polymarket submission blocked in ${runtimePolicy.requested_profile} mode`
            : 'Live Polymarket submission requires --live and CLI authorization',
          runtime_policy: runtimePolicy,
        };
        if (useJson) console.log(JSON.stringify(blocked));
        else console.error(`${ansi.red}${blocked.error}${ansi.reset}`);
        process.exitCode = 1;
        return;
      }
      const placed = preflightOnly
        ? await preflightPolymarketOrder(String(tokenId || ''), quantity, price, tickSizeOverride, sub)
        : await submitPolymarketOrder(String(tokenId || ''), quantity, price, tickSizeOverride, sub);
      if (useJson) {
        console.log(JSON.stringify(placed));
      } else if (!placed.ok) {
        console.error(`${ansi.red}${preflightOnly ? `${sub} preflight failed` : `${sub} failed`}: ${placed.error}${ansi.reset}`);
        if (placed.signerAddress || placed.funderAddress || placed.signatureType !== undefined) {
          console.error(`  signer=${placed.signerAddress ?? 'none'} funder=${placed.funderAddress ?? 'none'} sigType=${placed.signatureType ?? 'unset'}`);
        }
        if (placed.suggestion) {
          console.error(`  suggestion=${placed.suggestion}`);
        }
        process.exit(1);
      } else if (preflightOnly) {
        console.log(`${ansi.green}Order preflight passed.${ansi.reset} token=${placed.tokenId} qty=${placed.quantity} price=${placed.price ?? 'market_ref'}`);
        console.log(`  signer=${placed.preflight?.signerAddress ?? 'none'} funder=${placed.preflight?.funderAddress ?? 'none'} sigType=${placed.preflight?.signatureType ?? 'unset'} tickSize=${placed.preflight?.tickSize ?? 'n/a'} signed=${placed.preflight?.signed ? 'yes' : 'no'}`);
      } else {
        console.log(`${ansi.green}${sub === 'sell' ? 'Sell order' : 'Order'} submitted.${ansi.reset} token=${placed.tokenId} qty=${placed.quantity} price=${placed.price ?? 'market_ref'}`);
        console.log(`  orderId=${placed.result?.orderId} status=${placed.result?.status}`);
      }
    } else {
      console.error(`Unknown polymarket subcommand: ${sub}. Available: portfolio, balance, debug, auth-health, modes, investigate, probe, topology, trace, derive-creds, markets, orderbook, price-history, paper-run, buy, sell`);
      process.exitCode = 1;
      return;
    }
  } else if (command === 'bot') {
    const sub = (args[1] || 'status').toLowerCase();
    const submitsOrder = sub === 'cycle' || sub === 'run' || sub === 'sell';
    const botLive = runtimePolicy.requested_live;
    if (submitsOrder && botLive && !runtimePolicy.can_execute) {
      const blocked = {
        ok: false,
        error: runtimePolicy.research_only
          ? `Live Polymarket bot execution blocked in ${runtimePolicy.requested_profile} mode`
          : 'Live Polymarket bot execution requires --live and CLI authorization',
        runtime_policy: runtimePolicy,
      };
      if (useJson) console.log(JSON.stringify(blocked));
      else console.error(`${ansi.red}${blocked.error}${ansi.reset}`);
      process.exitCode = 1;
      return;
    }
    const botExecutionOptions = submitsOrder && botLive
      ? buildPolymarketBotExecutionOptions()
      : {};

    if (sub === 'cycle') {
      const result = await runCycle(args.slice(1), botExecutionOptions);
      if (useJson) {
        console.log(JSON.stringify(result));
      } else {
        const ok = result.errors.length === 0;
        const icon = ok ? `${ansi.green}✔${ansi.reset}` : `${ansi.yellow}⚠${ansi.reset}`;
        console.log(`\n${ansi.boldCyan}--- BOT CYCLE COMPLETE ---${ansi.reset}`);
        console.log(`  ${icon} Sold: ${result.sellsExecuted}  Bought: ${result.buysFilled}  Errors: ${result.errors.length}  DryRun: ${result.dryRun}`);
        if (result.errors.length) result.errors.forEach((e: string) => console.warn(`  ${ansi.yellow}⚠ ${e}${ansi.reset}`));
        const skipped = (result as any).skipped as string[];
        const wouldBuy = (result as any).wouldBuy as any[];
        if (skipped?.length) {
          console.log(`\n  ${ansi.yellow}Skipped:${ansi.reset}`);
          skipped.forEach((s: string) => console.log(`    · ${s}`));
        }
        if (wouldBuy?.length) {
          console.log(`\n  ${ansi.boldCyan}${result.dryRun ? 'Would buy' : 'Bought'} (${wouldBuy.length}):${ansi.reset}`);
          wouldBuy.forEach((b: any) => console.log(`    ${ansi.green}${b.side.padEnd(4)}${ansi.reset} ${b.slug}  price: ${b.price}  edge: ${b.edge}%  ai: ${b.aiProb}%  target: ${b.target}`));
        } else if (!result.errors.length && !skipped?.length) {
          console.log(`  ${ansi.yellow}No candidates met the edge threshold (${ansi.reset}run bot health to diagnose${ansi.yellow})${ansi.reset}`);
        }
      }

    } else if (sub === 'status') {
      const state = loadBotState();
      if (useJson) {
        console.log(JSON.stringify({ ok: true, ...state }));
      } else {
        console.log(`\n${ansi.boldCyan}--- BOT STATUS ---${ansi.reset}`);
        console.log(`  Enabled:   ${state.config.enabled ? ansi.green + 'yes' : ansi.red + 'no'}${ansi.reset}   Live: ${state.config.liveTrading ? ansi.yellow + 'YES' : 'no'}${ansi.reset}`);
        console.log(`  Positions: ${state.positions.length}/${state.config.maxPositions}   Last cycle: ${state.lastCycleAt ?? 'never'}`);
        console.log(`  Min edge:  ${(state.config.minEdgeThreshold * 100).toFixed(0)}%   Bet size: $${state.config.positionSizeUsdc}   Stop-loss: ${(state.config.stopLossPct * 100).toFixed(0)}%`);
      }

    } else if (sub === 'health') {
      const health = await runBotHealth();
      if (useJson) {
        console.log(JSON.stringify(health));
      } else {
        console.log(`\n${ansi.boldCyan}--- BOT HEALTH ---${ansi.reset}`);
        for (const c of health.checks) {
          const icon = c.ok ? `${ansi.green}✔${ansi.reset}` : `${ansi.red}✖${ansi.reset}`;
          let detail = c.detail;
          // pUSD balance is stored in micro-units (1e6 = $1); convert to display dollars
          if (c.label === 'pUSD balance' && typeof detail === 'string') {
            const match = detail.match(/^([\d.]+)\s+pUSD(.*)/);
            if (match) {
              const displayAmount = (Number(match[1]) / 1e6).toFixed(2);
              detail = `${displayAmount} pUSD${match[2]}`;
            }
          }
          console.log(`  ${icon}  ${c.label.padEnd(42)} ${c.ok ? ansi.green : ansi.yellow}${detail}${ansi.reset}`);
        }
        console.log();
        if (health.ok) {
          console.log(`  ${ansi.boldGreen}All checks passed — ready to trade.${ansi.reset}`);
        } else {
          console.log(`  ${ansi.yellow}Some checks failed. Fix the issues above, then run again.${ansi.reset}`);
        }
      }

    } else if (sub === 'run') {
      await runBotLoop(args.slice(1), botExecutionOptions);

    } else if (sub === 'sell') {
      const idx = args.indexOf('--position-id');
      const posId = idx !== -1 ? args[idx + 1] : '';
      if (!posId) {
        console.error(`${ansi.red}--position-id required${ansi.reset}`);
        process.exit(1);
      }
      const result = await runForceSell(posId, args.slice(1), botExecutionOptions);
      if (useJson) {
        console.log(JSON.stringify(result));
      } else {
        if (result.ok) console.log(`${ansi.green}Force-sold position ${posId}. PnL: ${result.pnl?.toFixed(4) ?? 'n/a'}${ansi.reset}`);
        else console.error(`${ansi.red}Force-sell failed: ${result.error}${ansi.reset}`);
      }

    } else if (sub === 'config') {
      const kIdx = args.indexOf('--key');
      const vIdx = args.indexOf('--value');
      const key   = kIdx !== -1 ? args[kIdx + 1] : '';
      const value = vIdx !== -1 ? args[vIdx + 1] : '';
      const state = loadBotState();
      if (key && value !== '') {
        try {
          (state.config as any)[key] = JSON.parse(value);
          saveBotState(state);
          console.log(useJson ? JSON.stringify({ ok: true, config: state.config }) : `${ansi.green}Config updated: ${key} = ${value}${ansi.reset}`);
        } catch {
          console.error(`${ansi.red}Invalid value for ${key}${ansi.reset}`);
        }
      } else {
        console.log(useJson ? JSON.stringify({ ok: true, config: state.config }) : JSON.stringify(state.config, null, 2));
      }

    } else {
      console.error(`Unknown bot subcommand: ${sub}. Available: cycle, status, health, run, sell, config`);
      process.exit(1);
    }

  } else if (command === 'process') {
    const proposedOrdersPath = args[1] || process.env.ORDERS_FILE || 'proposed_orders.json';
    try {
      await gateway.processProposedOrders(proposedOrdersPath);
    } catch {
      process.exitCode = 1;
    }
  } else if (args.includes('--demo')) {
    console.log(`[GATEWAY] Initialized (DryRun: ${!isLive})`);
    const balances = await adapter.getPortfolioBalance();
    console.log(`[GATEWAY] Current Portfolio Balances:`, balances);
    
    const sampleOrder: TradeOrder = {
      instrumentId: 'AAPL',
      side: OrderSide.BUY,
      quantity: 1,
      type: 'market',
      status: OrderStatus.PROPOSED,
      timestamp: new Date()
    };
    await gateway.execute(sampleOrder);
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exitCode = 1;
  }
  } finally {
    if (typeof (adapter as any)?.stop === 'function') {
      try {
        await (adapter as any).stop();
      } catch {
        // ignore adapter teardown error
      }
    }
  }
}

export function createPolymarketReadAdapter(options: PolymarketAdapterOptions = {}): PolymarketAdapter {
  return new PolymarketAdapter(options);
}

export async function runGatewayEntrypoint(entrypoint: () => Promise<void> = main): Promise<void> {
  try {
    await entrypoint();
  } catch (error: any) {
    process.exitCode = 1;
    console.error(error?.message || String(error));
  }
}

if (require.main === module) {
  runGatewayEntrypoint(main);
}

