const WebSocket = require('ws');
const db = require('./db');

// Store connected users: { ws: WebSocket, username: string, publicKey: object, room: string }
const clients = new Set();

function handleConnection(ws) {
    let currentUser = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'register') {
                currentUser = {
                    ws,
                    username: data.username,
                    publicKey: data.publicKey,
                    room: data.room || 'Global'
                };
                clients.add(currentUser);
                
                await db.saveUser(data.username, data.publicKey);

                const usersInRoom = Array.from(clients)
                    .filter(c => c.room === currentUser.room && c.username !== currentUser.username)
                    .map(c => ({ username: c.username, publicKey: c.publicKey }));
                
                ws.send(JSON.stringify({ type: 'user_list', users: usersInRoom }));

                const offlineMsgs = await db.fetchMailbox(data.username);
                if (offlineMsgs.length > 0) {
                    offlineMsgs.forEach(msg => {
                        ws.send(JSON.stringify({
                            type: 'chat_message',
                            from: msg.senderHash, // Returns the HASH, not the name
                            ciphertext: JSON.parse(msg.ciphertext),
                            iv: JSON.parse(msg.iv),
                            isOffline: true
                        }));
                    });
                    db.clearMailbox(data.username);
                }

                broadcast({
                    type: 'user_joined',
                    user: { username: currentUser.username, publicKey: currentUser.publicKey }
                }, currentUser);
            } 
            else if (data.type === 'chat_message') {
                const recipient = Array.from(clients).find(c => c.username === data.to);
                
                if (recipient) {
                    recipient.ws.send(JSON.stringify({
                        type: 'chat_message',
                        from: currentUser.username,
                        ciphertext: data.ciphertext,
                        iv: data.iv
                    }));
                } else {
                    db.saveToMailbox(data.to, currentUser.username, data.ciphertext, data.iv);
                }
            }
        } catch (err) {
            console.error('WS Error:', err);
        }
    });

    ws.on('close', () => {
        if (currentUser) {
            clients.delete(currentUser);
            broadcast({ type: 'user_left', username: currentUser.username }, currentUser);
        }
    });
}

function broadcast(data, originUser) {
    const message = JSON.stringify(data);
    for (const client of clients) {
        if (client !== originUser && client.room === originUser.room && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    }
}

module.exports = {
    handleConnection
};
