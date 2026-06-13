const NETWORK_CODES = new Set([
  'EACCES',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

function flattenErrorMessages(error) {
  const messages = [];
  let current = error;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (typeof current.message === 'string' && current.message.trim()) {
      messages.push(current.message.trim());
    }
    current = current.cause || null;
  }
  return messages.join(' | ');
}

function flattenErrorCodes(error) {
  const codes = [];
  let current = error;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (typeof current.code === 'string' && current.code.trim()) {
      codes.push(current.code.trim().toUpperCase());
    }
    current = current.cause || null;
  }
  return codes;
}

function isLikelySupabaseNetworkError(error) {
  if (!error) return false;
  const codes = flattenErrorCodes(error);
  if (codes.some((code) => NETWORK_CODES.has(code))) return true;

  const message = flattenErrorMessages(error).toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('getaddrinfo') ||
    message.includes('request failed')
  );
}

function classifySupabaseError(error, action = 'reach Supabase') {
  if (isLikelySupabaseNetworkError(error)) {
    return `Unable to ${action}. Check network access, the Supabase URL, and the publishable key.`;
  }
  const message = error && typeof error.message === 'string' && error.message.trim()
    ? error.message.trim()
    : 'Unknown Supabase error';
  return message;
}

module.exports = {
  classifySupabaseError,
  isLikelySupabaseNetworkError,
};
