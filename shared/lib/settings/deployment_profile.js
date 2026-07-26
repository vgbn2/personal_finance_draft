'use strict';

const PROFILES = Object.freeze({
  'all-in-one': Object.freeze({
    description: 'Rehearsal host with every repository role available but persistent work opt-in.',
    machine_roles: Object.freeze(['developer', 'api', 'writer', 'research', 'monitoring', 'paper', 'client']),
    available_services: Object.freeze([
      'web',
      'backfill',
      'portfolio-monitor',
      'host-health',
      'host-backup',
      'polymarket-research',
      'bot',
      'connector',
    ]),
    default_services: Object.freeze(['web']),
    canonical_writer: true,
    persistent_work_requires_explicit_start: true,
  }),
  'central-host': Object.freeze({
    description: 'Private persistent host with one canonical data writer and no client workstation role.',
    machine_roles: Object.freeze(['api', 'writer', 'research', 'monitoring', 'paper']),
    available_services: Object.freeze([
      'web',
      'backfill',
      'portfolio-monitor',
      'host-health',
      'host-backup',
      'polymarket-research',
      'bot',
    ]),
    default_services: Object.freeze(['web', 'backfill']),
    canonical_writer: true,
    persistent_work_requires_explicit_start: false,
  }),
  developer: Object.freeze({
    description: 'Source, test, build, and local web development without a canonical writer.',
    machine_roles: Object.freeze(['developer', 'api']),
    available_services: Object.freeze(['web']),
    default_services: Object.freeze([]),
    canonical_writer: false,
    persistent_work_requires_explicit_start: true,
  }),
  client: Object.freeze({
    description: 'Read-only remote workstation using an authenticated connector.',
    machine_roles: Object.freeze(['client']),
    available_services: Object.freeze(['connector']),
    default_services: Object.freeze(['connector']),
    canonical_writer: false,
    persistent_work_requires_explicit_start: false,
  }),
});

const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));

function normalizeDeploymentProfile(value, fallback = null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (PROFILE_NAMES.includes(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toLowerCase();
  return PROFILE_NAMES.includes(normalizedFallback) ? normalizedFallback : null;
}

function resolveDeploymentProfile(value = process.env.SOVEREIGN_DEPLOYMENT_PROFILE, {
  fallback = 'developer',
} = {}) {
  const requested = String(value || '').trim().toLowerCase() || null;
  const profile = normalizeDeploymentProfile(requested, fallback);
  const valid = requested === null || requested === profile;
  const definition = profile ? PROFILES[profile] : null;
  return {
    ok: Boolean(valid && definition),
    requested_profile: requested,
    effective_profile: definition ? profile : null,
    reason: valid && definition ? null : 'unsupported_deployment_profile',
    machine_roles: definition ? [...definition.machine_roles] : [],
    available_services: definition ? [...definition.available_services] : [],
    default_services: definition ? [...definition.default_services] : [],
    canonical_writer: Boolean(definition && definition.canonical_writer),
    persistent_work_requires_explicit_start: Boolean(
      definition && definition.persistent_work_requires_explicit_start
    ),
    description: definition ? definition.description : null,
  };
}

function serviceAllowed(profile, service) {
  const resolved = typeof profile === 'string'
    ? resolveDeploymentProfile(profile, { fallback: null })
    : profile;
  return Boolean(
    resolved
    && resolved.ok
    && resolved.available_services.includes(String(service || '').trim())
  );
}

function validateDeploymentProfile(value, {
  requireWriter = false,
} = {}) {
  const resolved = resolveDeploymentProfile(value, { fallback: null });
  const writerOk = !requireWriter || resolved.canonical_writer;
  return {
    ...resolved,
    ok: Boolean(resolved.ok && writerOk),
    reason: !resolved.ok
      ? resolved.reason
      : (writerOk ? null : 'deployment_profile_has_no_canonical_writer'),
  };
}

module.exports = {
  PROFILES,
  PROFILE_NAMES,
  normalizeDeploymentProfile,
  resolveDeploymentProfile,
  serviceAllowed,
  validateDeploymentProfile,
};
