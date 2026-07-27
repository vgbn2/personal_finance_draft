const A = require('../../../../shared/lib/ui/ansi');
const auth = require('../../lib/auth');
const {
  ALL_CAPABILITIES,
} = require('../../../../shared/lib/auth/access_policy');
const {
  createServicePrincipal,
  listServicePrincipals,
  revokeServicePrincipal,
} = require('../../../../shared/lib/auth/service_principals');

function paint(code, text) { return A.c(code, text); }

async function commandLogin(args) {
  const emailFlag = args.indexOf('--email');
  const passFlag  = args.indexOf('--password');
  let email    = emailFlag !== -1 ? args[emailFlag + 1] : '';
  let password = passFlag  !== -1 ? args[passFlag  + 1] : '';

  if (!auth.isSupabaseConfigured()) {
    console.error(paint(A.RED, 'Supabase not configured.'));
    console.error(A.muted('Set SOVEREIGN_SUPABASE_URL and SOVEREIGN_SUPABASE_PUBLISHABLE_KEY in your .env, or the VITE_SUPABASE_* aliases.'));
    return 1;
  }

  try {
    const existing = await auth.getAuthenticatedUser();
    if (existing) {
      console.log(`${paint(A.GREEN, '●')} Already signed in as ${paint(A.BOLD, existing.email)}`);
      console.log(A.muted('  Run `sovereign logout` to sign out.'));
      return 0;
    }
  } catch (error) {
    console.error(`${paint(A.RED, '✖')} Unable to reach Supabase auth: ${error.message}`);
    return 1;
  }

  console.log(`\n${paint(A.B_CYAN, 'SOVEREIGN')} ${A.muted('— Sign In')}\n`);

  try {
    if (!email)    email    = await auth.promptLine('Email');
    if (!password) password = await auth.promptPassword('Password');
  } catch (error) {
    console.error(`${paint(A.RED, '✖')} ${error.message}`);
    return 1;
  }

  if (!email || !password) {
    console.error(paint(A.RED, 'Email and password are required.'));
    return 1;
  }

  process.stdout.write(A.muted('  Authenticating...'));
  try {
    const session = await auth.loginWithCredentials(email, password);
    process.stdout.write('\r' + ' '.repeat(20) + '\r');
    console.log(`${paint(A.GREEN, '●')} Signed in as ${paint(A.BOLD, session.user.email)}`);
    console.log(A.muted(`  Session saved to ${auth.SESSION_PATH}`));
    return 0;
  } catch (err) {
    process.stdout.write('\r' + ' '.repeat(20) + '\r');
    console.error(`${paint(A.RED, '✖')} Login failed: ${err.message}`);
    return 1;
  }
}

async function commandRegister(args) {
  const emailFlag = args.indexOf('--email');
  let email = emailFlag !== -1 ? args[emailFlag + 1] : '';

  if (!auth.isSupabaseConfigured()) {
    console.error(paint(A.RED, 'Supabase not configured.'));
    console.error(A.muted('Set SOVEREIGN_SUPABASE_URL and SOVEREIGN_SUPABASE_PUBLISHABLE_KEY in your .env, or the VITE_SUPABASE_* aliases.'));
    return 1;
  }

  try {
    const existing = await auth.getAuthenticatedUser();
    if (existing) {
      console.log(`${paint(A.GREEN, '●')} Already signed in as ${paint(A.BOLD, existing.email)}`);
      console.log(A.muted('  Log out first to register a new account.'));
      return 0;
    }
  } catch (error) {
    console.error(`${paint(A.RED, '✖')} Unable to reach Supabase auth: ${error.message}`);
    return 1;
  }

  console.log(`\n${paint(A.B_CYAN, 'SOVEREIGN')} ${A.muted('— Create Account')}\n`);

  let password = '';
  let confirm = '';
  try {
    if (!email) email = await auth.promptLine('Email');
    if (!email) { console.error(paint(A.RED, 'Email is required.')); return 1; }

    let attempts = 0;
    while (attempts < 3) {
      password = await auth.promptPasswordWithStrength('Password');
      const { score, missing } = auth.evaluatePassword(password);
      if (score >= 4) break; // Good or better required (Fair is still too weak)
      console.log(`  ${paint(A.YELLOW, '⚠')}  Password too weak. Still needs: ${missing.join(', ')}`);
      attempts++;
      if (attempts === 3) {
        console.error(paint(A.RED, 'Maximum attempts reached. Use a stronger password.'));
        return 1;
      }
      console.log(A.muted('  Try again:\n'));
    }
    if (!password) { console.error(paint(A.RED, 'Maximum attempts reached. Use a stronger password.')); return 1; }

    confirm = await auth.promptPassword('Confirm password');
  } catch (error) {
    console.error(`${paint(A.RED, '✖')} ${error.message}`);
    return 1;
  }
  if (confirm !== password) {
    console.error(`${paint(A.RED, '✖')} Passwords do not match.`);
    return 1;
  }

  process.stdout.write(A.muted('  Creating account...'));
  try {
    const result = await auth.registerWithCredentials(email, password);
    process.stdout.write('\r' + ' '.repeat(25) + '\r');
    if (result.needsConfirmation) {
      console.log(`${paint(A.YELLOW, '○')} Account created — check your inbox at ${paint(A.BOLD, email)} to confirm.`);
      console.log(A.muted('  Once confirmed, run `sovereign login` to sign in.'));
    } else {
      console.log(`${paint(A.GREEN, '●')} Account created and signed in as ${paint(A.BOLD, result.session.user.email)}`);
      console.log(A.muted(`  Session saved to ${auth.SESSION_PATH}`));
    }
    return 0;
  } catch (err) {
    process.stdout.write('\r' + ' '.repeat(25) + '\r');
    console.error(`${paint(A.RED, '✖')} Registration failed: ${err.message}`);
    return 1;
  }
}

async function commandLogout() {
  const user = await auth.getAuthenticatedUser();
  auth.clearSession();
  if (user) {
    console.log(`${paint(A.YELLOW, '○')} Signed out from ${paint(A.BOLD, user.email)}`);
  } else {
    console.log(A.muted('No active session.'));
  }
  return 0;
}

async function commandAuthStatus() {
  if (!auth.isSupabaseConfigured()) {
    console.log(`${paint(A.YELLOW, '○')} Auth: ${A.muted('Supabase not configured (local mode)')}`);
    return 0;
  }
  const session = auth.loadSession();
  if (!session) {
    console.log(`${paint(A.YELLOW, '○')} Auth: ${A.muted('Not signed in')}`);
    console.log(A.muted('  Run `sovereign login` to authenticate.'));
    return 0;
  }
  if (auth.isSessionValid(session)) {
    const exp = new Date(session.expires_at * 1000).toLocaleString();
    console.log(`${paint(A.GREEN, '●')} Auth: ${paint(A.BOLD, session.user.email)}`);
    console.log(A.muted(`  Session valid until ${exp}`));
  } else {
    console.log(`${paint(A.YELLOW, '○')} Auth: ${A.muted('Session expired — run `sovereign login` to refresh')}`);
  }
  return 0;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function requireLocalAdminCredential() {
  if (String(process.env.SOVEREIGN_API_TOKEN || '').length < 24) {
    throw new Error('service administration requires SOVEREIGN_API_TOKEN in the local protected environment');
  }
}

function commandServiceAuth(args) {
  requireLocalAdminCredential();
  const action = args[0];
  if (action === 'list') {
    const payload = {
      ok: true,
      type: 'service_principal_list',
      services: listServicePrincipals(),
    };
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }
  if (action === 'create') {
    const id = optionValue(args, '--id');
    const rawCapabilities = optionValue(args, '--capabilities') || 'status.read';
    const capabilities = rawCapabilities.split(',').map((value) => value.trim()).filter(Boolean);
    const unknown = capabilities.filter((capability) => !ALL_CAPABILITIES.includes(capability));
    if (unknown.length) throw new Error(`unknown capabilities: ${unknown.join(', ')}`);
    const created = createServicePrincipal({
      id,
      capabilities,
      actingUserId: optionValue(args, '--acting-user-id'),
    });
    console.log(JSON.stringify({
      ok: true,
      type: 'service_principal_created',
      service: created.service,
      token: created.token,
      warning: 'Store this token now. It is shown only once and is not stored in plaintext.',
    }, null, 2));
    return 0;
  }
  if (action === 'revoke') {
    const id = optionValue(args, '--id');
    console.log(JSON.stringify({
      ok: true,
      type: 'service_principal_revoked',
      ...revokeServicePrincipal(id),
    }, null, 2));
    return 0;
  }
  console.error('Usage: sovereign auth service create|list|revoke');
  return 1;
}

function commandAuth(args) {
  if (args[0] !== 'service') {
    console.error('Usage: sovereign auth service create|list|revoke');
    return 1;
  }
  return commandServiceAuth(args.slice(1));
}

module.exports = {
  commandAuth,
  commandAuthStatus,
  commandLogin,
  commandLogout,
  commandRegister,
  commandServiceAuth,
};
