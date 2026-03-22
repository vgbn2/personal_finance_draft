/**
 * Exercise 3: Simple Trend Scorer
 * 
 * Objective: Create a scorer that evaluates trend strength.
 * 
 * Instructions:
 * 1. Read the current price change from MarketState.
 * 2. If change > 5%, score is +5.
 * 3. If change < -5%, score is -5.
 * 4. Return the calculated score.
 */

import { marketState } from '../../backend/server/src/engines/MarketState.js';

export class TrendScorer {
    public compute(symbol: string): number {
        const state = marketState.get(symbol);
        if (!state) return 0;

        let score = 0;
        // TODO: Implement scoring logic
        return score;
    }
}
