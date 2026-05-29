const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('../../backend/cli/lib/utils');
const { readStrategyRegistry, inspectStrategyFile } = require('../../backend/cli/commands/strategy');

function runAutomatedStrategies() {
    console.log('[AUTOMATION] Scanning for enabled strategies...');
    const files = readStrategyRegistry();
    const enabledStrategies = files.map(inspectStrategyFile).filter(s => s.enabled);

    if (enabledStrategies.length === 0) {
        console.log('[AUTOMATION] No strategies enabled.');
        return;
    }

    console.log(`[AUTOMATION] Found ${enabledStrategies.length} enabled strategies:`);
    enabledStrategies.forEach(s => console.log(` - ${s.name} (${s.kind})`));

    // Placeholder: In a real scenario, this would trigger the backtest or live execution engine
    // for each strategy.
    for (const strategy of enabledStrategies) {
        console.log(`[AUTOMATION] Executing ${strategy.name}...`);
        // Example placeholder call:
        // spawnSync('node', ['backend/cli/sovereign_cli.js', 'strategy', 'execute', strategy.path]);
    }
    
    console.log('[AUTOMATION] Completed execution pass.');
}

if (require.main === module) {
    runAutomatedStrategies();
}
