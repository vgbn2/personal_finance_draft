#!/usr/bin/env node
'use strict';

const hostBackup = require('../../backend/scripts/ops/host_backup');

if (require.main === module) {
  hostBackup.main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = hostBackup;
