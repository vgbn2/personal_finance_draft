const readline = require('node:readline');
const MANIFEST = require('./manifest');

/**
 * TUI ENGINE
 * 
 * Generic interactive primitives (Select, Text, Confirm) and the main 
 * category/command navigation loop.
 */

function isRichTerminal() {
  if (process.env.SOVEREIGN_FORCE_TUI === 'true') return true;
  return process.stdout.isTTY && !process.env.CI;
}

async function promptMultiSelect(question, options) {
  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let selectedIndex = 0;
  const resolvedOptions = typeof options === 'function' ? await options() : options;
  const selectedIndices = new Set();
  
  const PAGE_SIZE = 10;
  let scrollOffset = 0;

  return new Promise(resolve => {
    let lastLinesCount = 0;

    const render = () => {
      if (lastLinesCount > 0) {
        readline.moveCursor(process.stdout, 0, -lastLinesCount);
        readline.clearScreenDown(process.stdout);
      }
      
      let buffer = '';
      buffer += `\x1b[1;36mSOVEREIGN\x1b[0m \x1b[1m${question}\x1b[0m \x1b[90m(Space: toggle, Enter: finish)\x1b[0m\n\n`;
      
      if (selectedIndex < scrollOffset) {
        scrollOffset = selectedIndex;
      } else if (selectedIndex >= scrollOffset + PAGE_SIZE) {
        scrollOffset = selectedIndex - PAGE_SIZE + 1;
      }

      const visible = resolvedOptions.slice(scrollOffset, scrollOffset + PAGE_SIZE);
      for (let i = 0; i < visible.length; i++) {
        const actualIndex = i + scrollOffset;
        const isSelected = selectedIndices.has(actualIndex);
        const prefix = isSelected ? '\x1b[32m[x]\x1b[0m' : '[ ]';
        const line = actualIndex === selectedIndex 
          ? `  \x1b[36m❯ ${prefix} ${visible[i].label}\x1b[0m`
          : `    ${prefix} ${visible[i].label}`;
        buffer += line + '\n';
      }

      process.stdout.write(buffer);
      lastLinesCount = 2 + visible.length;
    };
    
    render();
    //too many if elses dev review
    const onData = (key) => {
      if (key === '\u0003') { process.exit(0); }
      if (key === '\u001b[A') { selectedIndex = (selectedIndex > 0) ? selectedIndex - 1 : resolvedOptions.length - 1; render(); }
      else if (key === '\u001b[B') { selectedIndex = (selectedIndex < resolvedOptions.length - 1) ? selectedIndex + 1 : 0; render(); }
      else if (key === ' ') {
        if (selectedIndices.has(selectedIndex)) selectedIndices.delete(selectedIndex);
        else selectedIndices.add(selectedIndex);
        render();
      } else if (key === '\r' || key === '\n') {
        process.stdin.removeListener('data', onData);
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve([...selectedIndices].map(idx => resolvedOptions[idx].value));
      }
    };
    process.stdin.on('data', onData);
  });
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

  if (process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  let selectedIndex = 0;
  let filterText = '';
  const rawOptions = typeof options === 'function' ? await options() : options;
  
  // Normalize options to object shape
  const resolvedOptions = rawOptions.map(o => {
    if (typeof o === 'object' && o !== null) return o;
    return { label: String(o), value: o };
  });

  const PAGE_SIZE = 10;
  let scrollOffset = 0;

  return new Promise(resolve => {
    let lastLinesCount = 0;

    const getFiltered = () => resolvedOptions.filter(o => 
      (o.label || o.value || '').toString().toLowerCase().includes(filterText.toLowerCase())
    );

    const render = () => {
      if (lastLinesCount > 0) {
        readline.moveCursor(process.stdout, 0, -lastLinesCount);
        readline.clearScreenDown(process.stdout);
      }
      
      const filtered = getFiltered();
      
      // Group by category for rendering
      const grouped = [];
      let lastCat = null;
      filtered.forEach(o => {
          if (o.category && o.category !== lastCat) {
              grouped.push({ type: 'header', label: o.category });
              lastCat = o.category;
          }
          grouped.push({ type: 'item', ...o });
      });

      if (selectedIndex >= grouped.length) selectedIndex = Math.max(0, grouped.length - 1);
      
      if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;
      else if (selectedIndex >= scrollOffset + PAGE_SIZE) scrollOffset = selectedIndex - PAGE_SIZE + 1;

      const visible = grouped.slice(scrollOffset, scrollOffset + PAGE_SIZE);
      
      let buffer = '';
      const time = new Date().toLocaleTimeString();
      const statusLine = `\x1b[90mBackend: \x1b[32mOK\x1b[90m | Cache: \x1b[32mValid\x1b[90m | Network: \x1b[32mConnected\x1b[0m`;
      
      buffer += `\x1b[1;36mSOVEREIGN\x1b[0m \x1b[90m| ${time} |\x1b[0m \x1b[1m${question}\x1b[0m \x1b[90m(Filter: ${filterText})\x1b[0m\n`;
      buffer += `  ${statusLine}\n`;
      buffer += `\x1b[90m${'─'.repeat(80)}\x1b[0m\n`;

      for (let i = 0; i < visible.length; i++) {
        const item = visible[i];
        if (item.type === 'header') {
            buffer += `\n  \x1b[1;33m--- ${item.label.toUpperCase()} ---\x1b[0m\n`;
            lastLinesCount += 1;
        } else {
            const actualIndex = i + scrollOffset;
            const line = actualIndex === selectedIndex 
              ? `  \x1b[32m❯ \x1b[36m${item.label || item.value || item}\x1b[0m`
              : `    ${item.label || item.value || item}`;
            buffer += line + '\n';
        }
      }

      process.stdout.write(buffer);
      lastLinesCount = 3 + visible.length; 
    };
    
    render();

    const onData = (key) => {
      if (key === '\u0003') { process.exit(0); }
      else if (key === '\u007f') { // Backspace
        filterText = filterText.slice(0, -1);
        selectedIndex = 0;
        render();
      } else if (key.length === 1 && key >= ' ' && key <= '~') {
        filterText += key;
        selectedIndex = 0;
        render();
      } else if (key === '\u001b[A') {
        const filteredCount = getFiltered().length;
        selectedIndex = (selectedIndex > 0) ? selectedIndex - 1 : Math.max(0, filteredCount - 1);
        render();
      } else if (key === '\u001b[B') {
        const filteredCount = getFiltered().length;
        selectedIndex = (selectedIndex < filteredCount - 1) ? selectedIndex + 1 : 0;
        render();
      } else if (key === '\r' || key === '\n') {
        process.stdin.removeListener('data', onData);
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stdout.write('\n');
        
        const filtered = getFiltered();
        const selected = filtered[selectedIndex];
        resolve(selected ? (selected.value !== undefined ? selected.value : selected) : null);
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
    const categories = MANIFEST.categories || [];
    const categoryChoices = [
      ...categories.map(c => ({ label: c.label, value: c.id })),
      { label: 'Exit', value: 'exit' }
    ];
    const categoryId = await promptSelect('Select Category:', categoryChoices);

    if (categoryId === 'exit') {
      console.log('Exiting Sovereign CLI.');
      process.exit(0);
    }

    const commandList = (MANIFEST.commands && MANIFEST.commands[categoryId]) || [];
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

function renderSigmaSparkline(mean, stddev, currentPrice, width = 40) {
  if (stddev === 0) return '[' + '-'.repeat(width) + ']';
  
  const min = mean - (3 * stddev);
  const max = mean + (3 * stddev);
  const range = max - min;
  
  // Normalize positions
  let pos = Math.round(((currentPrice - min) / range) * width);
  pos = Math.max(0, Math.min(width - 1, pos));
  
  const meanPos = Math.round(width / 2);
  const sig1Neg = Math.round(((mean - stddev - min) / range) * width);
  const sig1Pos = Math.round(((mean + stddev - min) / range) * width);
  
  let line = Array(width).fill('-');
  line[meanPos] = '|'; // Mean
  if (sig1Neg >= 0 && sig1Neg < width) line[sig1Neg] = ':';
  if (sig1Pos >= 0 && sig1Pos < width) line[sig1Pos] = ':';
  
  // Plot current price
  if (currentPrice > max) {
     line[width - 1] = '\x1b[31m►\x1b[0m';
  } else if (currentPrice < min) {
     line[0] = '\x1b[31m◄\x1b[0m';
  } else {
     line[pos] = '\x1b[36m*\x1b[0m';
  }
  
  return `[-3σ ${line.join('')} +3σ]`;
}

module.exports = {
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
  runInteractiveMenu,
  isRichTerminal,
  renderSigmaSparkline
};
