import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onEnterLocalMode?: () => void;
}

export default function LoginPage({ onEnterLocalMode }: LoginPageProps) {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [magicSent, setMagicSent] = useState(false);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(err.message);
    setLoading(false);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({ email });
    if (err) { setError(err.message); } else { setMagicSent(true); }
    setLoading(false);
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-full max-w-sm space-y-6 px-6">
        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="font-heading font-bold text-2xl text-[var(--text-main)] tracking-tight">
            Sovereign <em className="not-italic text-[var(--color-brand-cyan)] font-normal">Research OS</em>
          </h1>
          <p className="text-[var(--text-muted)] font-mono text-xs">Local-first trading intelligence</p>
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-6 space-y-5">
          {/* Local Mode First-Run Primary Option */}
          {onEnterLocalMode && (
            <div className="space-y-3 pb-4 border-b border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={onEnterLocalMode}
                className="w-full bg-[var(--color-brand-cyan)] text-[var(--bg-primary)] font-mono font-bold text-sm py-2.5 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Launch Local Operator</span>
              </button>
              <p className="text-[var(--text-muted)] font-mono text-[11px] text-center leading-relaxed">
                Zero-config offline mode. Runs local paper ledger, public feeds, and disk storage without cloud signup.
              </p>
            </div>
          )}

          {!supabase ? (
            <div className="text-center pt-1">
              <p className="text-[var(--text-muted)] font-mono text-xs">
                Cloud Sync (Supabase) is unconfigured. Running in standalone local mode.
              </p>
            </div>
          ) : magicSent ? (
            <div className="text-center space-y-2 py-4">
              <p className="text-[var(--color-brand-green)] font-mono text-sm">Magic link sent.</p>
              <p className="text-[var(--text-muted)] font-mono text-xs">Check your inbox at {email}</p>
              <button
                onClick={() => { setMagicSent(false); setMode('password'); }}
                className="text-[var(--color-brand-cyan)] font-mono text-xs hover:underline mt-2"
              >
                Back to login
              </button>
            </div>
          ) : (
            <form onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink} className="space-y-4">
              <div className="text-center font-mono text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                — or sign in to Cloud Sync —
              </div>
              <div className="space-y-1">
                <label className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] font-mono placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-brand-cyan)] transition-colors"
                />
              </div>

              {mode === 'password' && (
                <div className="space-y-1">
                  <label className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] font-mono placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-brand-cyan)] transition-colors"
                  />
                </div>
              )}

              {error && (
                <p className="text-red-400 font-mono text-xs">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[var(--text-main)] font-mono font-bold text-sm py-2 rounded-lg hover:border-[var(--color-brand-cyan)] transition-colors disabled:opacity-50"
              >
                {loading ? 'Working...' : mode === 'password' ? 'Sign In to Cloud' : 'Send Magic Link'}
              </button>

              <button
                type="button"
                onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(''); }}
                className="w-full text-[var(--text-muted)] font-mono text-xs hover:text-[var(--text-main)] transition-colors"
              >
                {mode === 'password' ? 'Use magic link instead' : 'Use password instead'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
