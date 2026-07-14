'use strict';

const { FAMILIES, SUBTYPES, DOMAINS } = require('./constants');

// Applicability is intentionally descriptive. Scores and weights belong to policies.
const FAMILY_SECTION_REGISTRY = Object.freeze({
  equity: {
    common_stock: ['technical', 'fundamental', 'macro', 'catalyst', 'data_quality'],
  },
  cryptoasset: {
    native_chain: ['technical', 'fundamental', 'macro', 'onchain', 'market_structure', 'supply_demand', 'sentiment', 'catalyst', 'data_quality'],
    protocol_token: ['technical', 'fundamental', 'macro', 'onchain', 'market_structure', 'supply_demand', 'sentiment', 'catalyst', 'data_quality'],
    exchange_or_meme_token: ['technical', 'macro', 'market_structure', 'supply_demand', 'sentiment', 'catalyst', 'data_quality'],
  },
  fx_pair: {
    fx_pair: ['technical', 'macro', 'market_structure', 'positioning', 'sentiment', 'catalyst', 'data_quality'],
  },
  commodity: {
    energy: ['technical', 'macro', 'market_structure', 'supply_demand', 'positioning', 'sentiment', 'catalyst', 'data_quality'],
    metals: ['technical', 'macro', 'market_structure', 'supply_demand', 'positioning', 'sentiment', 'catalyst', 'data_quality'],
    agriculture: ['technical', 'macro', 'market_structure', 'supply_demand', 'positioning', 'sentiment', 'catalyst', 'data_quality'],
  },
  index: {
    index: ['technical', 'macro', 'market_structure', 'breadth', 'sentiment', 'catalyst', 'data_quality'],
  },
});

function getFamilySections(family, subtype) {
  const sections = FAMILY_SECTION_REGISTRY[family] && FAMILY_SECTION_REGISTRY[family][subtype];
  return sections ? sections.slice() : null;
}

function isKnownFamily(family) { return FAMILIES.includes(family); }
function isKnownSubtype(subtype) { return SUBTYPES.includes(subtype); }
function isKnownDomain(domain) { return DOMAINS.includes(domain); }

module.exports = {
  FAMILY_SECTION_REGISTRY,
  getFamilySections,
  isKnownFamily,
  isKnownSubtype,
  isKnownDomain,
};
