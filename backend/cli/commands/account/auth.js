const A = require('../../../../shared/lib/ui/ansi');
const auth = require('../../lib/auth');

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

module.exports = { commandLogin, commandRegister, commandLogout, commandAuthStatus };
