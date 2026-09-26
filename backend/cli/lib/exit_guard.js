const EXIT_WINDOW_MS = 1500;

let lastCtrlCAt = 0;
let installed = false;

function resetCtrlC() {
  lastCtrlCAt = 0;
}

function registerCtrlCPress(now = Date.now()) {
  const withinWindow = lastCtrlCAt > 0 && now - lastCtrlCAt <= EXIT_WINDOW_MS;
  lastCtrlCAt = withinWindow ? 0 : now;
  return withinWindow;
}

function restoreTerminal() {
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    try { process.stdin.setRawMode(false); } catch {}
  }
  process.stdout.write('\x1b[?2026l\x1b[?25h\x1b[0m\n');
}

function installDoubleCtrlCExit(onFirstPress) {
  if (installed) return;
  if (process.env.SOVEREIGN_NONINTERACTIVE === 'true' || !process.stdin.isTTY) return;
  installed = true;

  process.on('SIGTERM', () => {
    restoreTerminal();
    process.exit(143);
  });

  process.on('exit', () => {
    restoreTerminal();
  });

  process.on('SIGINT', () => {
    if (registerCtrlCPress()) {
      restoreTerminal();
      process.exit(130);
      return;
    }
    if (typeof onFirstPress === 'function') {
      onFirstPress();
    } else {
      process.stdout.write('\nPress Ctrl+C again to exit.\n');
    }
  });
}

module.exports = {
  EXIT_WINDOW_MS,
  installDoubleCtrlCExit,
  registerCtrlCPress,
  resetCtrlC,
  restoreTerminal,
};
