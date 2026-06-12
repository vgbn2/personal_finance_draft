const fs = require("fs");
const path = require("path");

function loadConfig() {
  const configPath = path.resolve(__dirname, "../../../config/system/app_config.json");
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    mode: process.env.SOVEREIGN_MODE || parsed.mode || "paper",
    symbols: parsed.symbols || ["BTCUSDT"],
    timeframe: parsed.timeframe || "1d",
    provider: parsed.provider || "example_provider"
  };
}

module.exports = {
  loadConfig
};
