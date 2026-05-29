const { driveTui } = require('./tests/scripts/tui_autopilot');

const ARROW_DOWN = '\u001b[B';
const ENTER = '\r';

async function reproduce() {
    const testCases = [
        {
            name: 'Research & Backtesting -> Features / Indicators',
            keys: [
                ARROW_DOWN, ARROW_DOWN, ENTER, // Research
                ENTER, // Features / Indicators
                '1', ENTER // Select first timeframe (usually '1d' or similar)
            ]
        },
        {
            name: 'Execution & Trading (Alpaca) -> Check Alpaca Balance',
            keys: [
                ARROW_DOWN, ARROW_DOWN, ARROW_DOWN, ARROW_DOWN, ENTER, // Trade
                ENTER // Balance
            ]
        }
    ];

    for (const tc of testCases) {
        console.log(`\n--- Reproducing: ${tc.name} ---`);
        const result = await driveTui(tc.keys, 15000);
        console.log('OUTPUT:');
        console.log(result.output);
        if (result.error) {
            console.log('ERROR:');
            console.log(result.error);
        }
    }
}

reproduce().catch(console.error);
