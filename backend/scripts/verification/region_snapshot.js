#!/usr/bin/env node

const { buildUrl, fetchJson, printSummary } = require('./shared');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

async function main() {
  const url = buildUrl('https://opensky-network.org/api/states/all', {
    lamin: readArg('--lamin', '24'),
    lomin: readArg('--lomin', '-98'),
    lamax: readArg('--lamax', '31.5'),
    lomax: readArg('--lomax', '-80'),
  });
  const payload = await fetchJson(url.toString());
  console.log(`url: ${url.toString()}`);
  printSummary('opensky.region_snapshot', payload);
  const states = Array.isArray(payload?.states) ? payload.states : [];
  const richer = states.slice(0, 5).map((state) => ({
    icao24: state[0],
    callsign: state[1]?.trim?.() || state[1] || null,
    origin_country: state[2] || null,
    time_position: state[3] || null,
    last_contact: state[4] || null,
    longitude: state[5] || null,
    latitude: state[6] || null,
    altitude: state[7] || null,
    on_ground: state[8] ?? null,
    velocity: state[9] || null,
    heading: state[10] || null,
    vertical_rate: state[11] || null,
    geo_altitude: state[13] || null,
    squawk: state[14] || null,
  }));
  console.log('decoded_sample');
  console.log(JSON.stringify(richer, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
