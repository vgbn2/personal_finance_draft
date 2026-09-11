import * as net from 'node:net';
import * as readline from 'node:readline';
import {
  BrokerAdapter,
  Position,
  TradeOrder,
  Mt5OrderSubmitMessage,
  Mt5OrderResultMessage,
  Mt5RegistrationMessage,
} from './types';

// @ts-ignore
const { MagicCodec } = require('../../../../shared/lib/runtime/mt5_magic_codec.js');

export interface Mt5AdapterOptions {
  port?: number;
  host?: string;
  timeoutMs?: number;
  autoStartServer?: boolean;
}

export class Mt5Adapter implements BrokerAdapter {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private terminalInfo: Mt5RegistrationMessage | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private readonly port: number;
  private readonly host: string;
  private readonly timeoutMs: number;

  constructor(options: Mt5AdapterOptions = {}) {
    this.port = options.port ?? Number(process.env.MT5_BRIDGE_PORT || '8282');
    this.host = options.host ?? (process.env.MT5_BRIDGE_HOST || '127.0.0.1');
    this.timeoutMs = options.timeoutMs ?? 15000;
    if (options.autoStartServer !== false) {
      this.startServer().catch((err) => {
        console.error(`[MT5-BRIDGE] Server initialization error: ${err.message}`);
      });
    }
  }

  public startServer(): Promise<void> {
    if (this.server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.server = net.createServer((sock) => {
        if (this.socket) {
          try {
            this.socket.destroy();
          } catch {
            // ignore cleanup of superseded socket
          }
        }
        this.socket = sock;
        const rl = readline.createInterface({ input: sock, crlfDelay: Infinity });
        rl.on('line', (line) => this.handleMessage(line));

        sock.on('close', () => {
          if (this.socket === sock) {
            this.socket = null;
            this.terminalInfo = null;
          }
          this.rejectPendingRequests('MT5 terminal bridge disconnected');
        });

        sock.on('error', (err) => {
          console.warn(`[MT5-BRIDGE] Socket error: ${err.message}`);
        });
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  private rejectPendingRequests(reason: string) {
    for (const [nonce, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`${reason} (nonce: ${nonce})`));
    }
    this.pendingRequests.clear();
  }

  private handleMessage(rawLine: string) {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.type === 'REGISTER') {
        this.terminalInfo = msg as Mt5RegistrationMessage;
        this.sendLine({ type: 'REGISTER_ACK', ok: true });
        return;
      }
      if (msg.nonce && this.pendingRequests.has(msg.nonce)) {
        const req = this.pendingRequests.get(msg.nonce)!;
        clearTimeout(req.timer);
        this.pendingRequests.delete(msg.nonce);
        req.resolve(msg);
      }
    } catch {
      console.error(`[MT5-BRIDGE] Failed to parse line: ${trimmed}`);
    }
  }

  private sendLine(payload: any) {
    if (!this.socket || !this.socket.writable) {
      throw new Error('MT5 terminal bridge is not connected');
    }
    this.socket.write(JSON.stringify(payload) + '\n');
  }

  private request<T>(command: any, timeoutOverrideMs?: number): Promise<T> {
    const nonce = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timeout = timeoutOverrideMs ?? this.timeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(nonce);
        reject(new Error(`Timeout waiting for MT5 response (nonce: ${nonce})`));
      }, timeout);

      this.pendingRequests.set(nonce, { resolve, reject, timer });
      try {
        this.sendLine({ ...command, nonce });
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(nonce);
        reject(err);
      }
    });
  }

  async placeOrder(order: TradeOrder): Promise<{ orderId: string; status: string }> {
    const magic = MagicCodec.encode({
      strategyId: order.strategyId || order.strategy || 'manual',
      timeframeMinutes: 1,
      instanceId: 1,
    });

    const payload: Partial<Mt5OrderSubmitMessage> = {
      type: 'ORDER_SUBMIT',
      symbol: order.instrumentId,
      side: order.side,
      orderType: order.type,
      quantity: order.quantity,
      price: order.price,
      magic,
      clientOrderId: order.clientOrderId,
      comment: `sov|${order.strategyId || order.strategy || 'cli'}`.slice(0, 31),
    };

    const res = await this.request<Mt5OrderResultMessage>(payload);
    if (!res.ok) {
      throw new Error(`MT5 Order Rejected: ${res.retcodeDescription || res.retcode} ${res.error || ''}`.trim());
    }
    return {
      orderId: String(res.ticket || res.deal || Date.now()),
      status: 'filled',
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const res = await this.request<{ ok: boolean }>({
      type: 'ORDER_CANCEL',
      ticket: Number(orderId),
    });
    return Boolean(res && res.ok);
  }

  async getPortfolioBalance(): Promise<Record<string, number>> {
    const res = await this.request<{ ok: boolean; balance: number; equity: number; freeMargin: number }>({
      type: 'ACCOUNT_GET',
    });
    return {
      USD: res.balance || 0,
      EQUITY: res.equity || 0,
      FREE_MARGIN: res.freeMargin || 0,
    };
  }

  async getPositions(): Promise<Position[]> {
    const res = await this.request<{ ok: boolean; positions: any[] }>({
      type: 'POSITIONS_GET',
    });
    return (res.positions || []).map((p) => ({
      symbol: p.symbol,
      quantity: p.volume || p.quantity || 0,
      averagePrice: p.openPrice || p.averagePrice || 0,
      marketValue: p.marketValue || 0,
      unrealizedPl: p.unrealizedPl || p.profit || 0,
      side: p.side,
      asset_id: String(p.ticket || ''),
    }));
  }

  async getQuote(symbol: string): Promise<number> {
    const res = await this.request<{ ok: boolean; price: number }>({
      type: 'QUOTE_GET',
      symbol,
    });
    return res.price || 0;
  }

  public getTerminalInfo(): Mt5RegistrationMessage | null {
    return this.terminalInfo;
  }

  public stop(): Promise<void> {
    this.rejectPendingRequests('MT5 adapter stopping');
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
