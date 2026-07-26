'use strict';

// Canonical provider-symbol mappings shared by ingestion and the configured
// market-universe resolver. Keep this module pure so read-only consumers do not
// need to import provider fetchers or CLI code.
const YAHOO_INDEX_SYMBOLS = Object.freeze({
  SPX: '^GSPC',
  NDX: '^NDX',
  DJI: '^DJI',
  VIX: '^VIX',
  RUT: '^RUT',
  DAX: '^GDAXI',
  FTSE: '^FTSE',
  N225: '^N225',
  IXIC: '^IXIC',
  FCHI: '^FCHI',
  HSI: '^HSI',
  AORD: '^AORD',
  IBEX: '^IBEX',
  MIB: 'FTSEMIB.MI',
});

const YAHOO_COMMODITY_SYMBOLS = Object.freeze({
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',
  XCUUSD: 'HG=F',
  USOIL: 'CL=F',
  UKOIL: 'BZ=F',
  NG: 'NG=F',
  WHEAT: 'ZW=F',
  CORN: 'ZC=F',
  SOYBN: 'ZS=F',
});

const YAHOO_FX_SYMBOLS = Object.freeze({
  EURUSD: 'EURUSD=X',
  EURJPY: 'EURJPY=X',
  EURGBP: 'EURGBP=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'USDCAD=X',
  USDCHF: 'USDCHF=X',
  NZDUSD: 'NZDUSD=X',
  USDSEK: 'USDSEK=X',
});

const YAHOO_COMMODITY_REVERSE = Object.freeze(
  Object.fromEntries(Object.entries(YAHOO_COMMODITY_SYMBOLS).map(([symbol, providerSymbol]) => (
    [providerSymbol, symbol]
  ))),
);

module.exports = {
  YAHOO_INDEX_SYMBOLS,
  YAHOO_COMMODITY_SYMBOLS,
  YAHOO_COMMODITY_REVERSE,
  YAHOO_FX_SYMBOLS,
};
