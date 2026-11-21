'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, homeFor } from '@/lib/auth';
import { Alert, Field } from '@/components/ui';

// Platform team door (Super Admin / Platform Staff). Businesses sign in at /{their-slug}/login instead.
function LoginForm() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { // A demo visitor who clicks "Admin login" must see the form, not be sent back into the demo.
    if (!loading && user?.isPlatform && user.role !== 'demo_viewer') router.replace(homeFor(user)); }, [loading, user, router]);

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const u = await login(email, password);
      const home = homeFor(u);
      router.replace(next && next.startsWith(home) ? next : home);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="auth-split">
      <div className="auth-art">
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 28 }}>◆ SiteForge</div>
        <h2>Platform administration</h2>
        <p style={{ color: '#c7cdd9', maxWidth: 420 }}>Restricted area for the platform team. Business owners sign in on their own website&apos;s login page.</p>
      </div>
      <div className="auth-wrap">
        <form className="card auth-card" onSubmit={submit}>
          <h2>Admin sign in</h2>
          <p className="muted">Platform team only.</p>
          <Alert>{error}</Alert>
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
          <div className="field">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" style={{ paddingRight: 64 }} />
              <button type="button" className="btn ghost sm" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="center" style={{ fontSize: 14 }}><Link href="/forgot-password" style={{ color: 'var(--brand)' }}>Forgot password?</Link></p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
