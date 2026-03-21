const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Server-side salt to prevent rainbow table attacks on usernames
const METADATA_SALT = process.env.METADATA_SALT || 'securelink-default-salt-2026';

const db = new sqlite3.Database(path.join(__dirname, '../securelink.db'));

/**
 * Creates a "Blind ID" for a username so the server/DB never sees the real name at rest.
 */
function hashUsername(username) {
    return crypto.createHmac('sha256', METADATA_SALT).update(username).digest('hex');
}

function initialize() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Store public keys indexed by hashed username
            db.run("CREATE TABLE IF NOT EXISTS users (usernameHash TEXT PRIMARY KEY, publicKey TEXT)", (err) => {
                if (err) reject(err);
            });
            // Mailbox uses hashed names for sender and recipient
            db.run("CREATE TABLE IF NOT EXISTS mailbox (id INTEGER PRIMARY KEY AUTOINCREMENT, recipientHash TEXT, senderHash TEXT, ciphertext TEXT, iv TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

function saveUser(username, publicKey) {
    const hash = hashUsername(username);
    return new Promise((resolve, reject) => {
        db.run("INSERT OR REPLACE INTO users (usernameHash, publicKey) VALUES (?, ?)", 
            [hash, JSON.stringify(publicKey)], (err) => {
                if (err) reject(err);
                else resolve();
            });
    });
}

function getKnownUsers() {
    return new Promise((resolve, reject) => {
        // NOTE: In a high-privacy mode, we wouldn't even provide a global user list.
        // But for this UI, we return the public keys. The names are NOT in the DB.
        db.all("SELECT publicKey FROM users", [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function saveToMailbox(recipient, sender, ciphertext, iv) {
    const rHash = hashUsername(recipient);
    const sHash = hashUsername(sender);
    db.run("INSERT INTO mailbox (recipientHash, senderHash, ciphertext, iv) VALUES (?, ?, ?, ?)",
        [rHash, sHash, JSON.stringify(ciphertext), JSON.stringify(iv)]);
}

function fetchMailbox(recipient) {
    const rHash = hashUsername(recipient);
    return new Promise((resolve, reject) => {
        db.all("SELECT id, senderHash, ciphertext, iv FROM mailbox WHERE recipientHash = ?", [rHash], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function clearMailbox(recipient) {
    const rHash = hashUsername(recipient);
    db.run("DELETE FROM mailbox WHERE recipientHash = ?", [rHash]);
}

module.exports = {
    initialize,
    saveUser,
    getKnownUsers,
    saveToMailbox,
    fetchMailbox,
    clearMailbox,
    hashUsername
};
