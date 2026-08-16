'use strict';

const SIZING_MODES = Object.freeze([
  'units',
  'notional',
  'risk_budget',
  'contracts',
  'lots',
]);

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteNonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function decimalPlaces(value) {
  const text = String(value).toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function roundDownToStep(value, step) {
  const numericValue = finitePositive(value);
  const numericStep = finitePositive(step);
  if (numericValue === null || numericStep === null) return 0;
  const precision = Math.min(12, Math.max(decimalPlaces(numericStep), 0));
  const steps = Math.floor((numericValue + Number.EPSILON * numericValue) / numericStep);
  return Number((steps * numericStep).toFixed(precision));
}

function stableDecimal(value, precision = 9) {
  return Number(Number(value).toFixed(precision));
}

function reject(code, reason, requestedIntent, details = {}) {
  return {
    ok: false,
    code,
    reason,
    requested_intent: requestedIntent || null,
    ...details,
  };
}

function normalizeSizingIntent({
  intent,
  instrument,
  referencePrice,
  availableNotional,
}) {
  const requestedIntent = intent && typeof intent === 'object' ? { ...intent } : null;
  const mode = String(requestedIntent?.mode || '').trim().toLowerCase();
  const requestedValue = finitePositive(requestedIntent?.value);
  if (!SIZING_MODES.includes(mode)) {
    return reject('unsupported_sizing_mode', `unsupported sizing mode: ${mode || 'missing'}`, requestedIntent);
  }
  if (requestedValue === null) {
    return reject('invalid_sizing_value', 'sizing value must be a positive finite number', requestedIntent);
  }

  const price = finitePositive(referencePrice);
  if (price === null) {
    return reject('invalid_reference_price', 'reference price must be a positive finite number', requestedIntent);
  }

  const quantityStep = finitePositive(instrument?.quantityStep);
  const contractMultiplier = finitePositive(instrument?.contractMultiplier);
  if (quantityStep === null || contractMultiplier === null) {
    return reject(
      'incomplete_instrument_contract',
      'instrument quantity step and contract multiplier are required',
      requestedIntent,
    );
  }

  let exposureMultiplier = contractMultiplier;
  if (mode === 'lots') {
    const unitsPerLot = finitePositive(instrument?.unitsPerLot);
    if (unitsPerLot === null) {
      return reject(
        'missing_units_per_lot',
        'lot sizing requires a positive units-per-lot contract',
        requestedIntent,
      );
    }
    exposureMultiplier *= unitsPerLot;
  }

  let rawQuantity;
  if (mode === 'notional') {
    rawQuantity = requestedValue / (price * exposureMultiplier);
  } else if (mode === 'risk_budget') {
    const stopPrice = finiteNonNegative(requestedIntent.stopPrice);
    if (stopPrice === null || Math.abs(price - stopPrice) < 1e-8) {
      return reject(
        'invalid_stop_price',
        'risk-budget sizing requires a valid stop price with sufficient distance from the reference price',
        requestedIntent,
      );
    }
    rawQuantity = requestedValue / (Math.abs(price - stopPrice) * exposureMultiplier);
  } else {
    rawQuantity = requestedValue;
  }

  const bindingCaps = [];
  const available = finitePositive(availableNotional);
  if (available !== null) {
    const cashQuantity = available / (price * exposureMultiplier);
    if (cashQuantity < rawQuantity) bindingCaps.push('available_notional');
    rawQuantity = Math.min(rawQuantity, cashQuantity);
  }
  const maxQuantity = finitePositive(instrument?.maxQuantity);
  if (maxQuantity !== null && maxQuantity < rawQuantity) {
    bindingCaps.push('max_quantity');
    rawQuantity = maxQuantity;
  }

  const quantity = roundDownToStep(rawQuantity, quantityStep);
  if (quantity <= 0) {
    return reject(
      'below_quantity_step',
      'sizing result is below the instrument quantity step',
      requestedIntent,
      { raw_quantity: rawQuantity, quantity_step: quantityStep },
    );
  }

  const minQuantity = finitePositive(instrument?.minQuantity);
  if (minQuantity !== null && quantity < minQuantity) {
    return reject(
      'below_minimum_quantity',
      `normalized quantity ${quantity} is below the instrument minimum ${minQuantity}`,
      requestedIntent,
      { quantity, min_quantity: minQuantity, quantity_step: quantityStep },
    );
  }

  const projectedNotional = stableDecimal(quantity * price * exposureMultiplier);
  const minNotional = finitePositive(instrument?.minNotional);
  if (minNotional !== null && projectedNotional < minNotional) {
    return reject(
      'below_minimum_notional',
      `projected notional ${projectedNotional} is below the instrument minimum ${minNotional}`,
      requestedIntent,
      { quantity, projected_notional: projectedNotional, min_notional: minNotional },
    );
  }

  const requestedNotional = mode === 'notional' ? requestedValue : null;
  return {
    ok: true,
    requested_intent: requestedIntent,
    reference_price: price,
    raw_quantity: rawQuantity,
    quantity,
    quantity_step: quantityStep,
    contract_multiplier: contractMultiplier,
    units_per_lot: mode === 'lots' ? Number(instrument.unitsPerLot) : null,
    projected_notional: projectedNotional,
    requested_notional: requestedNotional,
    residual_notional: requestedNotional === null
      ? null
      : stableDecimal(Math.max(0, requestedNotional - projectedNotional)),
    binding_caps: bindingCaps,
    rounding: 'down_to_quantity_step',
    instrument: {
      instrument_id: instrument?.instrumentId || null,
      asset_class: instrument?.assetClass || null,
      quote_currency: instrument?.quoteCurrency || requestedIntent.currency || null,
      metadata_source: instrument?.metadataSource || null,
      observed_at: instrument?.observedAt || null,
    },
  };
}

module.exports = {
  SIZING_MODES,
  normalizeSizingIntent,
  roundDownToStep,
};
