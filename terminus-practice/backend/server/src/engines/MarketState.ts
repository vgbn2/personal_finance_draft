export interface SymbolState {
    price: number;
    change24h: number;
    volume24h: number;
    updatedAt: number;
}

export class MarketState {
    private static instance: MarketState;
    private states: Map<string, SymbolState> = new Map();

    private constructor() {}

    public static getInstance(): MarketState {
        if (!MarketState.instance) {
            MarketState.instance = new MarketState();
        }
        return MarketState.instance;
    }

    public update(symbol: string, patch: Partial<SymbolState>): void {
        const key = symbol.toUpperCase();
        const current = this.states.get(key) || {
            price: 0,
            change24h: 0,
            volume24h: 0,
            updatedAt: Date.now()
        };
        this.states.set(key, { ...current, ...patch, updatedAt: Date.now() });
    }

    public get(symbol: string): SymbolState | undefined {
        return this.states.get(symbol.toUpperCase());
    }

    public getAll(): Record<string, SymbolState> {
        return Object.fromEntries(this.states);
    }
}

export const marketState = MarketState.getInstance();
