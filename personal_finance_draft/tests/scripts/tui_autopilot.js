const { spawn } = require('node:child_process');
const path = require('node:path');

/**
 * SOVEREIGN TUI AUTOPILOT
 * 
 * This utility allows an AI agent to "drive" the TUI by sending 
 * sequences of keystrokes and text.
 */

async function driveTui(keystrokes, timeout = 5000) {
    return new Promise((resolve) => {
        const cliPath = path.join(__dirname, '../../backend/cli/sovereign_cli.js');
        const child = spawn('node', [cliPath], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, CI: 'false', SOVEREIGN_FORCE_TUI: 'true' } // Force TUI mode
        });

        let output = '';
        let error = '';

        child.stdout.on('data', (data) => {
            const str = data.toString();
            output += str;
        });

        child.stderr.on('data', (data) => {
            const str = data.toString();
            if (!str.includes('Warning:')) {
                error += str;
            }
        });

        // Feed the keystrokes with delays to allow the TUI to react
        let currentStep = 0;
        const interval = setInterval(() => {
            if (currentStep >= keystrokes.length) {
                clearInterval(interval);
                // Give it a moment to finish the last command
                setTimeout(() => {
                    child.kill();
                    resolve({ output, error, success: error === '' });
                }, 1000);
                return;
            }

            const key = keystrokes[currentStep];
            child.stdin.write(key);
            currentStep++;
        }, 500);

        // Safety timeout
        setTimeout(() => {
            clearInterval(interval);
            child.kill();
            resolve({ output, error, success: false, timeout: true });
        }, timeout);
    });
}

// Example usage: Test 'Backend Correlation' path
// 1. Arrow Down (Backend Tools)
// 2. Enter
// 3. Arrow Down x 3 (Correlation)
// 4. Enter
// 5. Typing "AAPL,BTC" + Enter
// 6. Arrow Down (Timeframe)
// 7. Enter
const ARROW_DOWN = '\u001b[B';
const ENTER = '\r';

async function runTest() {
    console.log('[AUTOPILOT] Starting TUI Stress Test...');
    
    const testCases = [
        {
            name: 'Correlation Menu Path',
            keys: [
                ARROW_DOWN, ENTER, // Select Backend Tools
                ARROW_DOWN, ARROW_DOWN, ARROW_DOWN, ENTER, // Select Correlation
                'AAPL,BTC,SPY', ENTER, // Type symbols
                ARROW_DOWN, ENTER, // Select Timeframe (The previous crash point!)
                ENTER // Select first TF
            ]
        }
    ];

    for (const tc of testCases) {
        console.log(`[AUTOPILOT] Testing: ${tc.name}`);
        const result = await driveTui(tc.keys);
        
        if (!result.output.includes('TypeError') && !result.output.includes('ReferenceError') && !result.error) {
            console.log(`[\x1b[32mPASS\x1b[0m] ${tc.name}`);
        } else {
            console.log(`[\x1b[31mFAIL\x1b[0m] ${tc.name}`);
            console.error(result.error || result.output);
        }
    }
}

if (require.main === module) {
    runTest();
}

module.exports = { driveTui };
