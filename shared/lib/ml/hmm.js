'use strict';

// 2-state Gaussian HMM via Baum-Welch EM + Viterbi decoding.
// States: trending (low vol, directional drift) vs choppy (high vol, mean-reverting).
// Input: array of log-returns. Operates in log-space throughout for numerical stability.

const LOG_ZERO = -Infinity;
const EPS = 1e-300;

function logGaussian(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return -0.5 * z * z - Math.log(sigma) - 0.9189385332; // -0.5*ln(2π)
}

function logSumExp(a, b) {
  if (!isFinite(a)) return b;
  if (!isFinite(b)) return a;
  const m = a > b ? a : b;
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

function logSumExpArr(arr) {
  return arr.reduce((acc, v) => logSumExp(acc, v), LOG_ZERO);
}

/**
 * Fit a 2-state Gaussian HMM on a returns series.
 * Returns null when series is too short (<20 bars).
 * @param {number[]} returns  - log-return series
 * @param {number}   maxIter  - EM iteration cap
 * @param {number}   maxBars  - use only the most recent N bars (avoids O(n) blow-up on 1m data)
 */
function fitHmm(returns, { maxIter = 60, maxBars = 400 } = {}) {
  const obs = returns.length > maxBars ? returns.slice(-maxBars) : returns;
  const T = obs.length;
  if (T < 20) return null;

  const allMu = obs.reduce((a, b) => a + b, 0) / T;
  const allSd = Math.sqrt(obs.reduce((s, v) => s + (v - allMu) ** 2, 0) / T) || 0.01;

  // State 0 = trending (smaller σ, positive drift); state 1 = choppy (larger σ, near-zero drift)
  let mu    = [allMu + allSd * 0.3, allMu - allSd * 0.1];
  let sigma = [allSd * 0.7,          allSd * 1.4];
  let pi    = [0.5, 0.5];
  let A     = [[0.93, 0.07], [0.12, 0.88]];

  let prevLL = LOG_ZERO;
  let logGamma = null; // kept outside loop so Viterbi posterior can read last EM step

  for (let iter = 0; iter < maxIter; iter++) {
    // ── Forward ──────────────────────────────────────────────────────────────
    const logAlpha = Array.from({ length: T }, () => [0.0, 0.0]);
    for (let j = 0; j < 2; j++)
      logAlpha[0][j] = Math.log(pi[j] + EPS) + logGaussian(obs[0], mu[j], sigma[j]);
    for (let t = 1; t < T; t++) {
      for (let j = 0; j < 2; j++) {
        const sum = logSumExp(
          logAlpha[t-1][0] + Math.log(A[0][j] + EPS),
          logAlpha[t-1][1] + Math.log(A[1][j] + EPS),
        );
        logAlpha[t][j] = sum + logGaussian(obs[t], mu[j], sigma[j]);
      }
    }
    const logLik = logSumExp(logAlpha[T-1][0], logAlpha[T-1][1]);

    // ── Backward ─────────────────────────────────────────────────────────────
    const logBeta = Array.from({ length: T }, () => [0.0, 0.0]);
    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < 2; i++) {
        logBeta[t][i] = logSumExp(
          Math.log(A[i][0] + EPS) + logGaussian(obs[t+1], mu[0], sigma[0]) + logBeta[t+1][0],
          Math.log(A[i][1] + EPS) + logGaussian(obs[t+1], mu[1], sigma[1]) + logBeta[t+1][1],
        );
      }
    }

    // ── Gamma (state posteriors) ──────────────────────────────────────────────
    logGamma = Array.from({ length: T }, () => [0.0, 0.0]);
    for (let t = 0; t < T; t++) {
      const norm = logSumExp(logAlpha[t][0] + logBeta[t][0], logAlpha[t][1] + logBeta[t][1]);
      logGamma[t][0] = logAlpha[t][0] + logBeta[t][0] - norm;
      logGamma[t][1] = logAlpha[t][1] + logBeta[t][1] - norm;
    }

    // ── Update π ──────────────────────────────────────────────────────────────
    pi[0] = Math.exp(logGamma[0][0]);
    pi[1] = Math.exp(logGamma[0][1]);

    // ── Update A ──────────────────────────────────────────────────────────────
    for (let i = 0; i < 2; i++) {
      const gammaRowSum = logSumExpArr(Array.from({ length: T - 1 }, (_, t) => logGamma[t][i]));
      for (let j = 0; j < 2; j++) {
        const xiSum = logSumExpArr(Array.from({ length: T - 1 }, (_, t) =>
          logAlpha[t][i] + Math.log(A[i][j] + EPS)
          + logGaussian(obs[t+1], mu[j], sigma[j]) + logBeta[t+1][j] - logLik
        ));
        A[i][j] = Math.exp(xiSum - gammaRowSum);
      }
    }

    // ── Update μ, σ ───────────────────────────────────────────────────────────
    for (let j = 0; j < 2; j++) {
      const w = Array.from({ length: T }, (_, t) => Math.exp(logGamma[t][j]));
      const wSum = w.reduce((a, b) => a + b, 0) + EPS;
      const newMu = obs.reduce((s, r, t) => s + w[t] * r, 0) / wSum;
      const variance = obs.reduce((s, r, t) => s + w[t] * (r - newMu) ** 2, 0) / wSum;
      mu[j]    = newMu;
      sigma[j] = Math.sqrt(variance) || 0.0005;
    }

    if (Math.abs(logLik - prevLL) < 1e-5) break;
    prevLL = logLik;
  }

  // ── Viterbi ──────────────────────────────────────────────────────────────────
  const logDelta = [[0.0, 0.0]];
  const psi      = [[0, 0]];
  for (let j = 0; j < 2; j++)
    logDelta[0][j] = Math.log(pi[j] + EPS) + logGaussian(obs[0], mu[j], sigma[j]);

  for (let t = 1; t < T; t++) {
    logDelta.push([0.0, 0.0]);
    psi.push([0, 0]);
    for (let j = 0; j < 2; j++) {
      const v0 = logDelta[t-1][0] + Math.log(A[0][j] + EPS);
      const v1 = logDelta[t-1][1] + Math.log(A[1][j] + EPS);
      const best = v0 > v1 ? 0 : 1;
      logDelta[t][j] = (best === 0 ? v0 : v1) + logGaussian(obs[t], mu[j], sigma[j]);
      psi[t][j]      = best;
    }
  }

  const path = new Array(T);
  path[T-1] = logDelta[T-1][0] > logDelta[T-1][1] ? 0 : 1;
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t+1][path[t+1]];

  // Last-step posteriors
  const raw   = [Math.exp(logGamma[T-1][0]), Math.exp(logGamma[T-1][1])];
  const norm2 = raw[0] + raw[1] || 1;
  const prob  = [raw[0] / norm2, raw[1] / norm2];

  // Label: lower σ state = trending, higher σ = choppy
  const trendState = sigma[0] < sigma[1] ? 0 : 1;
  const choppState = 1 - trendState;
  const curState   = path[T-1];
  const label      = curState === trendState ? 'trending' : 'choppy';

  return {
    label,
    trendingProb:  +prob[trendState].toFixed(3),
    choppyProb:    +prob[choppState].toFixed(3),
    mu:            mu.map(v => +v.toFixed(5)),
    sigma:         sigma.map(v => +v.toFixed(5)),
    trendSigma:    +sigma[trendState].toFixed(5),
    choppSigma:    +sigma[choppState].toFixed(5),
    recentBars:    T,
  };
}

/**
 * Permutation entropy (normalized to [0,1]).
 * 0 = perfectly orderly/trending, 1 = maximally random/choppy.
 * @param {number[]} series  - price or return series
 * @param {number}   order   - embedding dimension (3–5 typical)
 */
function permutationEntropy(series, order = 3) {
  if (series.length < order + 1) return null;
  const factorial = (n) => n <= 1 ? 1 : n * factorial(n - 1);
  const maxH = Math.log(factorial(order));
  const counts = {};
  const N = series.length - order + 1;
  for (let i = 0; i < N; i++) {
    const w = series.slice(i, i + order);
    const perm = Array.from({ length: order }, (_, k) => k)
      .sort((a, b) => w[a] - w[b])
      .join(',');
    counts[perm] = (counts[perm] || 0) + 1;
  }
  const H = -Object.values(counts).reduce((s, c) => {
    const p = c / N;
    return s + p * Math.log(p);
  }, 0);
  return +(H / maxH).toFixed(3);
}

module.exports = { fitHmm, permutationEntropy };
