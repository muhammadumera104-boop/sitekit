'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import { money } from '@/lib/util';
import { Alert, Badge, Loading, Modal, useLoad } from '@/components/ui';

// Every website on the platform in one place: live thumbnails, quick stats and one-click access.
export default function AllWebsites() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading } = useLoad(() => api(`/admin/sites${qs({ q: dq, status })}`), [dq, status]);

  async function openDashboard(s) {
    setErr('');
    try { await api(`/admin/tenants/${s._id}/impersonate`, { method: 'POST' }); router.push(`/dashboard/${s.slug}`); } catch (e) { setErr(e.message); }
  }
  const sites = data?.sites || [];
  const count = (st) => sites.filter((s) => s.status === st).length;

  return (
    <>
      <div className="page-head">
        <div><h1>All websites</h1><p className="muted" style={{ margin: '4px 0 0' }}>{sites.length} website{sites.length === 1 ? '' : 's'} · {count('active')} live · {count('draft')} draft · {count('suspended')} suspended</p></div>
        <Link className="btn primary" href="/admin/tenants/new">＋ Add new website</Link>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search websites…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search websites" />
        <div className="seg">
          {[['', 'All'], ['active', 'Live'], ['draft', 'Draft'], ['suspended', 'Suspended']].map(([v, l]) => <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>)}
        </div>
      </div>
      <Alert>{error || err}</Alert>
      {loading && !data ? <Loading /> : !sites.length ? <div className="card center muted">No websites found.</div> : (
        <div className="site-cards">
          {sites.map((s) => (
            <article className="site-card" key={s._id} style={{ '--c': s.theme?.primary || '#4f46e5' }}>
              <div className="cover" style={s.hero?.image ? { backgroundImage: `url(${s.hero.image})` } : undefined}>
                <span className="cover-badge"><Badge>{s.status}</Badge></span>
                {s.branding?.logo ? <img className="logo" src={s.branding.logo} alt="" /> : <div className="logo" />}
              </div>
              <div className="body">
                <h3>{s.name}</h3>
                <div className="muted url">/{s.slug} · {s.templateKey} template</div>
                {s.branding?.tagline && <p className="tag">{s.branding.tagline}</p>}
                <div className="mini-stats">
                  <div><strong>{s.stats.items}</strong><span>Products</span></div>
                  <div><strong>{s.stats.orders}</strong><span>Orders</span></div>
                  <div><strong>{money(s.stats.revenue)}</strong><span>Sales</span></div>
                  <div><strong>{s.stats.users}</strong><span>Staff</span></div>
                </div>
                <div className="row actions">
                  {s.status === 'active' ? <button className="btn sm primary" onClick={() => setView(s)}>Preview</button> : <button className="btn sm" disabled title="Only live websites can be previewed">Preview</button>}
                  {s.status === 'active' && <a className="btn sm" href={`/${s.slug}`} target="_blank" rel="noopener noreferrer">Open ↗</a>}
                  <button className="btn sm" onClick={() => openDashboard(s)}>Dashboard</button>
                  <Link className="btn sm" href={`/admin/products?store=${s._id}`}>Products</Link>
                  <Link className="btn sm" href={`/admin/tenants/${s._id}`}>Manage</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {view && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setView(null)}>
          <div className="viewer" role="dialog" aria-label={`Preview of ${view.name}`}>
            <div className="viewer-bar">
              <strong>{view.name}</strong><span className="muted">localhost:3000/{view.slug}</span>
              <span style={{ flex: 1 }} />
              <a className="btn sm" href={`/${view.slug}`} target="_blank" rel="noopener noreferrer">Open in new tab ↗</a>
              <button className="btn sm" onClick={() => setView(null)}>Close ✕</button>
            </div>
            <iframe title={view.name} src={`/${view.slug}`} />
          </div>
        </div>
      )}
    </>
  );
}
