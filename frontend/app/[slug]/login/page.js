'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth, homeFor } from '@/lib/auth';
import { Alert, Field, Loading } from '@/components/ui';

const DOORS = [
  { key: 'owner', icon: '👑', title: 'Owner', text: 'Full control of the business, team, settings and reports.' },
  { key: 'manager', icon: '🧑‍💼', title: 'Manager', text: 'Run daily operations: orders, menu, areas and staff.' },
  { key: 'worker', icon: '👷', title: 'Worker', text: 'Cashier, vendor or content staff: POS, stock and menu.' },
  { key: 'rider', icon: '🛵', title: 'Delivery Rider', text: 'See your assigned deliveries and mark them delivered.' },
];

// A business's own staff door: branded as that business, and it only accepts that business's users.
function TenantLogin() {
  const { slug } = useParams();
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next');
  const door = DOORS.find((d) => d.key === sp.get('role')) || null;
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
      const u = await login(email, password, slug, door?.key);
      const home = homeFor(u);
      router.replace(next && next.startsWith(home) ? next : home);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  if (missing) return <div className="state-page"><div><h2>{missing}</h2></div></div>;
  if (!brand) return <Loading />;
  if (!door) {
    return (
      <div className="auth-wrap" style={{ '--brand': brand.primary, background: `linear-gradient(160deg, ${brand.primary}22, transparent 60%)` }}>
        <div className="card door-card">
          <div className="center" style={{ marginBottom: 18 }}>
            {brand.logo && <img src={brand.logo} alt="" style={{ height: 56, margin: '0 auto 8px', borderRadius: 12 }} />}
            <h2 style={{ margin: 0 }}>{brand.name} — Staff login</h2>
            <p className="muted" style={{ margin: '4px 0 0' }}>Choose how you work with us</p>
          </div>
          <div className="door-grid">
            {DOORS.map((d) => (
              <Link key={d.key} className="door" href={`/${slug}/login?role=${d.key}${next ? `&next=${encodeURIComponent(next)}` : ''}`}>
                <span className="ico">{d.icon}</span><strong>{d.title}</strong><small>{d.text}</small>
              </Link>
            ))}
          </div>
          <p className="center" style={{ fontSize: 13, margin: '18px 0 0' }}><Link href={`/${slug}`} className="muted">← Back to {brand.name}</Link></p>
        </div>
      </div>
    );
  }
  return (
    <div className="auth-wrap" style={{ '--brand': brand.primary, background: `linear-gradient(160deg, ${brand.primary}22, transparent 60%)` }}>
      <form className="card auth-card" onSubmit={submit}>
        <div className="center" style={{ marginBottom: 14 }}>
          {brand.logo && <img src={brand.logo} alt="" style={{ height: 56, margin: '0 auto 8px', borderRadius: 12 }} />}
          <h2 style={{ margin: 0 }}>{brand.name}</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>{door.icon} {door.title} sign in</p>
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
        <p className="center" style={{ fontSize: 13, marginBottom: 0 }}><Link href={`/${slug}/login`} className="muted">← Choose a different role</Link> · <Link href={`/${slug}`} className="muted">Back to {brand.name}</Link></p>
      </form>
    </div>
  );
}

export default function Page() { return <Suspense><TenantLogin /></Suspense>; }
