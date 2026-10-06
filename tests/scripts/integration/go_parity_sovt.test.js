'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const { writeTsIndex, readTsIndex } = require(path.join(REPO_ROOT, 'shared', 'lib', 'market', 'ts_index_storage.js'));

test('Go SOVT parser matches Node.js binary ts index bit-for-bit on real recorded BTC bars', () => {
  const fixturePath = path.join(REPO_ROOT, 'tests', 'fixtures', 'real_bars_btc.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const realBars = fixture.sources.slice(0, 50); // Use 50 real Binance bars

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovt-real-parity-'));
  try {
    const symbol = 'BTCUSDT';
    const timeframe = '1h';

    // 1. Write via Node.js ts_index_storage using real snapshot
    writeTsIndex(tmpDir, { sources: realBars });

    const binFile = path.join(tmpDir, `${symbol}_${timeframe}.bin`);
    assert.ok(fs.existsSync(binFile), 'bin file was written to disk');

    // 2. Read back with Node.js parser
    const nodeDecoded = readTsIndex(tmpDir, symbol, timeframe);
    assert.equal(nodeDecoded.length, realBars.length);

    // 3. Inspect with Go binary test probe
    const goScript = `
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"github.com/sovereign/backend-go/pkg/sovt"
)

func main() {
	if len(os.Args) < 2 {
		os.Exit(1)
	}
	recs, err := sovt.ReadFile(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\\n", err)
		os.Exit(1)
	}
	data, _ := json.Marshal(recs)
	fmt.Println(string(data))
}
`;
    const tmpGoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-probe-'));
    const tmpGoFile = path.join(tmpGoDir, 'main.go');
    fs.writeFileSync(tmpGoFile, goScript, 'utf8');

    const goRun = spawnSync('go', ['run', tmpGoFile, binFile], {
      cwd: path.join(REPO_ROOT, 'backend', 'go'),
      encoding: 'utf8',
    });

    assert.equal(goRun.status, 0, `go run failed: ${goRun.stderr}`);
    const parsedFromGo = JSON.parse(goRun.stdout.trim());

    assert.equal(parsedFromGo.length, realBars.length);
    for (let i = 0; i < realBars.length; i += 1) {
      assert.equal(parsedFromGo[i].TimestampMs, Date.parse(realBars[i].timestamp));
      assert.equal(parsedFromGo[i].Open, realBars[i].open);
      assert.equal(parsedFromGo[i].High, realBars[i].high);
      assert.equal(parsedFromGo[i].Low, realBars[i].low);
      assert.equal(parsedFromGo[i].Close, realBars[i].close);
      assert.equal(parsedFromGo[i].Volume, realBars[i].volume);

      // Bit-for-bit parity check against Node.js readTsIndex
      assert.equal(parsedFromGo[i].Open, nodeDecoded[i].open);
      assert.equal(parsedFromGo[i].High, nodeDecoded[i].high);
      assert.equal(parsedFromGo[i].Low, nodeDecoded[i].low);
      assert.equal(parsedFromGo[i].Close, nodeDecoded[i].close);
      assert.equal(parsedFromGo[i].Volume, nodeDecoded[i].volume);
    }

    // Clean up temporary go probe
    fs.rmSync(tmpGoDir, { recursive: true, force: true });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
