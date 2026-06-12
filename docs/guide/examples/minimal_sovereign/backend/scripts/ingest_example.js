const fs = require("fs");
const path = require("path");
const { loadConfig } = require("../../shared/lib/runtime/config_loader");
const { fetchCandles } = require("../../shared/lib/providers/example_provider");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const config = loadConfig();
  const symbol = config.symbols[0];
  const timeframe = config.timeframe;
  const candles = fetchCandles({ symbol, timeframe });
  const outDir = path.resolve(__dirname, "../../storage/data/cache/example_provider");
  const outPath = path.join(outDir, `${symbol}_${timeframe}.json`);

  ensureDir(outDir);
  fs.writeFileSync(outPath, JSON.stringify(candles, null, 2));

  console.log(JSON.stringify({
    ok: true,
    symbol,
    timeframe,
    rows_written: candles.length,
    output_path: outPath
  }, null, 2));
}

main();
