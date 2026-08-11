'use strict';

const DEFAULT_ALLOWED_TIMEFRAMES = Object.freeze(['5m', '15m']);

function parseAllowedTimeframes(value = DEFAULT_ALLOWED_TIMEFRAMES) {
  const values = Array.isArray(value) ? value : String(value).split(',');
  const normalized = [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
  if (normalized.length === 0 || normalized.some((item) => !DEFAULT_ALLOWED_TIMEFRAMES.includes(item))) {
    throw new Error('alpaca_paper_allowed_timeframes_invalid');
  }
  return normalized;
}

function positiveLimit(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${name}_invalid`);
  return number;
}

function utcDay(iso = new Date().toISOString()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error('alpaca_paper_timestamp_invalid');
  return date.toISOString().slice(0, 10);
}

function usedEntryNotional(entryIntents, day) {
  return (entryIntents || []).reduce((total, intent) => (
    intent?.utcDay === day && ['reserved', 'submitted', 'confirmed'].includes(intent.status)
      ? total + Number(intent.reservedNotional || 0)
      : total
  ), 0);
}

function decideEntryBudget({ requestedNotional, perOrderMaxNotional, dailyMaxNotional, entryIntents, now }) {
  const requested = positiveLimit(requestedNotional, 'alpaca_paper_requested_notional');
  const perOrder = positiveLimit(perOrderMaxNotional, 'alpaca_paper_per_order_notional');
  const daily = positiveLimit(dailyMaxNotional, 'alpaca_paper_daily_notional');
  const day = utcDay(now);
  const used = usedEntryNotional(entryIntents, day);
  const remaining = Math.max(0, daily - used);
  const approvedNotional = Math.min(requested, perOrder, remaining);
  return {
    ok: approvedNotional > 0,
    utcDay: day,
    usedNotional: used,
    remainingNotional: remaining,
    approvedNotional,
    reason: approvedNotional > 0 ? null : 'alpaca_paper_daily_budget_exhausted',
  };
}

module.exports = { DEFAULT_ALLOWED_TIMEFRAMES, parseAllowedTimeframes, positiveLimit, utcDay, usedEntryNotional, decideEntryBudget };
