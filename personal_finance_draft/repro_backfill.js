const { driveTui } = require('./tests/scripts/tui_autopilot');

const ARROW_DOWN = '\u001b[B';
const ENTER = '\r';

async function reproduce() {
    console.log('[REPRO] Testing: Operational Dashboard & Health -> Backfill');
    // Operational Dashboard & Health is index 0
    // Backfill is index 5
    const keys = [
        ENTER, // Select Operational Dashboard & Health
        ARROW_DOWN, ARROW_DOWN, ARROW_DOWN, ARROW_DOWN, ARROW_DOWN, ENTER, // Select Backfill
        '1d', ENTER, // Timeframe
        '30', ENTER, // Days
        'AAPL', ENTER, // Symbol
        ENTER, // Include Prediction (Confirm No)
        ENTER  // 20 years (Confirm No)
    ];
    
    const result = await driveTui(keys, 15000);
    console.log('--- ERROR ---');
    console.log(result.error);
    console.log('--- OUTPUT ---');
    console.log(result.output.split('\n').slice(-20).join('\n'));
}

reproduce().catch(console.error);
