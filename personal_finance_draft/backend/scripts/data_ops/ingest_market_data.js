'use strict';

// `ingest_market_data` was decomposed into the ./ingest_market_data/ folder.
// This thin re-export keeps every existing `require('.../ingest_market_data')`
// and `require('.../ingest_market_data.js')` call site resolving unchanged.
// Direct script invocation (`node ingest_market_data/index.js`) runs the CLI guard
// inside index.js; see data_sync.sh which targets index.js directly.
module.exports = require('./ingest_market_data/index.js');
