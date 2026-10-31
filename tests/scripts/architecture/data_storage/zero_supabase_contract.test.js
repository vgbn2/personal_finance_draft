'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

test('zero-supabase contract: @supabase/supabase-js is not in root or workspace package.json', () => {
  const packagePaths = [
    path.join(REPO_ROOT, 'package.json'),
    path.join(REPO_ROOT, 'backend', 'api', 'package.json'),
    path.join(REPO_ROOT, 'backend', 'gateway', 'package.json'),
    path.join(REPO_ROOT, 'frontend', 'dashboard', 'package.json'),
  ];

  for (const pkgPath of packagePaths) {
    assert.strictEqual(fs.existsSync(pkgPath), true, `package.json must exist at ${pkgPath}`);
    const content = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const allDeps = {
      ...(content.dependencies || {}),
      ...(content.devDependencies || {}),
      ...(content.peerDependencies || {}),
      ...(content.optionalDependencies || {}),
    };
    assert.strictEqual(
      '@supabase/supabase-js' in allDeps,
      false,
      `@supabase/supabase-js must be absent from ${pkgPath}`
    );
  }
});

test('zero-supabase contract: supabase migrations and edge functions are completely removed', () => {
  const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
  const functionsDir = path.join(REPO_ROOT, 'supabase', 'functions');

  assert.strictEqual(
    fs.existsSync(migrationsDir),
    false,
    'supabase/migrations directory must be completely removed'
  );
  assert.strictEqual(
    fs.existsSync(functionsDir),
    false,
    'supabase/functions directory must be completely removed'
  );
});

test('zero-supabase contract: backend api router exposes zero supabase routes', () => {
  const routesIndexPath = path.join(REPO_ROOT, 'backend', 'api', 'server', 'routes', 'index.js');
  const content = fs.readFileSync(routesIndexPath, 'utf8');

  assert.strictEqual(
    content.includes('supabase_config'),
    false,
    'routes/index.js must not register or mention supabase_config'
  );
});

test('zero-supabase contract: frontend settings page has zero supabase references', () => {
  const settingsPagePath = path.join(REPO_ROOT, 'frontend', 'dashboard', 'src', 'pages', 'SettingsPage.tsx');
  const content = fs.readFileSync(settingsPagePath, 'utf8');

  assert.strictEqual(
    content.toLowerCase().includes('supabase'),
    false,
    'frontend SettingsPage.tsx must not contain any supabase references'
  );
});
