'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  collectEnvPaths,
  loadLocalEnv,
} = require('../../../../../shared/lib/runtime/env');

function fakeFileSystem(files) {
  return {
    existsSync: (filePath) => Object.prototype.hasOwnProperty.call(files, filePath),
    readFileSync: (filePath) => files[filePath],
  };
}

test('explicit SOVEREIGN_ENV_FILE selection is exclusive and never falls through to adjacent files', () => {
  const environment = { SOVEREIGN_ENV_FILE: '/fixture/selected.env' };
  const files = {
    '/fixture/selected.env': 'SELECTED_SENTINEL=selected\n',
    '/fixture/.env.local': 'LOCAL_SENTINEL=must-not-load\n',
    '/fixture/.env': 'DEFAULT_SENTINEL=must-not-load\n',
  };
  const options = {
    environment,
    defaultEnvPath: '/fixture/.env',
    envLocalPath: '/fixture/.env.local',
    fs: fakeFileSystem(files),
  };

  assert.deepEqual(collectEnvPaths('/fixture/.env', options), ['/fixture/selected.env']);
  assert.deepEqual(loadLocalEnv('/fixture/.env', options), { SELECTED_SENTINEL: 'selected' });
  assert.equal(environment.SELECTED_SENTINEL, 'selected');
  assert.equal(environment.LOCAL_SENTINEL, undefined);
  assert.equal(environment.DEFAULT_SENTINEL, undefined);
});

test('default local loading preserves process overrides while retaining deterministic file order', () => {
  const environment = { SHARED_SENTINEL: 'process' };
  const files = {
    '/fixture/.env.local': 'LOCAL_SENTINEL=local\nSHARED_SENTINEL=local\n',
    '/fixture/.env': 'DEFAULT_SENTINEL=default\nSHARED_SENTINEL=default\n',
  };
  const options = {
    environment,
    defaultEnvPath: '/fixture/.env',
    envLocalPath: '/fixture/.env.local',
    fs: fakeFileSystem(files),
  };

  assert.deepEqual(
    collectEnvPaths('/fixture/.env', options),
    ['/fixture/.env.local', '/fixture/.env'],
  );
  loadLocalEnv('/fixture/.env', options);
  assert.equal(environment.LOCAL_SENTINEL, 'local');
  assert.equal(environment.DEFAULT_SENTINEL, 'default');
  assert.equal(environment.SHARED_SENTINEL, 'process');
});
