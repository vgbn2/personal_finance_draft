import { IEngine } from '../core/EngineRegistry.js';

export interface MarketData {
    symbol: string;
    price: number;
    timestamp: number;
}

export class MarketEngine implements IEngine {
    public id = 'market-engine';
    public name = 'Market Data Engine';
    public description = 'Manages live market data and state';

    private marketState: Map<string, MarketData> = new Map();

    public async initialize(): Promise<void> {
        console.log('[MarketEngine] Initializing market state tracking...');
        // In a real scenario, we'd start WS adapters here
    }

    public updatePrice(symbol: string, price: number): void {
        this.marketState.set(symbol, {
            symbol,
            price,
            timestamp: Date.now()
        });
    }

    public getPrice(symbol: string): number | undefined {
        return this.marketState.get(symbol)?.price;
    }

    public async shutdown(): Promise<void> {
        console.log('[MarketEngine] Shutting down market engine...');
    }
}
