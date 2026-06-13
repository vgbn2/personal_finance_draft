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
 * @param {{ attempts?: number, baseDelayMs?: number, retryOn429?: boolean }} [retry={}]
 *   attempts    - Total number of attempts (default 3).
 *   baseDelayMs - Base delay in ms; actual delay = baseDelayMs * 2^attemptIndex (default 300).
 *   retryOn429  - When true, 429 responses are retried with Retry-After backoff (default false).
 *                 On the final attempt the 429 response is returned as-is (not thrown).
 * @returns {Promise<Response>} The last successful response, or throws the last error.
 */
async function fetchWithRetry(url, options = {}, retry = {}) {
  const attempts = typeof retry.attempts === 'number' && retry.attempts >= 1
    ? Math.floor(retry.attempts)
    : 3;
  const baseDelayMs = typeof retry.baseDelayMs === 'number' && retry.baseDelayMs >= 0
    ? retry.baseDelayMs
    : 300;
  const retryOn429 = retry.retryOn429 === true;

  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch(url, options);

      // 429 Too Many Requests — opt-in retry with Retry-After backoff.
      if (response.status === 429 && retryOn429) {
        if (attempt < attempts - 1) {
          const retryAfterRaw = response.headers && response.headers.get
            ? Number(response.headers.get('retry-after')) * 1000
            : 0;
          const retryAfterMs = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : 0;
          const backoffMs = baseDelayMs * Math.pow(2, attempt);
          const waitMs = Math.max(backoffMs, retryAfterMs);
          if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
          lastResponse = response;
          lastError = null;
          continue;
        }
        // Final attempt: return the 429 as-is (do not throw).
        return response;
      }

      // Other 4xx responses are not retried — they represent a client/business error.
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

/**
 * Wraps any async function with the same transient-error retry logic used by
 * fetchWithRetry.  Handles:
 *   - Transport errors (EACCES, ECONNREFUSED, etc.) that are thrown directly.
 *   - Axios-style errors: err.response present + status >= 500 → transient;
 *     status 4xx → non-retryable; no err.response with matching code → transport.
 *   - AggregateError / generic fetch failures with no code → treated as transient.
 *
 * @template T
 * @param {() => Promise<T>} fn  - Async function to call (called fresh each attempt).
 * @param {{ attempts?: number, baseDelayMs?: number }} [retry={}]
 *   attempts    - Total number of attempts (default 3).
 *   baseDelayMs - Base delay in ms; actual delay = baseDelayMs * 2^attemptIndex (default 300).
 * @returns {Promise<T>}
 */
async function retryTransient(fn, retry = {}) {
  const attempts = typeof retry.attempts === 'number' && retry.attempts >= 1
    ? Math.floor(retry.attempts)
    : 3;
  const baseDelayMs = typeof retry.baseDelayMs === 'number' && retry.baseDelayMs >= 0
    ? retry.baseDelayMs
    : 300;

  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      return await fn();
    } catch (err) {
      // Axios-style error: has err.response with a status code.
      if (err && err.response && typeof err.response.status === 'number') {
        const status = err.response.status;
        // 5xx → transient, retry
        if (isRetryableStatus(status)) {
          lastError = err;
          continue;
        }
        // 4xx → client/business error, do not retry
        throw err;
      }

      // Transport-level error (EACCES, ECONNREFUSED, etc.)
      if (isRetryableError(err)) {
        lastError = err;
        continue;
      }

      // AggregateError (e.g. from Promise.any) or errors with no code — treat as transient
      if (err && (err instanceof AggregateError || (err.name === 'AggregateError'))) {
        lastError = err;
        continue;
      }

      // Unknown error — do not retry
      throw err;
    }
  }

  throw lastError;
}

module.exports = { fetchWithRetry, retryTransient };
