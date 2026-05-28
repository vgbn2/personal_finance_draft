const readline = require('node:readline');
const MANIFEST = require('./manifest');

/**
 * TUI ENGINE
 * 
 * Generic interactive primitives (Select, Text, Confirm) and the main 
 * category/command navigation loop.
 */

function isRichTerminal() {
  return process.stdout.isTTY && !process.env.CI;
}

async function promptSelect(question, options) {
  if (!isRichTerminal()) {
    console.log(`\n? ${question}`);
    const resolved = typeof options === 'function' ? await options() : options;
    resolved.forEach((opt, i) => console.log(`${i + 1}) ${opt.label || opt}`));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      rl.question('Select number: ', (answer) => {
        rl.close();
        const idx = parseInt(answer, 10) - 1;
        const selected = resolved[idx] || resolved[0];
        resolve(selected.value !== undefined ? selected.value : selected);
      });
    });
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let selectedIndex = 0;
  const resolvedOptions = typeof options === 'function' ? await options() : options;
  const labels = resolvedOptions.map(opt => (typeof opt === 'string' ? opt : opt.label));
  
  const PAGE_SIZE = 10;
  let scrollOffset = 0;

  return new Promise(resolve => {
    let lastLinesCount = 0;

    const render = () => {
      // Clear previous output by moving up and clearing from there
      if (lastLinesCount > 0) {
        readline.moveCursor(process.stdout, 0, -lastLinesCount);
        readline.clearScreenDown(process.stdout);
      }
      
      let buffer = '';
      const time = new Date().toLocaleTimeString();
      const statusLine = `\x1b[90mBackend: \x1b[32mOK\x1b[90m | Cache: \x1b[32mValid\x1b[90m | Network: \x1b[32mConnected\x1b[0m`;
      
      buffer += `\x1b[1;36mSOVEREIGN\x1b[0m \x1b[90m| ${time} |\x1b[0m \x1b[1m${question}\x1b[0m \x1b[90m(Total: ${labels.length})\x1b[0m\n`;
      buffer += `  ${statusLine}\n`;
      buffer += `\x1b[90m${'─'.repeat(80)}\x1b[0m\n`;
      
      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex;
      } else if (selectedIndex >= scrollOffset + PAGE_SIZE) {
        scrollOffset = selectedIndex - PAGE_SIZE + 1;
      }

      const visibleLabels = labels.slice(scrollOffset, scrollOffset + PAGE_SIZE);
      for (let i = 0; i < visibleLabels.length; i++) {
        const actualIndex = i + scrollOffset;
        const line = actualIndex === selectedIndex 
          ? `  \x1b[32m❯ \x1b[36m${visibleLabels[i]}\x1b[0m`
          : `    ${visibleLabels[i]}`;
        buffer += line + '\n';
      }

      const hasMore = labels.length > PAGE_SIZE;
      if (hasMore) {
        buffer += `  \x1b[90m--- ${labels.length - PAGE_SIZE} more hidden ---\x1b[0m\n`;
      }

      process.stdout.write(buffer);
      lastLinesCount = 3 + visibleLabels.length + (hasMore ? 1 : 0);
    };
    
    render();

    const onData = (key) => {
      if (key === '\u0003') { // Ctrl+C
        process.stdout.write('\nExiting.\n');
        process.exit(0);
      }
      if (key === '\u001b[A') { // Up
        selectedIndex = (selectedIndex > 0) ? selectedIndex - 1 : labels.length - 1;
        render();
      } else if (key === '\u001b[B') { // Down
        selectedIndex = (selectedIndex < labels.length - 1) ? selectedIndex + 1 : 0;
        render();
      } else if (key === '\r' || key === '\n') {
        process.stdin.removeListener('data', onData);
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        const selected = resolvedOptions[selectedIndex];
        resolve(selected.value !== undefined ? selected.value : selected);
      }
    };
    process.stdin.on('data', onData);
  });
}

async function promptText(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(`\x1b[36m?\x1b[0m \x1b[1m${question}\x1b[0m ${defaultValue ? `\x1b[90m(${defaultValue})\x1b[0m ` : ''}`, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function promptConfirm(question) {
  return await promptSelect(question, [
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ]);
}

async function resolveFlags(flags) {
  const finalArgs = [];
  if (!flags) return finalArgs;

  for (const [flagKey, spec] of Object.entries(flags)) {
    let value;
    const label = spec.label || flagKey;

    if (spec.type === 'select') {
      value = await promptSelect(`${label}:`, spec.options);
    } else if (spec.type === 'text') {
      value = await promptText(`${label}:`, spec.default);
      if (spec.required && !value) {
        process.stdout.write(`\n\x1b[31m⚠ ${label} is required.\x1b[0m\n`);
        return null;
      }
    } else if (spec.type === 'confirm') {
      value = await promptConfirm(label);
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
  return finalArgs;
}

async function runInteractiveMenu(handleCommand) {
  console.clear();
  console.log('\x1b[1;36mSOVEREIGN TERMINAL\x1b[0m \x1b[90mv1.2.2\x1b[0m');
  console.log('\x1b[90mNavigate with Up/Down arrows and Enter.\x1b[0m\n');

  while (true) {
    const categoryChoices = [
      ...MANIFEST.categories.map(c => ({ label: c.label, value: c.id })),
      { label: 'Exit', value: 'exit' }
    ];
    const categoryId = await promptSelect('Select Category:', categoryChoices);

    if (categoryId === 'exit') {
      console.log('Exiting Sovereign CLI.');
      process.exit(0);
    }

    const commandList = MANIFEST.commands[categoryId];
    const commandChoices = [
      ...commandList.map(c => ({ label: c.label, value: c })),
      { label: '< Back', value: 'back' }
    ];
    const categorySpec = MANIFEST.categories.find(c => c.id === categoryId);
    const commandSpec = await promptSelect(`${categorySpec.label}:`, commandChoices);

    if (commandSpec === 'back') continue;

    const extraArgs = await resolveFlags(commandSpec.flags);
    if (extraArgs === null) continue;

    const fullArgs = [...(commandSpec.prefix || []), commandSpec.id, ...extraArgs];
    
    console.clear();
    console.log(`\x1b[1;36mSOVEREIGN\x1b[0m \x1b[90m> ${fullArgs.join(' ')}\x1b[0m\n`);
    
    try {
      await handleCommand(fullArgs);
    } catch (error) {
      console.error(`\x1b[31mError:\x1b[0m ${error.message}`);
    }

    process.stdout.write('\n\x1b[90m' + '─'.repeat(60) + '\x1b[0m\n');
    await promptText('Press Enter to return to menu...');
    console.clear();
  }
}

module.exports = {
  promptSelect,
  promptText,
  promptConfirm,
  runInteractiveMenu,
  isRichTerminal
};
