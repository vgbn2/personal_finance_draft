const crypto = require('crypto');

function sha512Hex(value) {
  return crypto.createHash('sha512').update(value || '', 'utf8').digest('hex');
}

function signGateIoRequest(method, requestPath, query, body, timestamp, secret) {
  const canonical = [
    String(method).toUpperCase(),
    requestPath,
    query || '',
    sha512Hex(body || ''),
    String(timestamp),
  ].join('\n');
  return crypto.createHmac('sha512', secret || '').update(canonical, 'utf8').digest('hex');
}

module.exports = {
  signGateIoRequest,
  sha512Hex,
};
