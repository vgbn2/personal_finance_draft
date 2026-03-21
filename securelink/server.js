const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const db = require('./lib/db');
const wsHandler = require('./lib/ws-handler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

async function bootstrap() {
    // Initialize Database
    try {
        await db.initialize();
        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Database initialization failed:', err);
        process.exit(1);
    }

    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/health', (req, res) => {
        res.send('SecureLink Server is ALIVE');
    });

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // Delegate WebSocket handling
    wss.on('connection', wsHandler.handleConnection);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`SecureLink (Decentralized) running on port ${PORT}`);
    });
}

bootstrap();
