import { IEngine } from '../core/EngineRegistry.js';
import { marketState } from './MarketState.js';

export class IntelligenceEngine implements IEngine {
    public id = 'intelligence-engine';
    public name = 'Intelligence Engine';
    public description = 'Computes scores and signals based on market state';

    public async initialize(): Promise<void> {
        console.log('[IntelligenceEngine] Initializing intelligence processing...');
    }

    public computeScore(symbol: string): number {
        const state = marketState.get(symbol);
        if (!state) return 0;

        // Basic scoring logic for practice
        let score = 0;
        if (state.change24h > 2) score += 1;
        if (state.change24h > 5) score += 2;
        if (state.change24h < -2) score -= 1;
        
        return score;
    }

    public async shutdown(): Promise<void> {
        console.log('[IntelligenceEngine] Shutting down intelligence engine...');
    }
}
