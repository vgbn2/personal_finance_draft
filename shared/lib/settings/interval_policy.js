'use strict';

// One resolver prevents global, personal, and administrator timers from becoming
// independent loops. Intervals are minutes. A larger minimum is slower and safer.
const GLOBAL_BOT_INTERVAL_MIN = 1;

function positiveMinutes(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveBotInterval({ requestedMinutes = null, settings = {}, env = process.env } = {}) {
  const globalMinimum = positiveMinutes(env.SOVEREIGN_GLOBAL_BOT_INTERVAL_MIN, GLOBAL_BOT_INTERVAL_MIN);
  const configuredPersonal = settings?.trading?.bot_interval_min;
  const legacyPersonal = Number(settings?.trading?.polling_interval) / 60;
  const personal = positiveMinutes(
    requestedMinutes,
    positiveMinutes(configuredPersonal, positiveMinutes(legacyPersonal, globalMinimum)),
  );
  const adminMinimum = positiveMinutes(env.SOVEREIGN_ADMIN_BOT_INTERVAL_MIN, globalMinimum);
  const effective = Math.max(globalMinimum, personal, adminMinimum);
  return {
    global_minimum_min: globalMinimum,
    personal_interval_min: personal,
    admin_minimum_min: adminMinimum,
    effective_interval_min: effective,
    constrained_by: adminMinimum > Math.max(globalMinimum, personal)
      ? 'admin'
      : personal > globalMinimum ? 'personal' : 'global',
  };
}

module.exports = { GLOBAL_BOT_INTERVAL_MIN, resolveBotInterval };
