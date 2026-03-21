// Frontend State Management
window.AppState = {
    myUsername: '',
    myRoom: 'Global',
    myKeyPair: null,
    ws: null,
    users: {}, // username -> { publicKey, sharedKey, messages: [] }
    currentChatUser: null,

    // Extract Room from URL
    initRoom() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('room')) {
            this.myRoom = urlParams.get('room');
        }
    }
};

AppState.initRoom();
