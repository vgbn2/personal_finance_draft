const test = require('node:test');
const assert = require('node:assert/strict');
const { handleIntersection } = require('../../../../backend/cli/tui/intersection');

/**
 * TEST: TUI/CLI INTERSECTION (HEADLESS BYPASS)
 */
test('handleIntersection bypasses TUI prompts in headless mode (--json)', async () => {
  let commandExecuted = false;
  const mockHandleCommand = (args) => {
    commandExecuted = true;
    assert.ok(args.includes('--json'));
    assert.ok(args.includes('watch'));
  };

  const args = ['watch', '--json'];
  await handleIntersection(args, mockHandleCommand);
  
  assert.strictEqual(commandExecuted, true, 'Command should execute immediately');
});
