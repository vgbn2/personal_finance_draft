function fetchCandles({ symbol, timeframe }) {
  return [
    {
      symbol,
      timeframe,
      timestamp: 1710000000,
      open: 100,
      high: 105,
      low: 99,
      close: 104,
      volume: 1200,
      source: "example_provider"
    },
    {
      symbol,
      timeframe,
      timestamp: 1710086400,
      open: 104,
      high: 109,
      low: 103,
      close: 107,
      volume: 1400,
      source: "example_provider"
    },
    {
      symbol,
      timeframe,
      timestamp: 1710172800,
      open: 107,
      high: 112,
      low: 106,
      close: 111,
      volume: 1600,
      source: "example_provider"
    }
  ];
}

module.exports = {
  fetchCandles
};
