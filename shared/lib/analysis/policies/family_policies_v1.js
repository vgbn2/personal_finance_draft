'use strict';

function policy(id, family, subtypes, weights, required, exclusions) {
  return Object.freeze({ id, version: '3m-v1-shadow', family, subtypes: Object.freeze(subtypes), horizon: '3m', research_only: true, decision_ready: false, weights: Object.freeze(weights), required_domains: Object.freeze(required), exclusion_domains: Object.freeze(exclusions) });
}

const FX_3M_V1 = policy('fx', 'fx_pair', ['fx_pair'], { technical: 0.25, macro: 0.40, market_structure: 0.15, positioning: 0.10, data_quality: 0.10 }, ['technical', 'macro', 'data_quality'], ['macro']);
const INDEX_3M_V1 = policy('index', 'index', ['index'], { technical: 0.25, macro: 0.20, market_structure: 0.10, breadth: 0.30, data_quality: 0.15 }, ['technical', 'breadth', 'data_quality'], ['breadth']);
const ENERGY_3M_V1 = policy('energy', 'commodity', ['energy'], { technical: 0.20, macro: 0.15, supply_demand: 0.40, positioning: 0.15, data_quality: 0.10 }, ['technical', 'supply_demand', 'data_quality'], ['supply_demand']);
const NATIVE_CHAIN_3M_V1 = policy('native_chain', 'cryptoasset', ['native_chain'], { technical: 0.20, macro: 0.10, onchain: 0.40, market_structure: 0.15, supply_demand: 0.05, data_quality: 0.10 }, ['technical', 'onchain', 'data_quality'], ['onchain']);
const DEFI_PROTOCOL_3M_V1 = policy('defi_protocol', 'cryptoasset', ['protocol_token'], { technical: 0.15, fundamental: 0.15, macro: 0.10, onchain: 0.30, market_structure: 0.15, supply_demand: 0.05, data_quality: 0.10 }, ['technical', 'onchain', 'data_quality'], ['onchain']);

module.exports = { FX_3M_V1, INDEX_3M_V1, ENERGY_3M_V1, NATIVE_CHAIN_3M_V1, DEFI_PROTOCOL_3M_V1 };
