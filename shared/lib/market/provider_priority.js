'use strict';

// One canonical precedence contract for canonical bins and immutable segments.
// Higher values win timestamp conflicts; equal priority accepts the newer write.
module.exports = Object.freeze({
  binance: 3,
  alpaca: 3,
  yahoo: 1,
  twelvedata: 1,
  frankfurter: 1,
  ecb: 1,
});
