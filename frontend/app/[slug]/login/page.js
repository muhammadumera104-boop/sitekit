'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, homeFor } from '@/lib/auth';
import { Alert, Field, Loading } from '@/components/ui';

// A business's own staff door: branded as that business, and it only accepts that business's users.
function TenantLogin() {
  const { slug } = useParams();
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [brand, setBrand] = useState(null);
  const [missing, setMissing] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/public/tenants/${slug}/brand`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (r.ok) setBrand(d); else setMissing(r.status === 403 ? 'This website is currently unavailable.' : 'Website not found.');
    }).catch(() => setMissing('Something went wrong.'));
  }, [slug]);

  useEffect(() => { if (!loading && user && !user.isPlatform && user.tenantSlug === slug) router.replace(homeFor(user)); }, [loading, user, slug, router]);

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const u = await login(email, password, slug);
      const home = homeFor(u);
      router.replace(next && next.startsWith(home) ? next : home);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  if (missing) return <div className="state-page"><div><h2>{missing}</h2></div></div>;
  if (!brand) return <Loading />;
  return (
    <div className="auth-wrap" style={{ '--brand': brand.primary, background: `linear-gradient(160deg, ${brand.primary}22, transparent 60%)` }}>
      <form className="card auth-card" onSubmit={submit}>
        <div className="center" style={{ marginBottom: 14 }}>
          {brand.logo && <img src={brand.logo} alt="" style={{ height: 56, margin: '0 auto 8px', borderRadius: 12 }} />}
          <h2 style={{ margin: 0 }}>{brand.name}</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>Staff sign in</p>
        </div>
        <Alert>{error}</Alert>
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        <div className="field">
          <label>Password</label>
          <div style={{ position: 'relative' }}>
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" style={{ paddingRight: 64 }} />
            <button type="button" className="btn ghost sm" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </div>
        <button className="btn primary" style={{ width: '100%', background: brand.primary, borderColor: brand.primary }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="center" style={{ fontSize: 14 }}><Link href="/forgot-password" style={{ color: brand.primary }}>Forgot password?</Link></p>
        <p className="center" style={{ fontSize: 13, marginBottom: 0 }}><Link href={`/${slug}`} className="muted">← Back to {brand.name}</Link></p>
      </form>
    </div>
  );
}

export default function Page() { return <Suspense><TenantLogin /></Suspense>; }
