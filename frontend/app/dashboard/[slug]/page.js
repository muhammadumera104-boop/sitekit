'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTenant } from '@/components/TenantCtx';
import { Alert, Badge, useLoad } from '@/components/ui';

function TemplateRequest({ slug, current }) {
  const [key, setKey] = useState(current === 'store' ? 'restaurant' : 'store');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function send(e) {
    e.preventDefault(); setErr(''); setMsg('');
    try { setMsg((await api('/tenant/template-request', { method: 'POST', body: { templateKey: key, note }, tenant: slug })).message); setNote(''); } catch (x) { setErr(x.message); }
  }
  return (
    <form className="card" style={{ marginTop: 16 }} onSubmit={send}>
      <h3>Want a different design?</h3>
      <p className="muted" style={{ marginTop: 0 }}>You are using the <strong>{current}</strong> template. Our team can switch it for you and keep all your content.</p>
      <Alert>{err}</Alert><Alert type="success">{msg}</Alert>
      <div className="row">
        <select value={key} onChange={(e) => setKey(e.target.value)} aria-label="Template" style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }}>
          {['restaurant', 'store'].filter((k) => k !== current).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the team" style={{ flex: 1, minWidth: 200, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }} />
        <button className="btn">Request change</button>
      </div>
    </form>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const { slug, tenant, features, reload } = useTenant();
  const can = (p) => user.permissions.includes(p);
  const sales = useLoad(() => (can('orders.view') ? api('/tenant/orders/summary', { tenant: slug }) : Promise.resolve(null)), [slug]);
  const stats = useLoad(() => (can('analytics.view') ? api('/tenant/analytics', { tenant: slug }) : Promise.resolve(null)), [slug]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function publish(p) {
    setBusy(true); setErr('');
    try { await api('/tenant/publish', { method: 'POST', body: { publish: p }, tenant: slug }); await reload(); } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const base = `/dashboard/${slug}`;
  const links = [
    can('deliveries.use') && [`${base}/deliveries`, 'My deliveries'],
    can('areas.manage') && [`${base}/areas`, 'Delivery areas & tax'],
    can('pos.use') && features.pos && [`${base}/pos`, 'Open point of sale'], can('orders.view') && [`${base}/orders`, 'View orders'],
    can('inventory.manage') && features.inventory && [`${base}/inventory`, 'Manage stock'],
    can('products.manage') && [`${base}/menu`, tenant.templateKey === 'store' ? 'Manage products' : 'Manage menu'],
    can('content.manage') && [`${base}/pages`, 'Edit pages'], can('content.manage') && [`${base}/media`, 'Media & gallery'],
    can('messages.manage') && [`${base}/messages`, 'Read messages'], can('settings.edit') && [`${base}/settings`, 'Site settings'],
  ].filter(Boolean);

  return (
    <>
      <div className="page-head"><h1>Welcome back, {user.name.split(' ')[0]}</h1>
        <div className="row">
          {can('content.manage') && <Link className="btn" href={`${base}/preview`}>Preview</Link>}
          {tenant.status === 'active' && <a className="btn" href={`/${slug}`} target="_blank" rel="noopener noreferrer">View live site ↗</a>}
        </div>
      </div>
      <Alert>{err}</Alert>
      <div className="card">
        <div className="row between">
          <div><strong>Website status:</strong> <Badge>{tenant.status}</Badge>
            <div className="muted" style={{ fontSize: 13 }}>{tenant.status === 'active' ? `Live at /${slug}` : 'Not visible to the public. Preview your changes, then publish.'}</div></div>
          {can('site.publish') && (tenant.status === 'active'
            ? <button className="btn" disabled={busy} onClick={() => publish(false)}>Unpublish</button>
            : <button className="btn primary" disabled={busy} onClick={() => publish(true)}>Publish website</button>)}
        </div>
      </div>
      {sales.data && (
        <div className="stats" style={{ marginTop: 16 }}>
          <div className="stat"><div className="n">{sales.data.ordersToday}</div><div className="l">Orders today</div></div>
          <div className="stat"><div className="n">Rs. {Number(sales.data.salesToday).toLocaleString()}</div><div className="l">Sales today</div></div>
          <div className="stat"><div className="n">{sales.data.open}</div><div className="l">Open orders</div></div>
          <div className="stat"><div className="n">{sales.data.posToday} / {sales.data.onlineToday}</div><div className="l">POS / online today</div></div>
        </div>
      )}
      {stats.data && (
        <div className="stats" style={{ marginTop: 16 }}>
          <div className="stat"><div className="n">{stats.data.visits}</div><div className="l">Visits (30 days)</div></div>
          <div className="stat"><div className="n">{stats.data.messages}</div><div className="l">Messages (30 days)</div></div>
          <div className="stat"><div className="n">{stats.data.unread}</div><div className="l">Unread messages</div></div>
        </div>
      )}
      {can('tenant.requestTemplate') && <TemplateRequest slug={slug} current={tenant.templateKey} />}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Quick actions</h3>
        <div className="row">{links.map(([href, label]) => <Link key={href} className="btn" href={href}>{label}</Link>)}</div>
      </div>
    </>
  );
}
