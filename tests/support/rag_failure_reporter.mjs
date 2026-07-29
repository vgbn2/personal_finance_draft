import fs from 'node:fs';
import path from 'node:path';
import diagnosticUtilities from '../../scripts/dev/sanitized_diagnostics.js';

const { sanitizedText } = diagnosticUtilities;

function failureRecord(data = {}) {
  const error = data.details?.error || data.error || {};
  const errorChain = [];
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = sanitizedText(current.message || current, 1000);
    if (message && !errorChain.includes(message)) errorChain.push(message);
    current = current.cause;
  }
  return {
    schema_version: 1,
    event: 'test_failure',
    recorded_at: new Date().toISOString(),
    revision: process.env.SOVEREIGN_SOURCE_REVISION || null,
    test_name: sanitizedText(data.name || 'unnamed test', 500),
    file: data.file ? path.relative(process.cwd(), data.file) : null,
    line: Number.isInteger(data.line) ? data.line : null,
    column: Number.isInteger(data.column) ? data.column : null,
    nesting: Number.isInteger(data.nesting) ? data.nesting : null,
    failure_type: sanitizedText(error.name || data.type || 'test_failure', 120),
    message: errorChain.join(' <- ') || sanitizedText(data.message || 'test failed'),
    error_code: sanitizedText(error.code || '', 120) || null,
    stack: sanitizedText(error.stack || '', 3000) || null,
  };
}

export default async function* ragFailureReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail') continue;
    const outputPath = process.env.SOVEREIGN_TEST_FAILURE_LOG;
    if (!outputPath) continue;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.appendFileSync(outputPath, `${JSON.stringify(failureRecord(event.data))}\n`, 'utf8');
  }
}

export { failureRecord, sanitizedText };
