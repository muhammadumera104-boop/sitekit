'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { Alert, Badge, Loading, useLoad } from '@/components/ui';

export default function AdminDashboard() {
  const { data, error, loading } = useLoad(() => api('/admin/stats'));
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const s = data;
  return (
    <>
      <div className="page-head"><h1>Dashboard</h1><div className="row"><Link className="btn" href="/admin/sites">🌐 View all websites</Link><Link className="btn primary" href="/admin/tenants/new">＋ Add new tenant</Link></div></div>
      <div className="stats">
        <div className="stat"><div className="n">{s.total}</div><div className="l">Total tenants</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--ok)' }}>{s.active}</div><div className="l">Active</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--danger)' }}>{s.suspended}</div><div className="l">Suspended</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--warn)' }}>{s.draft}</div><div className="l">Drafts</div></div>
      </div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Recent signups</h3>
          {s.recent.length === 0 && <p className="muted">No tenants yet.</p>}
          <table className="tbl"><tbody>
            {s.recent.map((t) => (
              <tr key={t._id}><td><Link href={`/admin/tenants/${t._id}`}><strong>{t.name}</strong></Link><div className="muted" style={{ fontSize: 12 }}>/{t.slug}</div></td><td><Badge>{t.status}</Badge></td><td className="muted">{fmtDate(t.createdAt)}</td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h3>Recent activity</h3>
          <table className="tbl"><tbody>
            {s.activity.map((a) => (
              <tr key={a._id}><td><strong>{a.action}</strong><div className="muted" style={{ fontSize: 12 }}>{a.userId?.name || 'system'}{a.tenantId ? ` · ${a.tenantId.name}` : ''}</div></td><td className="muted" style={{ fontSize: 12 }}>{fmtDate(a.createdAt)}</td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
