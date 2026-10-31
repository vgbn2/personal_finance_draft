/**
 * Build the Socket.IO auth callback used for every connection attempt.
 * Socket.IO invokes this callback again on reconnect, so refreshed Supabase
 * access tokens replace the token used by the previous handshake.
 *
 * @param {() => Promise<Record<string, string>>} resolveAuth
 * @returns {(callback: (auth: Record<string, string>) => void) => void}
 */
export function createSocketAuthProvider(resolveAuth) {
  if (typeof resolveAuth !== 'function') {
    throw new TypeError('resolveAuth must be a function');
  }
  return (callback) => {
    Promise.resolve()
      .then(() => resolveAuth())
      .then(
        (auth) => callback(auth && typeof auth === 'object' ? auth : {}),
        () => callback({}),
      );
  };
}
