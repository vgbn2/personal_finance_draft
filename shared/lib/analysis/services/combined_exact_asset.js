'use strict';

const { adaptTechnicalV2Row } = require('../analyzers/technical_v2_adapter');
const { buildPointInTimeMacroFactor } = require('../analyzers/macro_point_in_time');
const { POLICY: EQUITY_3M_V1 } = require('../policies/equity_3m_v1');
const {
  FX_3M_V1,
  INDEX_3M_V1,
  ENERGY_3M_V1,
  NATIVE_CHAIN_3M_V1,
  DEFI_PROTOCOL_3M_V1,
} = require('../policies/family_policies_v1');
const { composeFamilyShadow } = require('../policies/family_shadow');

const ENGINE_VERSION = 'combined-exact-asset-v1';
const EQUITY_COMBINED_POLICY = Object.freeze({
  ...EQUITY_3M_V1,
  subtypes: Object.freeze(['common_stock']),
  exclusion_domains: Object.freeze(['fundamental']),
});

function policyForAsset(asset) {
  if (asset.family === 'equity' && asset.subtype === 'common_stock') return EQUITY_COMBINED_POLICY;
  if (asset.family === 'fx_pair') return FX_3M_V1;
  if (asset.family === 'index') return INDEX_3M_V1;
  if (asset.family === 'commodity' && asset.subtype === 'energy') return ENERGY_3M_V1;
  if (asset.family === 'cryptoasset' && asset.subtype === 'native_chain') return NATIVE_CHAIN_3M_V1;
  if (asset.family === 'cryptoasset' && asset.subtype === 'protocol_token') return DEFI_PROTOCOL_3M_V1;
  return null;
}

function technicalComponent(asset, technical, decisionAt) {
  const factor = technical.factor_result;
  const ageMs = Math.max(0, Date.parse(decisionAt) - Date.parse(factor.data_as_of));
  return {
    asset_id: asset.asset_id,
    domain: 'technical',
    source: 'schema_2_technical_scorecard',
    observed_at: factor.data_as_of,
    available_at: factor.data_as_of,
    valid_until: factor.valid_until,
    freshness: {
      age_ms: ageMs,
      max_age_ms: Date.parse(factor.valid_until) - Date.parse(factor.data_as_of),
      fresh: true,
    },
    quality: factor.quality,
    coverage: factor.coverage,
    value: factor.score,
    exclusion_reasons: [],
    provenance: {
      schema_version: technical.source.schema_version,
      symbol: technical.source.symbol,
      evidence_ids: factor.evidence_ids,
    },
  };
}

function dataQualityFactor(assetId, components, decisionAt) {
  const dataAsOf = components.map((item) => item.observed_at).sort().at(-1);
  const validUntil = components.map((item) => item.valid_until).sort().at(0);
  return {
    factor: {
      domain: 'data_quality',
      score: 0,
      strength: 1,
      coverage: 1,
      quality: 'verified',
      data_as_of: dataAsOf,
      valid_until: validUntil,
      evidence_ids: components.flatMap((item) => (
        Array.isArray(item.provenance?.evidence_ids)
          ? item.provenance.evidence_ids
          : (Array.isArray(item.provenance)
            ? item.provenance.map((entry) => `macro:${entry.revision_id}`)
            : [])
      )),
      drivers: ['exact asset identity verified', 'component timing verified at decision timestamp'],
    },
    component: {
      asset_id: assetId,
      domain: 'data_quality',
      source: 'combined_engine_validation',
      observed_at: dataAsOf,
      available_at: decisionAt,
      valid_until: validUntil,
      freshness: { age_ms: 0, max_age_ms: 0, fresh: true },
      quality: 'verified',
      coverage: 1,
      value: 0,
      exclusion_reasons: [],
      provenance: { component_domains: components.map((item) => item.domain).sort() },
    },
  };
}

function rejectedEnvelope({ assetId, decisionAt, policyVersion, reasons, components = [] }) {
  return {
    ok: false,
    type: 'combined_research',
    schema_version: 3,
    engine_version: ENGINE_VERSION,
    policy_version: policyVersion,
    asset_id: assetId || null,
    decision_at: decisionAt,
    eligible: false,
    decision_ready: false,
    research_only: true,
    degraded: true,
    reasons,
    components: components.slice().sort((a, b) => a.domain.localeCompare(b.domain)),
  };
}

function composeCombinedExactAsset({
  asset,
  technicalRow,
  macroRecords,
  macroMapping,
  decisionAt,
  policyVersion = 'exact-asset-v1',
}) {
  if (!asset || !asset.asset_id || !String(asset.asset_id).includes(':')) {
    return rejectedEnvelope({
      assetId: asset?.asset_id,
      decisionAt,
      policyVersion,
      reasons: ['canonical exact asset_id is required'],
    });
  }
  const policy = policyForAsset(asset);
  if (!policy) {
    return rejectedEnvelope({
      assetId: asset.asset_id,
      decisionAt,
      policyVersion,
      reasons: ['no combined policy supports this exact asset subtype'],
    });
  }

  const components = [];
  const factors = [];
  const reasons = [];
  const technical = adaptTechnicalV2Row(technicalRow, { now: Date.parse(decisionAt) });
  if (!technical.ok) {
    reasons.push(technical.error.code);
  } else if (technical.source.symbol !== asset.provider_ids?.legacy_symbol) {
    reasons.push('technical_asset_mismatch');
  } else {
    factors.push(technical.factor_result);
    components.push(technicalComponent(asset, technical, decisionAt));
  }

  const macro = buildPointInTimeMacroFactor({
    assetId: asset.asset_id,
    records: macroRecords,
    decisionAt,
    mapping: macroMapping,
  });
  if (!macro.ok) {
    reasons.push(macro.error.code);
  } else if (macro.component.asset_id !== asset.asset_id) {
    reasons.push('macro_asset_mismatch');
  } else {
    factors.push(macro.factor_result);
    components.push(macro.component);
  }

  if (reasons.length > 0) {
    return rejectedEnvelope({
      assetId: asset.asset_id,
      decisionAt,
      policyVersion,
      reasons: [...new Set(reasons)].sort(),
      components,
    });
  }

  const quality = dataQualityFactor(asset.asset_id, components, decisionAt);
  factors.push(quality.factor);
  components.push(quality.component);
  const composed = composeFamilyShadow({
    assetDescriptor: asset,
    factors: factors.slice().sort((a, b) => a.domain.localeCompare(b.domain)),
    policy,
    now: decisionAt,
  });
  if (!composed.ok) {
    return rejectedEnvelope({
      assetId: asset.asset_id,
      decisionAt,
      policyVersion,
      reasons: [composed.error.code],
      components,
    });
  }

  const row = composed.scorecard_row;
  return {
    ok: true,
    type: 'combined_research',
    schema_version: 3,
    engine_version: ENGINE_VERSION,
    policy_version: policyVersion,
    asset_id: asset.asset_id,
    decision_at: decisionAt,
    eligible: row.decision_state === 'eligible',
    decision_ready: false,
    research_only: true,
    degraded: row.decision_state !== 'eligible',
    reasons: row.exclusion_reasons,
    components: components.slice().sort((a, b) => a.domain.localeCompare(b.domain)),
    scorecard_row: row,
  };
}

module.exports = {
  ENGINE_VERSION,
  composeCombinedExactAsset,
  policyForAsset,
  rejectedEnvelope,
};
