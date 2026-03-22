import { create } from 'zustand';

interface MarketData {
    symbol: string;
    price: number;
    change24h: number;
    updatedAt: number;
}

interface MarketDataStore {
    marketData: Record<string, MarketData>;
    updateMarketData: (symbol: string, data: Partial<MarketData>) => void;
}

export const useMarketDataStore = create<MarketDataStore>((set) => ({
    marketData: {},
    updateMarketData: (symbol, data) => 
        set((state) => ({
            marketData: {
                ...state.marketData,
                [symbol]: {
                    ...(state.marketData[symbol] || {
                        symbol,
                        price: 0,
                        change24h: 0,
                        updatedAt: Date.now()
                    }),
                    ...data,
                    updatedAt: Date.now()
                }
            }
        })),
}));
