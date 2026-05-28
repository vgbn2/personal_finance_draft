const MANIFEST = require('./manifest');
const { promptSelect, promptText, promptConfirm, isRichTerminal } = require('./engine');

/**
 * INTERSECTION
 * 
 * Logic for handling partial CLI commands and enriching them with TUI
 * prompts to resolve missing arguments.
 */

function findCommandSpec(args) {
  const allCommands = Object.values(MANIFEST.commands).flat();
  
  for (const spec of allCommands) {
    const prefix = spec.prefix || [];
    const fullPath = [...prefix, spec.id];
    
    if (fullPath.every((part, i) => args[i] === part)) {
      return { spec, pathLength: fullPath.length };
    }
  }
  return null;
}

async function handleIntersection(args, handleCommand) {
  const isHeadless = args.includes('--json') || args.includes('--verbose') || !isRichTerminal();
  const match = findCommandSpec(args);
  if (!match || isHeadless) {
    return handleCommand(args);
  }

  const { spec, pathLength } = match;
  const providedArgs = args.slice(pathLength);
  const finalArgs = [...args.slice(0, pathLength)];
  const flagsSpec = spec.flags || {};

  for (const [flagKey, flagSpec] of Object.entries(flagsSpec)) {
    // Check if flag is already provided in the CLI
    let isProvided = false;
    if (flagKey.startsWith('--')) {
      const idx = providedArgs.indexOf(flagKey);
      if (idx !== -1) {
        isProvided = true;
        finalArgs.push(flagKey);
        // If it's a value-based flag, grab the value too
        if (flagSpec.type !== 'confirm' && providedArgs[idx + 1]) {
          finalArgs.push(providedArgs[idx + 1]);
        }
      }
    } else {
      // Positional arguments are uncommon here; preserve a provided value and
      // let the manifest prompt below fill anything still missing.
      if (providedArgs.length > 0) {
        isProvided = true;
        finalArgs.push(providedArgs.shift());
      }
    }

    if (!isProvided) {
      let value;
      if (flagSpec.type === 'select') {
        value = await promptSelect(`Missing ${flagSpec.label}:`, flagSpec.options);
      } else if (flagSpec.type === 'text') {
        value = await promptText(`Missing ${flagSpec.label}:`, flagSpec.default);
      } else if (flagSpec.type === 'confirm') {
        value = await promptConfirm(`Missing ${flagSpec.label}:`);
      }

      if (value !== undefined && value !== false) {
        if (flagKey.startsWith('--')) {
          finalArgs.push(flagKey);
          if (value !== true) finalArgs.push(String(value));
        } else {
          finalArgs.push(String(value));
        }
      }
    }
  }

  // Append any remaining raw args that weren't in the schema
  // (e.g. user passed --json which isn't in most schemas)
  for (const raw of providedArgs) {
    if (!finalArgs.includes(raw)) finalArgs.push(raw);
  }

  return handleCommand(finalArgs);
}

module.exports = {
  findCommandSpec,
  handleIntersection
};
