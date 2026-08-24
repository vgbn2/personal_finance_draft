'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = function(module, filename) {
    const content = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(content, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    });
    module._compile(compiled.outputText, filename);
  };

  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain, options) {
    try {
      return originalResolve.call(this, request, parent, isMain, options);
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND' && parent && parent.filename) {
        const dir = path.dirname(parent.filename);
        const resolvedPath = path.resolve(dir, request);
        if (fs.existsSync(resolvedPath + '.ts')) {
          return resolvedPath + '.ts';
        }
        if (fs.existsSync(path.join(resolvedPath, 'index.ts'))) {
          return path.join(resolvedPath, 'index.ts');
        }
      }
      throw err;
    }
  };
}
