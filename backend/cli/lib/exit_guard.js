const EXIT_WINDOW_MS = 1500;

let lastCtrlCAt = 0;
let installed = false;

function resetCtrlC() {
  lastCtrlCAt = 0;
}

function registerCtrlCPress() {
  const now = Date.now();
  const withinWindow = now - lastCtrlCAt <= EXIT_WINDOW_MS;
  lastCtrlCAt = withinWindow ? 0 : now;
  return withinWindow;
}

function installDoubleCtrlCExit(onFirstPress) {
  if (installed) return;
  installed = true;
  process.on('SIGINT', () => {
    if (registerCtrlCPress()) {
      process.stdout.write('\n');
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
};
