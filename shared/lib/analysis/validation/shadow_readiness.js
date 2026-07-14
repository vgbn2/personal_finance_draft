'use strict';

function summarize(values) {
  if (!values.length) return { count: 0, min: null, max: null, mean: null };
  return { count: values.length, min: Math.min(...values), max: Math.max(...values), mean: values.reduce((sum, value) => sum + value, 0) / values.length };
}

function evaluateShadowReadiness(catalog) {
  if (!catalog || catalog.schema_version !== 3 || !Array.isArray(catalog.rows)) throw new TypeError('schema-v3 shadow catalog is required');
  const domains = {};
  let syntheticEvidenceCount = 0;
  let totalEvidenceCount = 0;
  for (const row of catalog.rows) {
    for (const factor of row.factor_results) {
      (domains[factor.domain] ||= []).push(factor.score);
      for (const id of factor.evidence_ids) {
        totalEvidenceCount++;
        if (id.startsWith('synthetic-parity:')) syntheticEvidenceCount++;
      }
    }
  }
  const factorDistributions = Object.fromEntries(Object.entries(domains).map(([domain, values]) => [domain, summarize(values)]));
  const blockerSet = new Set();
  if (catalog.counts.eligible === 0) blockerSet.add('zero_eligible_rows');
  if (catalog.counts.excluded > 0) blockerSet.add('excluded_rows_present');
  if (syntheticEvidenceCount > 0) blockerSet.add('synthetic_parity_evidence_present');
  blockerSet.add('no_point_in_time_target_returns');
  blockerSet.add('no_out_of_sample_baseline_comparison');
  blockerSet.add('no_turnover_or_cost_model');
  blockerSet.add('no_calibration_sample');
  return {
    ok: true, type: 'shadow_readiness_report', schema_version: 1,
    research_only: true, promotion_approved: false,
    sample: { rows: catalog.rows.length, eligible: catalog.counts.eligible, degraded: catalog.counts.degraded, excluded: catalog.counts.excluded },
    coverage: summarize(catalog.rows.map((row) => row.coverage)),
    factor_distributions: factorDistributions,
    evidence: { total: totalEvidenceCount, synthetic_parity: syntheticEvidenceCount, recorded_or_provider: totalEvidenceCount - syntheticEvidenceCount },
    missing_data_sensitivity: { rows_with_reasons: catalog.rows.filter((row) => row.exclusion_reasons.length > 0).length, excluded_when_critical_missing: catalog.rows.filter((row) => row.decision_state === 'excluded').length, silent_weight_renormalization: false },
    validation: { baseline_comparison: 'unavailable', out_of_sample: 'unavailable', turnover: 'unavailable', calibration: 'unavailable' },
    blockers: [...blockerSet],
  };
}

module.exports = { evaluateShadowReadiness };
