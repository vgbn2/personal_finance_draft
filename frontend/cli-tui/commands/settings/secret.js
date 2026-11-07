'use strict';

const fs = require('node:fs');
const path = require('node:path');
const A = require('../../../../shared/lib/ui/ansi');
const utils = require('../../lib/utils');
const { printPayload } = utils;
const {
  DEFAULT_TEMPLATE_PATH,
  loadEnvSchema,
  validateSecretKey,
  validateSecretsBatch,
  parseBatchInput,
  listSecrets,
  writeSecrets,
} = require('../../../../shared/lib/settings/secrets');
const { ENV_PATH } = require('../../../../shared/lib/runtime/env');
const { redactValue } = require('../../../../shared/lib/brokers/common');

function paint(code, text) {
  return A.c(code, text);
}

function parseFlags(args) {
  const flags = {
    json: args.includes('--json'),
    batch: null,
    envFile: null,
    templateFile: null,
    positionals: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--batch') {
      flags.batch = args[++i];
    } else if (arg.startsWith('--batch=')) {
      flags.batch = arg.slice(8);
    } else if (arg === '--env-file' || arg === '--env-path') {
      flags.envFile = args[++i];
    } else if (arg.startsWith('--env-file=')) {
      flags.envFile = arg.slice(11);
    } else if (arg === '--template') {
      flags.templateFile = args[++i];
    } else if (arg.startsWith('--template=')) {
      flags.templateFile = arg.slice(11);
    } else if (!arg.startsWith('-')) {
      flags.positionals.push(arg);
    }
  }

  return flags;
}

function renderListTable(items) {
  const sep = paint(A.DIM, '─'.repeat(75));
  console.log(`\n${paint(A.B_CYAN, 'SOVEREIGN')} ${A.muted('— Stored Secrets (.env)')}\n${sep}`);
  console.log(`  ${paint(A.BOLD, 'KEY'.padEnd(42))} ${paint(A.BOLD, 'VALUE (REDACTED)'.padEnd(20))} ${paint(A.BOLD, 'STATUS')}`);
  console.log(sep);

  if (items.length === 0) {
    console.log(`  ${paint(A.DIM, 'No secrets found in target environment file.')}`);
  } else {
    for (const item of items) {
      const status = item.set ? paint(A.GREEN, 'CONFIGURED') : paint(A.DIM, 'EMPTY');
      const valStr = item.set ? item.value : paint(A.DIM, '(empty)');
      console.log(`  ${item.key.padEnd(42)} ${valStr.padEnd(20)} ${status}`);
    }
  }
  console.log(`${sep}\n`);
}

async function commandSecret(args) {
  const flags = parseFlags(args);
  const targetEnv = flags.envFile || ENV_PATH;
  const templatePath = flags.templateFile || DEFAULT_TEMPLATE_PATH;

  let schema;
  try {
    schema = loadEnvSchema(templatePath);
  } catch (err) {
    const msg = `Error loading schema: ${err.message}`;
    if (flags.json) {
      printPayload({ ok: false, error: msg }, args);
    } else {
      console.error(paint(A.RED, `✖ ${msg}`));
    }
    return 1;
  }

  const sub = flags.positionals[0];

  // 1. LIST SUBCOMMAND
  if (!sub || sub === 'list' || sub === 'ls') {
    const items = listSecrets(targetEnv);
    if (flags.json) {
      printPayload({ ok: true, secrets: items, env_path: targetEnv }, args);
    } else {
      renderListTable(items);
    }
    return 0;
  }

  // 2. SET SUBCOMMAND
  if (sub === 'set') {
    let entries = [];

    if (flags.batch !== null) {
      let rawData = '';
      if (flags.batch === '-') {
        try {
          rawData = fs.readFileSync(0, 'utf8');
        } catch (err) {
          const msg = `Error reading from STDIN: ${err.message}`;
          if (flags.json) printPayload({ ok: false, error: msg }, args);
          else console.error(paint(A.RED, `✖ ${msg}`));
          return 1;
        }
      } else {
        const batchFile = path.resolve(process.cwd(), flags.batch);
        if (!fs.existsSync(batchFile)) {
          const msg = `Batch file not found: ${batchFile}`;
          if (flags.json) printPayload({ ok: false, error: msg }, args);
          else console.error(paint(A.RED, `✖ ${msg}`));
          return 1;
        }
        rawData = fs.readFileSync(batchFile, 'utf8');
      }

      entries = parseBatchInput(rawData);
      if (entries.length === 0) {
        const msg = 'No valid secret key-value pairs parsed from batch input.';
        if (flags.json) printPayload({ ok: false, error: msg }, args);
        else console.error(paint(A.RED, `✖ ${msg}`));
        return 1;
      }
    } else {
      const key = flags.positionals[1];
      const value = flags.positionals[2] !== undefined ? flags.positionals[2] : '';
      if (!key) {
        const msg = 'Usage: sovereign secret set <KEY> <VALUE> or sovereign secret set --batch <file|->';
        if (flags.json) printPayload({ ok: false, error: msg }, args);
        else console.error(paint(A.RED, `✖ ${msg}`));
        return 1;
      }
      entries = [[key, value]];
    }

    // Atomic transaction check
    const validation = validateSecretsBatch(entries, schema);
    if (!validation.ok) {
      const errorStr = validation.errors.join('; ');
      if (flags.json) {
        printPayload({ ok: false, error: errorStr, errors: validation.errors }, args);
      } else {
        console.error(paint(A.RED, `✖ Error: ${errorStr}`));
      }
      return 1;
    }

    try {
      const writeResult = writeSecrets(entries, targetEnv);
      const maskedSummary = entries.map(([k, v]) => `${k}=${redactValue(v)}`);

      if (flags.json) {
        printPayload({
          ok: true,
          env_path: writeResult.env_path,
          updated: writeResult.updated,
          added: writeResult.added,
          keys: entries.map(([k]) => k),
          masked: maskedSummary,
          mode: writeResult.mode,
        }, args);
      } else {
        console.log(paint(A.GREEN, `✔ Successfully stored ${entries.length} secret(s) in ${writeResult.env_path} (mode ${writeResult.mode}):`));
        for (const item of maskedSummary) {
          console.log(`  ${paint(A.DIM, '•')} ${item}`);
        }
      }
      return 0;
    } catch (err) {
      const msg = `Error persisting secrets: ${err.message}`;
      if (flags.json) printPayload({ ok: false, error: msg }, args);
      else console.error(paint(A.RED, `✖ ${msg}`));
      return 1;
    }
  }

  const help = `Usage:
  sovereign secret list [--json] [--env-file <path>]
  sovereign secret set <KEY> <VALUE> [--json] [--env-file <path>]
  sovereign secret set --batch <file.json|.env|-> [--json] [--env-file <path>]`;

  if (flags.json) {
    printPayload({ ok: false, error: `Unknown subcommand: ${sub}`, help }, args);
  } else {
    console.error(paint(A.YELLOW, help));
  }
  return 1;
}

module.exports = {
  commandSecret,
};
