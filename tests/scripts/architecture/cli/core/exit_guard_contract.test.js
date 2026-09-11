const assert = require('node:assert/strict');
const test = require('node:test');

const { registerCtrlCPress, resetCtrlC } = require('../../../../../backend/cli/lib/exit_guard');

test('double ctrl+c requires two presses within the exit window', async () => {
  resetCtrlC();

  assert.equal(registerCtrlCPress(), false);
  assert.equal(registerCtrlCPress(), true);

  resetCtrlC();
  assert.equal(registerCtrlCPress(1000), false);
  assert.equal(registerCtrlCPress(1000 + 1600), false);
});
