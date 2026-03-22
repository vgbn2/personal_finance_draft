import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { pino } from 'pino';
import * as dotenv from 'dotenv';

import { EngineRegistry } from './core/EngineRegistry.js';
import { MarketEngine } from './engines/MarketEngine.js';
import { IntelligenceEngine } from './engines/IntelligenceEngine.js';

dotenv.config();

const logger = pino({
    transport: {
        target: 'pino-pretty'
    }
});

const registry = EngineRegistry.getInstance();
const marketEngine = new MarketEngine();
const intelligenceEngine = new IntelligenceEngine();

registry.register(marketEngine);
registry.register(intelligenceEngine);

const fastify = Fastify({
    logger
});

await fastify.register(cors, {
    origin: true
});

await fastify.register(websocket);

fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { 
        status: 'ok', 
        engine: 'Terminus-Practice',
        activeEngines: registry.getAllEngines().map(e => e.name)
    };
});

const start = async () => {
    try {
        await registry.initializeAll();
        const port = Number(process.env.PORT) || 3001;
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Terminus Practice Server started on port ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
