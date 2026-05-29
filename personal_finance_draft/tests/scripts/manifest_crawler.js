const { MANIFEST } = require('../../backend/cli/tui');
const { driveTui } = require('./tui_autopilot');

const ARROW_DOWN = '\u001b[B';
const ENTER = '\r';

/**
 * MANIFEST CRAWLER
 * 
 * Automatically generates test cases for EVERY command and EVERY flag
 * defined in the TUI manifest.
 */

async function crawl() {
    console.log('[CRAWLER] Generating test matrix from manifest...');
    
    const results = [];
    
    for (let i = 0; i < MANIFEST.categories.length; i++) {
        const cat = MANIFEST.categories[i];
        const commands = MANIFEST.commands[cat.id] || [];
        
        for (let j = 0; j < commands.length; j++) {
            const cmd = commands[j];
            const name = `${cat.label} -> ${cmd.label}`;
            
            // Build key sequence to reach this command
            const keys = [];
            
            // 1. Select Category
            for (let k = 0; k < i; k++) keys.push(ARROW_DOWN);
            keys.push(ENTER);
            
            // 2. Select Command
            for (let k = 0; k < j; k++) keys.push(ARROW_DOWN);
            keys.push(ENTER);
            
            // 3. Handle Flags (Fill with defaults or dummy text)
            if (cmd.flags) {
                for (const [flag, spec] of Object.entries(cmd.flags)) {
                    if (spec.type === 'text') {
                        keys.push('test_val', ENTER);
                    } else if (spec.type === 'select') {
                        // Test filtering! Type first char of first option
                        const options = typeof spec.options === 'function' ? spec.options() : spec.options;
                        const firstOpt = (options[0].label || options[0]).toString();
                        keys.push(firstOpt.charAt(0).toLowerCase(), ENTER);
                    } else if (spec.type === 'confirm') {
                        keys.push(ENTER); // Default No
                    }
                }
            }
            
            console.log(`[CRAWLER] Queuing: ${name}`);
            const result = await driveTui(keys, 10000);
            
            const status = (!result.output.includes('TypeError') && !result.output.includes('ReferenceError') && !result.error) ? 'PASS' : 'FAIL';
            results.push({ name, status, error: result.error || (status === 'FAIL' ? 'Crash detected in output' : '') });
            
            console.log(`[${status === 'PASS' ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}] ${name}`);
        }
    }
    
    console.log('\n[CRAWLER] Final Report:');
    results.forEach(r => {
        console.log(`${r.status.padEnd(5)} | ${r.name}`);
    });
}

if (require.main === module) {
    crawl().catch(console.error);
}
