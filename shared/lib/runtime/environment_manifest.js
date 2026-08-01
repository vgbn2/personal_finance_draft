'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./paths');

const MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'system', 'environment_manifest.json');
const CHILD_RUNTIME_PASSTHROUGH = Object.freeze([
  'APPDATA',
  'CI',
  'COLORTERM',
  'COMSPEC',
  'ComSpec',
  'FORCE_COLOR',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LOCALAPPDATA',
  'NODE_OPTIONS',
  'NO_COLOR',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SystemRoot',
  'TEMP',
  'TERM',
  'TMP',
  'TMPDIR',
  'TZ',
  'USERPROFILE',
  'WINDIR',
]);
const EXPECTED_COMPOSE_SERVICES = Object.freeze([
  'backfill',
  'bot',
  'bot-alpaca-paper',
  'host-backup',
  'host-health',
  'polymarket-research',
  'portfolio-monitor',
  'web',
]);
const REQUIRED_SAFE_COMPOSE_OVERRIDES = Object.freeze({
  LIVE_TRADING: 'false',
  SOVEREIGN_DEPLOYMENT_PROFILE: 'central-host',
  SOVEREIGN_EXECUTION_AUTHORIZED: 'false',
  SOVEREIGN_RUNTIME_MODE: 'cloud-compute',
});
const EXECUTION_DENYLIST = Object.freeze([
  'SOVEREIGN_MOCK',
]);

function uniqueStringList(value, label, options = {}) {
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    throw new Error(`invalid ${label}`);
  }
  const result = value.map(String);
  if (result.some((item) => !item || item.trim() !== item) || new Set(result).size !== result.length) {
    throw new Error(`invalid ${label}`);
  }
  return result;
}

function assertKnownList(values, known, label) {
  for (const value of values) {
    if (!known.has(value)) throw new Error(`unknown ${label}: ${value}`);
  }
}

function validateComposeServices(parsed, context) {
  const rawServices = parsed.compose_services;
  if (!rawServices || typeof rawServices !== 'object' || Array.isArray(rawServices)) {
    throw new Error('invalid compose services');
  }
  const serviceNames = Object.keys(rawServices).sort();
  if (JSON.stringify(serviceNames) !== JSON.stringify(EXPECTED_COMPOSE_SERVICES)) {
    throw new Error(`invalid compose service inventory: ${serviceNames.join(',')}`);
  }

  const rows = {};
  const usedSurfaces = new Set();
  for (const serviceName of EXPECTED_COMPOSE_SERVICES) {
    const raw = rawServices[serviceName];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`invalid compose service: ${serviceName}`);
    }
    const surface = String(raw.surface || '');
    const expectedSurface = `compose_${serviceName.replace(/-/g, '_').replace(/^bot$/, 'paper_bot')}`;
    const profile = String(raw.profile || '');
    if (surface !== expectedSurface || !context.knownSurfaces.has(surface) || usedSurfaces.has(surface)) {
      throw new Error(`invalid compose service surface: ${serviceName}`);
    }
    if (!context.knownProfiles.has(profile)) throw new Error(`invalid compose service profile: ${serviceName}`);
    usedSurfaces.add(surface);

    const requiredKeys = uniqueStringList(raw.required_keys, 'compose required keys', { allowEmpty: true });
    const optionalKeys = uniqueStringList(raw.optional_keys, 'compose optional keys', { allowEmpty: true });
    const defaultedKeys = uniqueStringList(raw.defaulted_keys, 'compose defaulted keys', { allowEmpty: true });
    const mounts = uniqueStringList(raw.mounts, 'compose mounts', { allowEmpty: true });
    const forbiddenClasses = uniqueStringList(raw.forbidden_environment_classes, 'compose forbidden classes');
    assertKnownList(forbiddenClasses, context.knownClasses, 'compose forbidden environment class');
    if (!forbiddenClasses.includes('execution')) {
      throw new Error(`compose service must forbid execution: ${serviceName}`);
    }
    const categorized = [...requiredKeys, ...optionalKeys, ...defaultedKeys];
    if (new Set(categorized).size !== categorized.length) {
      throw new Error(`duplicate compose environment key: ${serviceName}`);
    }

    for (const name of categorized) {
      const entry = context.index.get(name);
      if (!entry) throw new Error(`unknown compose environment key: ${name}`);
      if (!entryAllowsName(entry, name, surface, profile)) {
        throw new Error(`compose environment key not allowed on surface: ${name}`);
      }
      if (forbiddenClasses.includes(entry.environment_class)) {
        throw new Error(`compose environment key has forbidden class: ${name}`);
      }
      if (defaultedKeys.includes(name) && entry.default === null) {
        throw new Error(`compose defaulted key has no manifest default: ${name}`);
      }
    }

    const eligible = context.entries
      .filter((entry) => (
        entry.environment_class !== 'internal'
        && entryAllowsName(entry, entry.name, surface, profile)
      ))
      .map((entry) => entry.name)
      .sort();
    if (JSON.stringify([...categorized].sort()) !== JSON.stringify(eligible)) {
      throw new Error(`compose service key inventory mismatch: ${serviceName}`);
    }

    const fixedOverrides = raw.fixed_overrides;
    if (!fixedOverrides || typeof fixedOverrides !== 'object' || Array.isArray(fixedOverrides)) {
      throw new Error(`invalid compose fixed overrides: ${serviceName}`);
    }
    for (const [name, value] of Object.entries(fixedOverrides)) {
      if (!context.index.has(name)) throw new Error(`unknown compose fixed override: ${name}`);
      if (typeof value !== 'string') throw new Error(`invalid compose fixed override: ${name}`);
    }
    for (const [name, value] of Object.entries(REQUIRED_SAFE_COMPOSE_OVERRIDES)) {
      if (fixedOverrides[name] !== value) throw new Error(`unsafe compose fixed override: ${name}`);
    }
    const composeProfile = raw.compose_profile === null ? null : String(raw.compose_profile || '');
    if (composeProfile !== null && !composeProfile) {
      throw new Error(`invalid compose profile: ${serviceName}`);
    }
    const commandIdentity = String(raw.command_identity || '').trim();
    if (!commandIdentity) throw new Error(`invalid compose command identity: ${serviceName}`);

    rows[serviceName] = Object.freeze({
      surface,
      profile,
      compose_profile: composeProfile,
      command_identity: commandIdentity,
      required_keys: Object.freeze(requiredKeys),
      optional_keys: Object.freeze(optionalKeys),
      defaulted_keys: Object.freeze(defaultedKeys),
      fixed_overrides: Object.freeze({ ...fixedOverrides }),
      mounts: Object.freeze(mounts),
      forbidden_environment_classes: Object.freeze(forbiddenClasses),
    });
  }
  return Object.freeze(rows);
}

function loadEnvironmentManifest(options = {}) {
  const manifestPath = path.resolve(options.path || MANIFEST_PATH);
  const parsed = JSON.parse((options.readFileSync || fs.readFileSync)(manifestPath, 'utf8'));
  if (!parsed || parsed.schema_version !== 3 || !Array.isArray(parsed.groups)) {
    throw new Error('unsupported_environment_manifest');
  }
  const environmentClasses = uniqueStringList(parsed.environment_classes, 'environment classes');
  const profiles = uniqueStringList(parsed.profiles, 'environment profiles');
  const surfaces = uniqueStringList(parsed.surfaces, 'environment surfaces');
  const knownClasses = new Set(environmentClasses);
  const knownProfiles = new Set(profiles);
  const knownSurfaces = new Set(surfaces);
  const entries = [];
  const names = new Set();
  for (const group of parsed.groups) {
    const groupClass = String(group.environment_class || '');
    const groupProfiles = uniqueStringList(group.profiles, 'group profiles', { allowEmpty: true });
    const groupSurfaces = uniqueStringList(group.allowed_surfaces, 'group surfaces');
    if (!knownClasses.has(groupClass)) throw new Error(`unknown environment class: ${groupClass}`);
    assertKnownList(groupProfiles, knownProfiles, 'environment profile');
    assertKnownList(groupSurfaces, knownSurfaces, 'environment surface');
    for (const rawMember of group.members || []) {
      const member = typeof rawMember === 'string' ? { name: rawMember } : rawMember;
      const entryClass = String(member.environment_class || groupClass);
      const entryProfiles = member.profiles === undefined
        ? groupProfiles
        : uniqueStringList(member.profiles, 'entry profiles', { allowEmpty: true });
      const entrySurfaces = member.allowed_surfaces === undefined
        ? groupSurfaces
        : uniqueStringList(member.allowed_surfaces, 'entry surfaces');
      const frontendNames = member.frontend_names === undefined
        ? []
        : uniqueStringList(member.frontend_names, 'frontend names');
      if (!knownClasses.has(entryClass)) throw new Error(`unknown environment class: ${entryClass}`);
      assertKnownList(entryProfiles, knownProfiles, 'environment profile');
      assertKnownList(entrySurfaces, knownSurfaces, 'environment surface');
      const entry = {
        name: String(member.name || ''),
        aliases: Array.isArray(member.aliases) ? member.aliases.map(String) : [],
        scope: String(group.scope || ''),
        sensitivity: String(group.sensitivity || ''),
        environment_class: entryClass,
        frontend_exposure: group.frontend_exposure === true,
        frontend_names: Object.freeze(frontendNames),
        profiles: Object.freeze([...entryProfiles]),
        allowed_surfaces: Object.freeze([...entrySurfaces]),
        default: member.default === undefined ? null : String(member.default),
        central_copy: member.central_copy === true,
      };
      if (!/^[A-Z][A-Z0-9_]*$/.test(entry.name)) throw new Error(`invalid environment name: ${entry.name}`);
      for (const name of [entry.name, ...entry.aliases]) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`invalid environment alias: ${name}`);
        if (names.has(name)) throw new Error(`duplicate environment name or alias: ${name}`);
        names.add(name);
      }
      if (entry.frontend_exposure && entry.sensitivity !== 'public') {
        throw new Error(`frontend environment entry must be public: ${entry.name}`);
      }
      if (entry.frontend_exposure !== (entry.frontend_names.length > 0)) {
        throw new Error(`frontend exposure requires explicit frontend names: ${entry.name}`);
      }
      for (const frontendName of entry.frontend_names) {
        if (![entry.name, ...entry.aliases].includes(frontendName) || !frontendName.startsWith('VITE_')) {
          throw new Error(`invalid frontend environment name: ${frontendName}`);
        }
      }
      if (entry.frontend_names.length > 0 && !entry.allowed_surfaces.includes('public_client')) {
        throw new Error(`frontend environment entry missing public_client surface: ${entry.name}`);
      }
      if (entry.environment_class === 'execution') {
        if (entry.central_copy || entry.profiles.includes('central-host') || entry.profiles.includes('client')) {
          throw new Error(`execution environment entry crosses a forbidden profile: ${entry.name}`);
        }
        if (entry.frontend_exposure) {
          throw new Error(`execution environment entry cannot reach frontend: ${entry.name}`);
        }
      }
      entries.push(Object.freeze(entry));
    }
  }
  const index = new Map();
  for (const entry of entries) {
    for (const name of [entry.name, ...entry.aliases]) index.set(name, entry);
  }
  const composeServices = validateComposeServices(parsed, {
    entries,
    index,
    knownClasses,
    knownProfiles,
    knownSurfaces,
  });
  return Object.freeze({
    schema_version: 3,
    environment_classes: Object.freeze(environmentClasses),
    profiles: Object.freeze(profiles),
    surfaces: Object.freeze(surfaces),
    entries: Object.freeze(entries),
    names,
    compose_services: composeServices,
  });
}

function aliasesForCentralCopy(options = {}) {
  return Object.freeze(Object.fromEntries(
    loadEnvironmentManifest(options).entries
      .filter((entry) => entry.central_copy)
      .map((entry) => [entry.name, Object.freeze([entry.name, ...entry.aliases])]),
  ));
}

function environmentNameIndex(options = {}) {
  const index = new Map();
  for (const entry of loadEnvironmentManifest(options).entries) {
    for (const name of [entry.name, ...entry.aliases]) index.set(name, entry);
  }
  return index;
}

function entryAllowsName(entry, name, surface, profile) {
  if (!entry.allowed_surfaces.includes(surface)) return false;
  if (entry.profiles.length > 0 && !entry.profiles.includes(profile)) return false;
  if (surface === 'public_client' && !entry.frontend_names.includes(name)) return false;
  return true;
}

function projectEnvironmentForSurface(environment, surface, options = {}) {
  const manifest = loadEnvironmentManifest(options);
  const profile = String(options.profile || environment.SOVEREIGN_DEPLOYMENT_PROFILE || 'developer');
  if (!manifest.surfaces.includes(surface)) throw new Error(`unknown environment surface: ${surface}`);
  if (!manifest.profiles.includes(profile)) throw new Error(`unknown environment profile: ${profile}`);
  const index = environmentNameIndex(options);
  const projected = {};
  for (const [name, value] of Object.entries(environment || {})) {
    const entry = index.get(name);
    if (entry && entryAllowsName(entry, name, surface, profile)) {
      projected[name] = value;
    } else if (!entry && options.preserveUnknown === true) {
      projected[name] = value;
    }
  }
  return projected;
}

function forbiddenEnvironmentNames(environment, surface, options = {}) {
  const projected = projectEnvironmentForSurface(environment, surface, options);
  const index = environmentNameIndex(options);
  return Object.keys(environment || {})
    .filter((name) => index.has(name) && !Object.prototype.hasOwnProperty.call(projected, name))
    .sort();
}

function buildChildEnvironment(environment, surface, options = {}) {
  const source = environment || {};
  const profile = String(options.profile || source.SOVEREIGN_DEPLOYMENT_PROFILE || 'developer');
  const projected = projectEnvironmentForSurface(source, surface, { ...options, profile });
  for (const name of CHILD_RUNTIME_PASSTHROUGH) {
    if (source[name] !== undefined) projected[name] = source[name];
  }

  const index = environmentNameIndex(options);
  const overrides = options.overrides || {};
  for (const [name, value] of Object.entries(overrides)) {
    const entry = index.get(name);
    const allowed = CHILD_RUNTIME_PASSTHROUGH.includes(name)
      || (entry && entryAllowsName(entry, name, surface, profile));
    if (!allowed) throw new Error(`environment_override_not_allowed: ${name}`);
    if (value === undefined) delete projected[name];
    else projected[name] = String(value);
  }

  // Execution authorization must never depend on test conveniences. Keep this
  // denylist independent of manifest configuration so a future metadata change
  // cannot project a mock-auth bypass into an order-capable child.
  if (surface === 'execution') {
    for (const name of EXECUTION_DENYLIST) delete projected[name];
  }

  projected.SOVEREIGN_ENVIRONMENT_SURFACE = surface;
  return Object.freeze(projected);
}

function validateComposeServiceEnvironment(serviceName, environment, options = {}) {
  const manifest = loadEnvironmentManifest(options);
  const service = manifest.compose_services[serviceName];
  if (!service) throw new Error(`unknown compose service: ${serviceName}`);
  const index = environmentNameIndex(options);
  const allowedNames = new Set([
    ...service.required_keys,
    ...service.optional_keys,
    ...service.defaulted_keys,
  ]);
  const missingRequiredKeys = service.required_keys
    .filter((name) => typeof environment[name] !== 'string' || environment[name].trim() === '')
    .sort();
  const forbiddenKeys = [];
  const unknownKeys = [];
  for (const name of Object.keys(environment || {})) {
    const entry = index.get(name);
    if (!entry) {
      unknownKeys.push(name);
    } else if (
      !allowedNames.has(name)
      || service.forbidden_environment_classes.includes(entry.environment_class)
    ) {
      forbiddenKeys.push(name);
    }
  }
  forbiddenKeys.sort();
  unknownKeys.sort();
  return Object.freeze({
    ok: missingRequiredKeys.length === 0 && forbiddenKeys.length === 0 && unknownKeys.length === 0,
    type: 'compose_service_environment_contract',
    service: serviceName,
    surface: service.surface,
    missing_required_keys: Object.freeze(missingRequiredKeys),
    forbidden_keys: Object.freeze(forbiddenKeys),
    unknown_keys: Object.freeze(unknownKeys),
  });
}

function projectEnvironmentForComposeService(environment, serviceName, options = {}) {
  const manifest = loadEnvironmentManifest(options);
  const service = manifest.compose_services[serviceName];
  if (!service) throw new Error(`unknown compose service: ${serviceName}`);
  return Object.freeze(projectEnvironmentForSurface(environment, service.surface, {
    ...options,
    profile: service.profile,
  }));
}

module.exports = {
  CHILD_RUNTIME_PASSTHROUGH,
  EXECUTION_DENYLIST,
  EXPECTED_COMPOSE_SERVICES,
  MANIFEST_PATH,
  aliasesForCentralCopy,
  buildChildEnvironment,
  environmentNameIndex,
  forbiddenEnvironmentNames,
  loadEnvironmentManifest,
  projectEnvironmentForSurface,
  projectEnvironmentForComposeService,
  validateComposeServiceEnvironment,
};
