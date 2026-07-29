'use strict';

const crypto = require('node:crypto');

const SECRET_REDACTORS = [
  {
    pattern: /\b(bearer)\s+[a-z0-9._~+/=-]+/gi,
    replace: (_match, label) => `${label} [REDACTED]`,
  },
  {
    pattern: /\b(pin|token|secret|password|authorization|cookie)\b(\s*[:=]\s*)([^\s,;]+)/gi,
    replace: (_match, label, separator) => `${label}${separator}[REDACTED]`,
  },
  {
    pattern: /:\/\/[^/\s:@]+:[^/\s@]+@/g,
    replace: '://[REDACTED]@',
  },
];

function sanitizedText(value, limit = 2000) {
  let text = String(value || '');
  for (const redactor of SECRET_REDACTORS) {
    text = text.replace(redactor.pattern, redactor.replace);
  }
  return text.slice(0, limit);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function diagnosticEvidence(result = {}, limit = 2000) {
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const failureClass = result.error?.code
    ? `spawn_error:${result.error.code}`
    : result.signal
      ? `signal:${result.signal}`
      : Number.isInteger(result.status) && result.status !== 0
        ? `nonzero_exit:${result.status}`
        : 'unknown_failure';
  return {
    failure_class: failureClass,
    summary: sanitizedText(
      result.error?.message || stderr || stdout || 'command failed without diagnostic output',
      limit,
    ),
    stdout_sha256: sha256Text(stdout),
    stderr_sha256: sha256Text(stderr),
  };
}

module.exports = {
  diagnosticEvidence,
  sanitizedText,
  sha256Text,
};
