export interface IEngine {
    id: string;
    name: string;
    description: string;
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
}

export class EngineRegistry {
    private static instance: EngineRegistry;
    private engines: Map<string, IEngine> = new Map();

    private constructor() {}

    public static getInstance(): EngineRegistry {
        if (!EngineRegistry.instance) {
            EngineRegistry.instance = new EngineRegistry();
        }
        return EngineRegistry.instance;
    }

    public register(engine: IEngine): void {
        console.log(`[EngineRegistry] Registering engine: ${engine.name} (${engine.id})`);
        this.engines.set(engine.id, engine);
    }

    public getEngine<T extends IEngine>(id: string): T | undefined {
        return this.engines.get(id) as T;
    }

    public getAllEngines(): IEngine[] {
        return Array.from(this.engines.values());
    }

    public async initializeAll(): Promise<void> {
        console.log('[EngineRegistry] Initializing all registered engines...');
        for (const engine of this.engines.values()) {
            try {
                await engine.initialize();
                console.log(`[EngineRegistry] Engine initialized: ${engine.name}`);
            } catch (error) {
                console.error(`[EngineRegistry] Failed to initialize engine ${engine.name}:`, error);
            }
        }
    }

    public async shutdownAll(): Promise<void> {
        console.log('[EngineRegistry] Shutting down all engines...');
        for (const engine of this.engines.values()) {
            await engine.shutdown();
        }
    }
}
