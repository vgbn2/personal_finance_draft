/**
 * Exercise 2: State Synchronization
 * 
 * Objective: Ensure multiple data sources (e.g., Binance, Deribit) don't overwrite each other's state for the same symbol.
 * 
 * Instructions:
 * 1. Modify the MarketState to store price per exchange.
 * 2. Update the 'get()' method to aggregate or pick the best price (e.g., from Binance).
 */

// TODO: Update MarketState interface in backend/server/src/engines/MarketState.ts
// to support exchange-specific data.
