const { fetchJson } = require('./common');

const WEATHER_LOCATION_COORDS = {
  us_gulf: { latitude: 29.7604, longitude: -95.3698 },
  us_midwest: { latitude: 41.8781, longitude: -87.6298 },
  europe_central: { latitude: 51.9244, longitude: 4.4777 },
  us_west: { latitude: 34.0522, longitude: -118.2437 },
};

const NASA_POWER_PARAMETERS = [
  'T2M',
  'T2M_MAX',
  'T2M_MIN',
  'PRECTOTCORR',
  'WS10M',
  'ALLSKY_SFC_SW_DWN',
];

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== -999 ? parsed : null;
}

function latestPowerDate(parameters) {
  const allDates = new Set();
  for (const values of Object.values(parameters || {})) {
    for (const date of Object.keys(values || {})) {
      allDates.add(date);
    }
  }
  return [...allDates].sort().reverse().find((date) => {
    const t2m = numberOrNull(parameters?.T2M?.[date]);
    return Number.isFinite(t2m);
  });
}

async function fetchNasaPowerWeather(location) {
  const coords = WEATHER_LOCATION_COORDS[location];
  if (!coords) {
    throw new Error(`No NASA POWER coordinates configured for ${location}`);
  }

  const end = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  url.searchParams.set('parameters', NASA_POWER_PARAMETERS.join(','));
  url.searchParams.set('community', 'ag');
  url.searchParams.set('longitude', String(coords.longitude));
  url.searchParams.set('latitude', String(coords.latitude));
  url.searchParams.set('start', yyyymmdd(start));
  url.searchParams.set('end', yyyymmdd(end));
  url.searchParams.set('format', 'JSON');

  const payload = await fetchJson(url.toString());
  const parameters = payload?.properties?.parameter;
  const date = latestPowerDate(parameters);
  if (!date) {
    throw new Error(`NASA POWER returned no usable daily weather for ${location}`);
  }

  return {
    family: 'weather',
    provider: 'nasa_power',
    location,
    timestamp: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T00:00:00.000Z`,
    temperature: numberOrNull(parameters.T2M?.[date]),
    temperature_max: numberOrNull(parameters.T2M_MAX?.[date]),
    temperature_min: numberOrNull(parameters.T2M_MIN?.[date]),
    precipitation: numberOrNull(parameters.PRECTOTCORR?.[date]),
    wind_speed: numberOrNull(parameters.WS10M?.[date]),
    solar_radiation: numberOrNull(parameters.ALLSKY_SFC_SW_DWN?.[date]),
    source: 'nasa_power',
    source_url: url.toString(),
  };
}

module.exports = {
  WEATHER_LOCATION_COORDS,
  fetchNasaPowerWeather,
};