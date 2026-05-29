const path = require('node:path');
const fs = require('node:fs');
const { writeJson } = require('./market_validation');
const { REPO_ROOT } = require('./paths');

/**
 * PERSISTENT EXECUTION MEMORY
 * [gemini-work] Prevents duplicate signal execution across process restarts.
 * Essential for unattended cloud hosting.
 */

const MEMORY_PATH = path.join(REPO_ROOT, 'storage', 'data', 'cache', 'execution_memory.json');

class PersistentExecutionMemory {
    constructor() {
        this.memory = new Set();
        this.initialized = false;
    }

    /**
     * Lazy initialization to ensure paths and REPO_ROOT are ready.
     */
    init() {
        if (this.initialized) return;
        try {
            if (fs.existsSync(MEMORY_PATH)) {
                const data = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
                if (Array.isArray(data)) {
                    this.memory = new Set(data);
                }
            }
            this.initialized = true;
        } catch (error) {
            console.warn(`[MEMORY] Failed to load execution memory: ${error.message}`);
            this.initialized = true; // Mark as initialized even if it fails to prevent loops
        }
    }

    /**
     * Checks if a signal has already been processed.
     * @param {string} signalId 
     * @returns {boolean}
     */
    has(signalId) {
        this.init();
        return this.memory.has(signalId);
    }

    /**
     * Adds a signal to memory and persists to disk.
     * @param {string} signalId 
     */
    add(signalId) {
        this.init();
        this.memory.add(signalId);
        this.save();
    }

    /**
     * Persists the current memory set to the filesystem.
     */
    save() {
        try {
            writeJson(MEMORY_PATH, Array.from(this.memory));
        } catch (error) {
            console.error(`[MEMORY] Failed to save execution memory: ${error.message}`);
        }
    }

    /**
     * Clears all execution memory.
     */
    clear() {
        this.memory.clear();
        this.save();
    }

    /**
     * Returns the number of signals in memory.
     */
    size() {
        this.init();
        return this.memory.size;
    }
}

module.exports = new PersistentExecutionMemory();
