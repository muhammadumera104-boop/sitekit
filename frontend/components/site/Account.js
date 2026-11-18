'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fmtDate, money } from '@/lib/util';
import { useOrdering } from './Ordering';

const STATUS = { new: 'Placed', confirmed: 'Confirmed', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'On the way', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled' };

async function cfetch(path, { token, slug, method = 'GET', body } = {}) {
  const r = await fetch(`/api/customer${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, 'X-Store': slug } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.errors ? Object.values(d.errors)[0] : d.message || 'Something went wrong'); e.code = d.code; throw e; }
  return d;
}

// Customer account: sign in / sign up, order history with reorder, saved addresses and profile.
export default function Account({ slug }) {
  const o = useOrdering();
  const { customer, ctoken } = o;
  const [tab, setTab] = useState('orders');
  if (!o.ready) return null;
  if (!ctoken || !customer) return <AuthForm slug={slug} o={o} />;
  return (
    <div className="acct">
      <div className="acct-head">
        <div className="av big">{String(customer.name || '?').charAt(0).toUpperCase()}</div>
        <div><h2 style={{ margin: 0, textAlign: 'left' }}>Hi, {customer.name.split(' ')[0]}</h2><div className="muted">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</div></div>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={o.signOut}>Sign out</button>
      </div>
      <div className="acct-tabs">
        {[['orders', 'My orders'], ['addresses', 'Saved addresses'], ['profile', 'Profile']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'orders' && <Orders slug={slug} o={o} />}
      {tab === 'addresses' && <Addresses slug={slug} o={o} />}
      {tab === 'profile' && <Profile slug={slug} o={o} />}
    </div>
  );
}

function AuthForm({ slug, o }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const d = await cfetch(mode === 'login' ? '/login' : '/register', { method: 'POST', body: mode === 'login' ? { slug, phone: f.phone, password: f.password } : { slug, ...f } });
      o.signIn(d.token, d.customer);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="auth-box">
      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p className="sub" style={{ marginBottom: 20 }}>{mode === 'login' ? 'Sign in to see your orders and saved addresses.' : 'Order faster next time. Save addresses and track every order.'}</p>
      <form onSubmit={submit} className="box" noValidate>
        {err && <div className="alert error">{err}</div>}
        {mode === 'register' && <div className="field"><label>Full name *</label><input value={f.name} onChange={set('name')} autoComplete="name" required /></div>}
        <div className="field"><label>{mode === 'login' ? 'Mobile number or email *' : 'Mobile number *'}</label><input value={f.phone} onChange={set('phone')} inputMode={mode === 'login' ? 'text' : 'tel'} autoComplete="username" placeholder="03xx-xxxxxxx" required /></div>
        {mode === 'register' && <div className="field"><label>Email (optional)</label><input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>}
        <div className="field"><label>Password *</label><input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required /></div>
        <button className="cta" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="center" style={{ marginBottom: 0 }}>
          {mode === 'login' ? <>New here? <button type="button" className="linkish" style={{ color: 'var(--primary)', fontWeight: 700 }} onClick={() => { setMode('register'); setErr(''); }}>Create an account</button></>
            : <>Already have an account? <button type="button" className="linkish" style={{ color: 'var(--primary)', fontWeight: 700 }} onClick={() => { setMode('login'); setErr(''); }}>Sign in</button></>}
        </p>
      </form>
      <p className="center muted sm">You can also <Link href={`/${slug}/${o.menuSlug}`} style={{ textDecoration: 'underline' }}>order as a guest</Link>.</p>
    </div>
  );
}

function Orders({ slug, o }) {
  const router = useRouter();
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { cfetch('/orders', { token: o.ctoken, slug }).then((d) => setOrders(d.orders)).catch((e) => setErr(e.message)); }, [o.ctoken, slug]);
  if (err) return <div className="alert error">{err}</div>;
  if (!orders) return <p className="muted center">Loading your orders…</p>;
  if (!orders.length) return <div className="box center"><h3>No orders yet</h3><p className="muted">Your orders will appear here.</p><Link className="cta" href={`/${slug}/${o.menuSlug}`}>Start ordering</Link></div>;
  return (
    <div className="acct-orders">
      {orders.map((x) => (
        <article className="box" key={x.id}>
          <div className="row between"><strong>#{x.number}</strong><span className={`st-pill ${x.status}`}>{STATUS[x.status] || x.status}</span></div>
          <div className="muted sm">{fmtDate(x.createdAt)}{x.area ? ` · ${x.area}` : ''} · {x.orderType === 'pickup' ? 'Pickup' : 'Delivery'}</div>
          <div style={{ margin: '10px 0', fontSize: 14 }}>{x.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>
          <div className="row between">
            <strong>{money(x.total)}</strong>
            <div className="row">
              {!['delivered', 'completed', 'cancelled'].includes(x.status) && <Link className="btn sm" href={`/${slug}/track?number=${x.number}&phone=${encodeURIComponent(o.customer.phone)}`}>Track</Link>}
              {['delivered', 'completed'].includes(x.status) && !x.reviewed && <Link className="btn sm" href={`/${slug}/track?number=${x.number}&phone=${encodeURIComponent(o.customer.phone)}`}>⭐ Rate</Link>}
              <button className="btn sm primary" onClick={() => { o.reorder(x.items); router.push(`/${slug}/checkout`); }}>↻ Reorder</button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function Addresses({ slug, o }) {
  const [f, setF] = useState({ label: '', address: '', landmark: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function add(e) {
    e.preventDefault(); setErr('');
    try { const d = await cfetch('/addresses', { token: o.ctoken, slug, method: 'POST', body: { ...f, ...(o.loc ? { city: o.loc.city, areaId: o.loc.areaId, areaName: o.loc.areaName } : {}) } }); o.setCustomer(d.customer); setF({ label: '', address: '', landmark: '' }); } catch (x) { setErr(x.message); }
  }
  async function remove(id) {
    try { const d = await cfetch(`/addresses/${id}`, { token: o.ctoken, slug, method: 'DELETE' }); o.setCustomer(d.customer); } catch (x) { setErr(x.message); }
  }
  return (
    <div className="co" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
      <div className="acct-orders">
        {(o.customer.addresses || []).length === 0 && <div className="box muted center">No saved addresses yet.</div>}
        {o.customer.addresses.map((a) => (
          <div className="box" key={a._id}>
            <div className="row between"><strong>📍 {a.label || a.areaName || 'Address'}</strong><button className="btn sm danger" onClick={() => remove(a._id)}>Delete</button></div>
            <div>{a.address}</div>{a.landmark && <div className="muted sm">Near {a.landmark}</div>}{a.areaName && <div className="muted sm">{a.areaName}{a.city ? `, ${a.city}` : ''}</div>}
          </div>
        ))}
      </div>
      <form className="box" onSubmit={add}>
        <h3 style={{ marginTop: 0, textAlign: 'left' }}>Add an address</h3>
        {err && <div className="alert error">{err}</div>}
        <div className="field"><label>Label</label><input value={f.label} onChange={set('label')} placeholder="Home, Office…" /></div>
        <div className="field"><label>Complete address *</label><input value={f.address} onChange={set('address')} required /></div>
        <div className="field"><label>Nearest landmark</label><input value={f.landmark} onChange={set('landmark')} /></div>
        <button className="cta">Save address</button>
      </form>
    </div>
  );
}

function Profile({ slug, o }) {
  const [f, setF] = useState({ name: o.customer.name, email: o.customer.email || '', password: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    try { const d = await cfetch('/me', { token: o.ctoken, slug, method: 'PUT', body: { name: f.name, email: f.email, ...(f.password ? { password: f.password } : {}) } }); o.setCustomer(d.customer); setF({ ...f, password: '' }); setMsg('Saved.'); } catch (x) { setErr(x.message); }
  }
  return (
    <form className="box" onSubmit={save} style={{ maxWidth: 520 }}>
      {err && <div className="alert error">{err}</div>}{msg && <div className="alert success">{msg}</div>}
      <div className="field"><label>Full name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
      <div className="field"><label>Mobile number</label><input value={o.customer.phone} disabled /></div>
      <div className="field"><label>Email</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div className="field"><label>New password (optional)</label><input type="password" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      <button className="cta">Save changes</button>
    </form>
  );
}
