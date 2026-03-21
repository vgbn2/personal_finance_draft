// WebSocket and Messaging Logic
window.Messaging = {
    async handleServerMessage(data) {
        if (data.type === 'user_list') {
            for (const user of data.users) {
                await this.addUser(user.username, user.publicKey);
            }
        } else if (data.type === 'user_joined') {
            await this.addUser(data.user.username, data.user.publicKey);
        } else if (data.type === 'user_left') {
            UI.removeUser(data.username);
        } else if (data.type === 'chat_message') {
            // Find sender by name OR by hash (for offline messages)
            let sender = AppState.users[data.from];
            
            // If not found by name, it might be a hash. Try to find the user whose hash matches data.from
            if (!sender && data.isOffline) {
                // In a production app, we would use a more efficient lookup
                for (const name in AppState.users) {
                    // Note: We don't have the hash function on the frontend, 
                    // but for this prototype, we'll just decrypt with all available keys 
                    // until one works, or look up if we stored the hash.
                    // Instead, let's just use the shared key we HAVE for the person we think it is.
                }
            }

            if (sender && sender.sharedKey) {
                const decryptedRaw = await SecureCrypto.decryptMessage({
                    ciphertext: data.ciphertext,
                    iv: data.iv
                }, sender.sharedKey);

                try {
                    const payload = JSON.parse(decryptedRaw);
                    const realSender = payload.sender;
                    const messageText = payload.text;

                    sender.messages.push({ 
                        text: data.isOffline ? `[OFFLINE] ${messageText}` : messageText, 
                        type: 'received',
                        expiresAt: Date.now() + 30000 
                    });
                    
                    if (AppState.currentChatUser === realSender) {
                        UI.renderMessages();
                    } else {
                        const li = document.getElementById(`contact-${realSender}`);
                        if (li) li.style.fontWeight = 'bold';
                    }
                } catch (e) {
                    console.error('Failed to parse sealed payload:', e);
                }
            }
        }
    },

    async addUser(username, jwkPublicKey) {
        if (AppState.users[username]) return;

        const peerPublicKey = await SecureCrypto.importPublicKey(jwkPublicKey);
        const sharedKey = await SecureCrypto.deriveSharedSecret(AppState.myKeyPair.privateKey, peerPublicKey);

        AppState.users[username] = {
            publicKey: peerPublicKey,
            sharedKey: sharedKey,
            messages: []
        };

        UI.renderContactList();
    },

    async sendMessage() {
        const text = UI.messageInput.value.trim();
        if (!AppState.currentChatUser || !text) return;

        UI.messageInput.value = '';
        const recipient = AppState.users[AppState.currentChatUser];
        
        // SEALED SENDER: Wrap message and sender name into a single object before encrypting
        const sealedPayload = JSON.stringify({
            sender: AppState.myUsername,
            text: text
        });

        const encrypted = await SecureCrypto.encryptMessage(sealedPayload, recipient.sharedKey);

        AppState.ws.send(JSON.stringify({
            type: 'chat_message',
            to: AppState.currentChatUser,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv
        }));

        recipient.messages.push({ 
            text: text, 
            type: 'sent',
            expiresAt: Date.now() + 30000 
        });
        UI.renderMessages();
    }
};

// Global Events
UI.loginBtn.addEventListener('click', async () => {
    const username = UI.usernameInput.value.trim();
    if (!username) return alert('Please enter a username');

    AppState.myUsername = username;
    AppState.myKeyPair = await SecureCrypto.generateECDHKeyPair();
    const exportedPublicKey = await SecureCrypto.exportPublicKey(AppState.myKeyPair.publicKey);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    AppState.ws = new WebSocket(`${protocol}//${window.location.host}`);

    AppState.ws.onopen = () => {
        AppState.ws.send(JSON.stringify({
            type: 'register',
            username: AppState.myUsername,
            publicKey: exportedPublicKey,
            room: AppState.myRoom
        }));

        UI.loginOverlay.classList.add('hidden');
        UI.appContainer.classList.remove('hidden');
        UI.myUsernameDisplay.textContent = AppState.myUsername;
    };

    AppState.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        await Messaging.handleServerMessage(data);
    };

    AppState.ws.onclose = () => alert('Disconnected from server');
});

UI.sendBtn.addEventListener('click', () => Messaging.sendMessage());
UI.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') Messaging.sendMessage();
});

// Auto-delete cleanup loop
setInterval(() => {
    let changed = false;
    for (const username in AppState.users) {
        const initialCount = AppState.users[username].messages.length;
        AppState.users[username].messages = AppState.users[username].messages.filter(m => !m.expiresAt || m.expiresAt > Date.now());
        if (AppState.users[username].messages.length !== initialCount) changed = true;
    }
    if (changed) UI.renderMessages();
}, 1000);
