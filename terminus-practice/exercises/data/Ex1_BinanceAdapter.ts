/**
 * Exercise 1: Implement the Binance Adapter
 * 
 * Objective: Connect to Binance Futures WebSocket and update the MarketState.
 * 
 * Instructions:
 * 1. Install ws: 'npm install ws' in backend/server.
 * 2. Study the Binance documentation for the '@ticker' stream.
 * 3. Extract 'c' (price) and 'P' (price change %) from the message.
 * 4. Call 'marketState.update('BTCUSDT', { price: ..., change24h: ... })'.
 */

import WebSocket from 'ws';
import { marketState } from '../../backend/server/src/engines/MarketState.js';

export class BinanceAdapter {
    private ws: WebSocket | null = null;
    private readonly WS_URL = 'wss://fstream.binance.com/ws/btcusdt@ticker';

    public connect() {
        this.ws = new WebSocket(this.WS_URL);

        this.ws.on('open', () => {
            console.log('[Ex1] Connected to Binance WS');
        });

        this.ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            // TODO: Implement the update logic here
            // console.log(msg); 
        });
    }
}
