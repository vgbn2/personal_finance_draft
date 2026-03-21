// UI Components and Rendering
window.UI = {
    // DOM Elements
    loginOverlay: document.getElementById('login-overlay'),
    loginBtn: document.getElementById('login-btn'),
    usernameInput: document.getElementById('username-input'),
    appContainer: document.getElementById('app-container'),
    myUsernameDisplay: document.getElementById('my-username'),
    contactList: document.getElementById('contact-list'),
    currentChatUserDisplay: document.getElementById('current-chat-user'),
    verificationInfo: document.getElementById('verification-info'),
    fingerprintDisplay: document.getElementById('fingerprint-display'),
    messagesContainer: document.getElementById('messages-container'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    encryptionStatus: document.getElementById('encryption-status'),

    init() {
        // Update UI with Room Name
        const roomDisplay = document.createElement('div');
        roomDisplay.id = 'room-display';
        roomDisplay.style.fontSize = '10px';
        roomDisplay.style.color = '#128C7E';
        roomDisplay.style.fontWeight = 'bold';
        roomDisplay.textContent = `Room: ${AppState.myRoom}`;
        setTimeout(() => document.querySelector('.sidebar .header').appendChild(roomDisplay), 100);
    },

    renderContactList() {
        this.contactList.innerHTML = '';
        for (const username of Object.keys(AppState.users)) {
            const li = document.createElement('li');
            li.id = `contact-${username}`;
            li.textContent = username;
            if (username === AppState.currentChatUser) li.classList.add('active');
            
            li.addEventListener('click', async () => {
                AppState.currentChatUser = username;
                li.style.fontWeight = 'normal';
                this.currentChatUserDisplay.textContent = `Chatting with ${username}`;
                
                const jwk = await SecureCrypto.exportPublicKey(AppState.users[username].publicKey);
                const fingerprint = await SecureCrypto.getFingerprint(jwk);
                this.fingerprintDisplay.textContent = `Safety Code: ${fingerprint}`;
                
                this.verificationInfo.classList.remove('hidden');
                this.messageInput.disabled = false;
                this.sendBtn.disabled = false;
                this.renderContactList();
                this.renderMessages();
            });

            this.contactList.appendChild(li);
        }
    },

    renderMessages() {
        this.messagesContainer.innerHTML = '';
        if (!AppState.currentChatUser || !AppState.users[AppState.currentChatUser]) return;

        for (const msg of AppState.users[AppState.currentChatUser].messages) {
            const div = document.createElement('div');
            div.className = `message ${msg.type}`;
            
            // SECURITY: Use textContent to prevent XSS (renders HTML as plain text)
            const textSpan = document.createElement('span');
            textSpan.textContent = msg.text;
            div.appendChild(textSpan);
            
            if (msg.expiresAt) {
                const timeLeft = Math.max(0, Math.round((msg.expiresAt - Date.now()) / 1000));
                const timerSpan = document.createElement('span');
                timerSpan.style.fontSize = '8px';
                timerSpan.style.opacity = '0.5';
                timerSpan.style.display = 'block';
                timerSpan.textContent = `Expires in ${timeLeft}s`;
                div.appendChild(timerSpan);
            }

            this.messagesContainer.appendChild(div);
        }
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    },

    removeUser(username) {
        delete AppState.users[username];
        if (AppState.currentChatUser === username) {
            AppState.currentChatUser = null;
            this.currentChatUserDisplay.textContent = 'Select a contact to start chatting';
            this.messagesContainer.innerHTML = '';
            this.messageInput.disabled = true;
            this.sendBtn.disabled = true;
            this.verificationInfo.classList.add('hidden');
        }
        this.renderContactList();
    }
};

UI.init();
