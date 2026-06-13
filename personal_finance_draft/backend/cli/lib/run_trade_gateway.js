const path = require('node:path');

require('ts-node').register({
  transpileOnly: true,
  skipProject: true,
  experimentalResolver: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2020',
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
  },
});

const gateway = require(path.join(__dirname, '..', '..', 'gateway', 'src', 'index.ts'));

Promise.resolve(gateway.main())
  .then(() => {
    process.exitCode = Number.isInteger(process.exitCode) ? process.exitCode : 0;
  })
  .catch((error) => {
    console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error);
    process.exitCode = 1;
  });
