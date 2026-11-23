'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../../../../..');
const DOCKERFILES = ['Dockerfile', 'infra/docker/Dockerfile.allinone'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command}: ${result.error || ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('images opt into recovered ONNX and package the selected real shared library offline', () => {
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'infra/docker/Dockerfile'), 'utf8'),
  );
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'onnx-image-contract-'));
  try {
    const dependency = path.join(temporary, 'dependency');
    fs.mkdirSync(path.join(dependency, 'include'), { recursive: true });
    fs.mkdirSync(path.join(dependency, 'lib'));
    // Real ELF fixture tests packaging/loader discovery, not ONNX inference.
    const library = path.join(dependency, 'lib/libonnxruntime.so.1.17.1');
    run('cc', ['-shared', '-x', 'c', '-Wl,-soname,libonnxruntime.so.1.17.1', '-o', library, '-'], {
      input: 'int image_contract(void) { return 17; }\n',
    });
    fs.symlinkSync('libonnxruntime.so.1.17.1', path.join(dependency, 'lib/libonnxruntime.so'));

    for (const [index, file] of DOCKERFILES.entries()) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.match(source, /^ARG ONNX_RUNTIME_SOURCE_DIR=""$/m);
      assert.match(source, /if \[ -n "\$ONNX_RUNTIME_SOURCE_DIR" \]; then/);
      assert.match(source, /-DFETCHCONTENT_SOURCE_DIR_ONNXRUNTIME_RELEASE=\$ONNX_RUNTIME_SOURCE_DIR/);
      assert.match(source, /-DSOVEREIGN_ENABLE_ONNX_RUNTIME=ON/);
      assert.match(source, /io\.sovereign\.onnx-runtime-source="\$\{ONNX_RUNTIME_PROVENANCE\}"/);
      assert.match(source, /COPY --from=build \/opt\/onnxruntime\/lib\/ \/usr\/local\/lib\//);
      assert.match(source, /\bldconfig\b/);
      assert.doesNotMatch(source, /GH_TOKEN|GITHUB_TOKEN/);

      const build = path.join(temporary, `build-${index}`);
      const configure = source.match(/cmake -S backend\/cpp_core -B backend\/cpp_core\/build ([\s\S]*?)\s*&& cmake --build/);
      assert.ok(configure, 'extract actual image CMake configuration');
      const selectDependency = source.match(/RUN (set -eu;[\s\S]*?)\s*npm run build/);
      assert.ok(selectDependency, 'extract actual opt-in source selection');
      assert.equal(run('sh', ['-ec', `${selectDependency[1]}\nprintf '%s' "$#"`], {
        env: { ...process.env, ONNX_RUNTIME_SOURCE_DIR: '' },
      }), '0', 'ordinary builds pass no FetchContent override');
      run('sh', ['-ec', `${selectDependency[1]}
        cmake -S "${path.join(ROOT, 'backend/cpp_core')}" -B "${build}" ${configure[1]}
          -DFETCHCONTENT_FULLY_DISCONNECTED=ON`], {
        env: { ...process.env, ONNX_RUNTIME_SOURCE_DIR: dependency },
      });
      const cache = fs.readFileSync(path.join(build, 'CMakeCache.txt'), 'utf8');
      assert.ok(cache.includes(`SOVEREIGN_ONNXRUNTIME_LIBDIR:INTERNAL=${dependency}/lib`));

      const packaging = source.match(/&& mkdir -p \/opt\/onnxruntime\/lib([\s\S]*?)(?=\n\n)/);
      assert.ok(packaging, 'extract actual image library packaging commands');
      const destination = path.join(temporary, `runtime-${index}`);
      const shell = `mkdir -p ${destination}${packaging[1]}`
        .replaceAll('backend/cpp_core/build/CMakeCache.txt', path.join(build, 'CMakeCache.txt'))
        .replaceAll('/opt/onnxruntime/lib', destination);
      run('sh', ['-ec', shell]);
      assert.deepEqual(fs.readFileSync(path.join(destination, path.basename(library))), fs.readFileSync(library));
      assert.equal(fs.readlinkSync(path.join(destination, 'libonnxruntime.so')), path.basename(library));
      run('/sbin/ldconfig', ['-n', destination]);
      const probe = path.join(temporary, `probe-${index}`);
      run('cc', ['-x', 'c', '-', '-L', destination, '-lonnxruntime', '-o', probe], {
        input: 'extern int image_contract(void); int main(void) { return image_contract() == 17 ? 0 : 1; }\n',
      });
      run(probe, [], { env: { ...process.env, LD_LIBRARY_PATH: destination } });
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('workflow pins the private recovery archive outside Docker and prepares non-root test scratch space', () => {
  const source = fs.readFileSync(path.join(ROOT, '.github/workflows/docker-publish.yml'), 'utf8');
  assert.match(source, /gh release download sv-dependency-onnx-1\.17\.1/);
  assert.match(source, /--repo "\$GITHUB_REPOSITORY"/);
  assert.match(source, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(source, /ONNX_RUNTIME_SHA256: [a-f0-9]{64}/);
  assert.match(source, /sha256sum --check --strict/);
  assert.ok(source.indexOf('sha256sum --check --strict') < source.indexOf('tar -xzf'));
  assert.match(source, /--strip-components=1/);
  assert.equal((source.match(/ONNX_RUNTIME_SOURCE_DIR=\/app\/\.build-deps\/onnxruntime/g) || []).length, 3);
  assert.equal((source.match(/ONNX_RUNTIME_PROVENANCE=\$\{\{ steps\.onnx\.outputs\.provenance \}\}/g) || []).length, 3);
  assert.match(source, /docker exec sv-allinone-test mkdir -p \/tmp\/opencode\s+docker exec sv-allinone-test node --test/);
  assert.match(source, /docker exec sv-allinone-test \/app\/backend\/cpp_core\/build\/sovereign_wealth --help/);
  assert.match(source, /docker exec sv-slim-test \/app\/backend\/cpp_core\/build\/sovereign_wealth --help/);
});
