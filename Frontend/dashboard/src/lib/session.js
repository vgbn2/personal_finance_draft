export async function verifySession(auth, candidate) {
  if (!candidate) return { session: null, reason: 'missing_session' };
  try {
    const { data, error } = await auth.getUser(candidate.access_token);
    if (error || !data?.user) return { session: null, reason: 'invalid_session' };
    if (candidate.user?.id && data.user.id !== candidate.user.id) {
      return { session: null, reason: 'user_mismatch' };
    }
    return { session: { ...candidate, user: data.user }, reason: null };
  } catch {
    return { session: null, reason: 'provider_unavailable' };
  }
}

export async function restoreVerifiedSession(auth) {
  try {
    const { data, error } = await auth.getSession();
    if (error) return { session: null, reason: 'session_read_failed' };
    return verifySession(auth, data?.session || null);
  } catch {
    return { session: null, reason: 'provider_unavailable' };
  }
}

export async function clearLocalSession(auth) {
  try {
    await auth.signOut();
    const { data } = await auth.getSession();
    return !data?.session;
  } catch {
    return false;
  }
}
