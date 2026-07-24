'use strict';

const crypto = require('node:crypto');

const POLICY_SCHEMA_VERSION = 1;
const DEFAULT_PROFILE = 'local-private';
const PERMANENT_PAPER_PROFILES = new Set([
  'cloud-compute',
  'private-paper',
  'test',
  'local-test',
]);
const LIVE_ELIGIBLE_PROFILES = new Set(['local-private', 'private-runner']);

function envTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableObject(value[key])]),
  );
}

function policyFingerprint(policy) {
  const fingerprinted = { ...policy };
  delete fingerprinted.evaluated_at;
  delete fingerprinted.policy_fingerprint;
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stableObject(fingerprinted)))
    .digest('hex');
}

function runtimeProfile(env = process.env) {
  const requested = String(
    env.SOVEREIGN_RUNTIME_MODE
      || env.SOVEREIGN_DEPLOYMENT_MODE
      || DEFAULT_PROFILE,
  ).trim().toLowerCase();
  return requested || DEFAULT_PROFILE;
}

function resolveRuntimePolicy(options = {}) {
  const env = options.env || process.env;
  const args = Array.isArray(options.args) ? options.args : [];
  const requestedProfile = String(
    options.requestedProfile || runtimeProfile(env),
  ).trim().toLowerCase() || DEFAULT_PROFILE;
  const permanentPaper = PERMANENT_PAPER_PROFILES.has(requestedProfile);
  const supportedProfile = permanentPaper || LIVE_ELIGIBLE_PROFILES.has(requestedProfile);
  const effectiveProfile = permanentPaper ? 'private-paper' : requestedProfile;
  const explicitLive = options.explicitLive === undefined
    ? args.includes('--live')
    : Boolean(options.explicitLive);
  const envLive = options.envLive === undefined
    ? envTrue(env.LIVE_TRADING)
    : Boolean(options.envLive);
  const requestedLive = options.requestedLive === undefined
    ? explicitLive || envLive
    : Boolean(options.requestedLive);
  const executionAuthorized = options.executionAuthorized === undefined
    ? envTrue(env.SOVEREIGN_EXECUTION_AUTHORIZED)
    : Boolean(options.executionAuthorized);
  const killSwitchActive = Boolean(options.killSwitchActive);
  const nativeRiskRequired = Boolean(options.nativeRiskRequired);
  const nativeRiskAvailable = options.nativeRiskAvailable === undefined
    ? !nativeRiskRequired
    : Boolean(options.nativeRiskAvailable);
  const broker = options.broker ? String(options.broker).toLowerCase() : null;
  const brokerLiveSupported = options.brokerLiveSupported === undefined
    ? true
    : Boolean(options.brokerLiveSupported);
  const featureGates = stableObject(options.featureGates || {});
  const disabledFeatures = Object.entries(featureGates)
    .filter(([, enabled]) => enabled === false)
    .map(([name]) => name)
    .sort();
  const blockingReasons = [];

  if (permanentPaper) blockingReasons.push(`profile_${requestedProfile}_is_permanently_non_executing`);
  if (!supportedProfile) blockingReasons.push(`unsupported_runtime_profile:${requestedProfile}`);
  if (killSwitchActive) blockingReasons.push('kill_switch_active');
  if (nativeRiskRequired && !nativeRiskAvailable) blockingReasons.push('native_risk_unavailable');
  if (!brokerLiveSupported) blockingReasons.push(broker ? `broker_${broker}_live_unsupported` : 'broker_live_unsupported');
  if (disabledFeatures.length > 0) blockingReasons.push(`feature_gates_disabled:${disabledFeatures.join(',')}`);
  if (!requestedLive) blockingReasons.push('live_not_requested');
  if (requestedLive && !explicitLive) blockingReasons.push('explicit_live_flag_required');
  if (requestedLive && !executionAuthorized) blockingReasons.push('execution_authorization_required');

  const policy = {
    schema_version: POLICY_SCHEMA_VERSION,
    requested_profile: requestedProfile,
    effective_profile: effectiveProfile,
    paper: permanentPaper || blockingReasons.length > 0,
    research_only: permanentPaper,
    requested_live: requestedLive,
    explicit_live: explicitLive,
    environment_live: envLive,
    execution_authorized: executionAuthorized,
    kill_switch_active: killSwitchActive,
    native_risk_required: nativeRiskRequired,
    native_risk_available: nativeRiskAvailable,
    broker,
    broker_live_supported: brokerLiveSupported,
    feature_gates: featureGates,
    can_execute: blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
    provenance: {
      profile: options.requestedProfile ? 'argument' : (
        env.SOVEREIGN_RUNTIME_MODE
          ? 'SOVEREIGN_RUNTIME_MODE'
          : (env.SOVEREIGN_DEPLOYMENT_MODE ? 'SOVEREIGN_DEPLOYMENT_MODE' : 'default')
      ),
      live: explicitLive && envLive ? 'cli+environment' : (
        explicitLive ? 'cli' : (envLive ? 'environment' : 'default')
      ),
      authorization: options.executionAuthorized === undefined
        ? 'SOVEREIGN_EXECUTION_AUTHORIZED'
        : 'argument',
    },
    evaluated_at: options.now || new Date().toISOString(),
  };
  policy.policy_fingerprint = policyFingerprint(policy);
  return policy;
}

module.exports = {
  DEFAULT_PROFILE,
  LIVE_ELIGIBLE_PROFILES,
  PERMANENT_PAPER_PROFILES,
  POLICY_SCHEMA_VERSION,
  policyFingerprint,
  resolveRuntimePolicy,
  runtimeProfile,
};
