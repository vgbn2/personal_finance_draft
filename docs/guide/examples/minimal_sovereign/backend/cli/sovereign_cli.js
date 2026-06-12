#!/usr/bin/env node

const { loadConfig } = require("../../shared/lib/runtime/config_loader");

function renderHumanStatus(config) {
  console.log("Status: ok");
  console.log(`Mode: ${config.mode}`);
  console.log(`Provider: ${config.provider}`);
  console.log(`Timeframe: ${config.timeframe}`);
}

function renderJsonStatus(config) {
  console.log(JSON.stringify({
    ok: true,
    command: "status",
    mode: config.mode,
    provider: config.provider,
    timeframe: config.timeframe
  }, null, 2));
}

function main(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const wantsJson = args.includes("--json");
  const config = loadConfig();

  if (command === "status") {
    if (wantsJson) {
      renderJsonStatus(config);
    } else {
      renderHumanStatus(config);
    }
    return;
  }

  console.error(`Unknown command: ${command || "<none>"}`);
  process.exitCode = 1;
}

main(process.argv);
