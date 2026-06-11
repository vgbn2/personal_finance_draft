'use strict';

/**
 * Transport-level error codes that are safe to retry.
 * Covers Node.js built-in codes and undici (UND_ERR_*) codes.
 */
const RETRYABLE_CODES = new Set([
  'EACCES',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

function isRetryableError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code) || '';
  if (RETRYABLE_CODES.has(code)) return true;
  // undici errors all start with UND_ERR_
  if (typeof code === 'string' && code.startsWith('UND_ERR_')) return true;
  return false;
}

function isRetryableStatus(status) {
  return typeof status === 'number' && status >= 500;
}

/**
 * Fetch with exponential-backoff retry for transient transport failures and 5xx responses.
 *
 * @param {string | URL} url  - Request URL (passed directly to fetch).
 * @param {RequestInit}  [options={}] - Standard fetch options.
 * @param {{ attempts?: number, baseDelayMs?: number }} [retry={}]
 *   attempts    - Total number of attempts (default 3).
 *   baseDelayMs - Base delay in ms; actual delay = baseDelayMs * 2^attemptIndex (default 300).
 * @returns {Promise<Response>} The last successful response, or throws the last error.
 */
async function fetchWithRetry(url, options = {}, retry = {}) {
  const attempts = typeof retry.attempts === 'number' && retry.attempts >= 1
    ? Math.floor(retry.attempts)
    : 3;
  const baseDelayMs = typeof retry.baseDelayMs === 'number' && retry.baseDelayMs >= 0
    ? retry.baseDelayMs
    : 300;

  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch(url, options);

      // 4xx responses are not retried — they represent a client/business error.
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // 5xx responses are retried (unless this was the last attempt).
      if (isRetryableStatus(response.status)) {
        lastResponse = response;
        lastError = null;
        continue;
      }

      // Success (2xx, 3xx, or other non-5xx).
      return response;

    } catch (err) {
      if (!isRetryableError(err)) {
        // Non-transport error (e.g. AbortError, programming error) — don't retry.
        throw err;
      }
      lastError = err;
      lastResponse = null;
    }
  }

  // All attempts exhausted.
  if (lastError) throw lastError;
  // Last attempt returned a 5xx response.
  return lastResponse;
}

module.exports = { fetchWithRetry };
