const test = require("node:test");
const assert = require("node:assert");
const { loadConfig } = require("../shared/lib/runtime/config_loader");

test("config loader returns paper mode by default", () => {
  const config = loadConfig();
  assert.equal(config.mode, "paper");
  assert.equal(config.provider, "example_provider");
});
