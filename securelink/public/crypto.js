// Web Crypto API Wrapper for E2EE Chat

const cryptoSubsystem = window.crypto.subtle;

/**
 * Generates an ECDH key pair for the user.
 */
async function generateECDHKeyPair() {
    return await cryptoSubsystem.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey"]
    );
}

/**
 * Exports a public key to JWK format so it can be sent over WebSocket.
 */
async function exportPublicKey(key) {
    return await cryptoSubsystem.exportKey("jwk", key);
}

/**
 * Imports a peer's public key from JWK format.
 */
async function importPublicKey(jwk) {
    return await cryptoSubsystem.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        []
    );
}

/**
 * Derives a shared AES-GCM key from my private key and peer's public key.
 */
async function deriveSharedSecret(myPrivateKey, peerPublicKey) {
    return await cryptoSubsystem.deriveKey(
        {
            name: "ECDH",
            public: peerPublicKey
        },
        myPrivateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts a plaintext string using the shared AES-GCM key.
 */
async function encryptMessage(text, sharedKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(text);

    const ciphertext = await cryptoSubsystem.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        sharedKey,
        encodedText
    );

    return {
        ciphertext: Array.from(new Uint8Array(ciphertext)),
        iv: Array.from(iv)
    };
}

/**
 * Decrypts a ciphertext using the shared AES-GCM key.
 */
async function decryptMessage(encryptedData, sharedKey) {
    try {
        const ciphertext = new Uint8Array(encryptedData.ciphertext);
        const iv = new Uint8Array(encryptedData.iv);

        const decryptedBuffer = await cryptoSubsystem.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            sharedKey,
            ciphertext
        );

        return new TextDecoder().decode(decryptedBuffer);
    } catch (e) {
        console.error("Decryption failed:", e);
        return "[Decryption Failed]";
    }
}

/**
 * Generates a human-readable fingerprint from a public key (JWK).
 * Used for manual verification to prevent MITM.
 */
async function getFingerprint(jwk) {
    const keyString = JSON.stringify(jwk);
    const encoded = new TextEncoder().encode(keyString);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    
    // Take first 12 bytes and format as 4 chunks of 3 digits
    // This makes it easy for humans to compare (e.g. 123-456-789-012)
    let fingerprint = "";
    for (let i = 0; i < 4; i++) {
        const chunk = hashArray.slice(i * 3, i * 3 + 3);
        const num = (chunk[0] << 16) | (chunk[1] << 8) | chunk[2];
        fingerprint += (num % 1000).toString().padStart(3, '0');
        if (i < 3) fingerprint += "-";
    }
    return fingerprint;
}

window.SecureCrypto = {
    generateECDHKeyPair,
    exportPublicKey,
    importPublicKey,
    deriveSharedSecret,
    encryptMessage,
    decryptMessage,
    getFingerprint
};
