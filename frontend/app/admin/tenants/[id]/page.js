'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Loading, Modal, useLoad, Field } from '@/components/ui';

export default function TenantDetail() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const can = (p) => user.permissions.includes(p);
  const { data, error, loading, reload } = useLoad(() => Promise.all([api(`/admin/tenants/${id}`), api('/admin/templates')]), [id]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null); // 'suspend' | 'delete'
  const [reason, setReason] = useState('');
  const [slug, setSlug] = useState(null);

  if (loading && !data) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const [{ tenant: t, users, stats, logs, features }, { templates }] = data;
  const canFeatures = can('tenant.features') && t.status !== 'deleted';

  async function run(fn, ok) {
    setErr(''); setMsg('');
    try { await fn(); setMsg(ok); setModal(null); await reload(); } catch (e) { setErr(e.message); }
  }
  const setStatus = (status, why) => run(() => api(`/admin/tenants/${id}/status`, { method: 'PATCH', body: { status, reason: why } }), `Status changed to ${status}.`);

  async function impersonate() {
    try { await api(`/admin/tenants/${id}/impersonate`, { method: 'POST' }); router.push(`/dashboard/${t.slug}`); } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="page-head">
        <div className="row">{t.branding?.logo && <img className="logo-sm" src={t.branding.logo} alt="" />}<h1>{t.name}</h1><Badge>{t.status}</Badge></div>
        <div className="row">
          {t.status === 'active' && <a className="btn" href={`/${t.slug}`} target="_blank" rel="noopener noreferrer">Open live site ↗</a>}
          <Link className="btn" href={`/admin/products?store=${t._id}`}>🛍️ Products ({stats.items})</Link>
          <Link className="btn" href={`/admin/orders?store=${t._id}`}>🧾 Orders</Link>
          {t.status !== 'deleted' && <button className="btn" onClick={impersonate}>Open tenant dashboard</button>}
        </div>
      </div>
      <Alert>{err}</Alert><Alert type="success">{msg}</Alert>
      {t.status === 'suspended' && <Alert>Suspended{t.suspendReason ? `: ${t.suspendReason}` : ''}</Alert>}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Details</h3>
          <table className="tbl"><tbody>
            <tr><td className="muted">URL</td><td>/{t.slug}</td></tr>
            <tr><td className="muted">Business type</td><td>{t.businessType}</td></tr>
            <tr><td className="muted">Owner</td><td>{t.owner?.name}<div className="muted">{t.owner?.email} {t.owner?.phone}</div></td></tr>
            <tr><td className="muted">Created</td><td>{fmtDate(t.createdAt)}</td></tr>
            <tr><td className="muted">Items / Messages</td><td>{stats.items} / {stats.messages}</td></tr>
          </tbody></table>
        </div>
        <div className="card">
          <h3>Actions</h3>
          <div className="stack">
            {t.status !== 'deleted' && can('tenant.changeTemplate') && (
              <Field label="Template">
                <select value={t.templateKey} onChange={(e) => run(() => api(`/admin/tenants/${id}`, { method: 'PUT', body: { templateKey: e.target.value } }), 'Template changed. Data was kept.')}>
                  {templates.filter((x) => x.status === 'enabled' || x.key === t.templateKey).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </select>
              </Field>
            )}
            {t.status !== 'deleted' && can('tenant.changeTemplate') && (
              <div className="row">
                <input value={slug ?? t.slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} style={{ padding: '8px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} aria-label="Slug" />
                <button className="btn sm" disabled={slug === null || slug === t.slug} onClick={() => run(() => api(`/admin/tenants/${id}`, { method: 'PUT', body: { slug } }), 'Slug updated.')}>Change slug</button>
              </div>
            )}
            <div className="row">
              {t.status === 'draft' && can('site.publish') && <button className="btn primary" onClick={() => setStatus('active')}>Publish</button>}
              {t.status === 'active' && can('site.publish') && <button className="btn" onClick={() => setStatus('draft')}>Unpublish</button>}
              {['active', 'draft'].includes(t.status) && can('tenant.suspend') && <button className="btn danger" onClick={() => setModal('suspend')}>Suspend</button>}
              {t.status === 'suspended' && can('tenant.suspend') && <button className="btn primary" onClick={() => setStatus('active')}>Reactivate</button>}
              {t.status === 'deleted' && can('tenant.suspend') && <button className="btn primary" onClick={() => setStatus('draft')}>Restore</button>}
              {t.status !== 'deleted' && can('tenant.delete') && <button className="btn danger" onClick={() => setModal('delete')}>Delete</button>}
            </div>
            {!can('tenant.suspend') && <p className="muted" style={{ fontSize: 13 }}>Suspending and deleting tenants is limited to the Super Admin.</p>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Feature toggles for this store</h3>
        <p className="muted" style={{ marginTop: 0 }}>&ldquo;Default&rdquo; follows the {t.templateKey} template. A feature switched off globally stays off here.</p>
        {features.catalog.map((f) => {
          const own = features.overrides[f.key];
          const def = f.defaults[t.templateKey] ?? f.defaults.restaurant;
          const globalOff = features.globals[f.key] === false;
          return (
            <div className="feature-row" key={f.key}>
              <div style={{ flex: 1 }}>
                <strong>{f.label}</strong> <span className={`badge ${features.effective[f.key] ? 'active' : 'disabled'}`}>{features.effective[f.key] ? 'on' : 'off'}</span>
                <div className="muted" style={{ fontSize: 13 }}>{f.description}{globalOff && <strong> Switched off globally.</strong>}</div>
              </div>
              <select disabled={!canFeatures} value={own === undefined || own === null ? 'default' : own ? 'on' : 'off'} aria-label={`${f.label} for this store`} className="select-sm"
                onChange={(e) => run(() => api(`/admin/tenants/${id}/features`, { method: 'PUT', body: { features: { [f.key]: e.target.value === 'default' ? null : e.target.value === 'on' } } }), `${f.label} updated.`)}>
                <option value="default">Default ({def ? 'on' : 'off'})</option><option value="on">Always on</option><option value="off">Always off</option>
              </select>
            </div>
          );
        })}
      </div>

      <div className="grid2" style={{ alignItems: 'start', marginTop: 16 }}>
        <div className="card">
          <h3>Users</h3>
          <table className="tbl"><tbody>
            {users.map((u) => <tr key={u._id}><td><strong>{u.name}</strong><div className="muted" style={{ fontSize: 12 }}>{u.email}</div></td><td>{u.role.replace('_', ' ')}</td><td><Badge>{u.status}</Badge></td></tr>)}
          </tbody></table>
          <Link href={`/admin/users?tenantId=${t._id}`} className="btn sm" style={{ marginTop: 10 }}>Manage users</Link>
        </div>
        <div className="card">
          <h3>Recent activity</h3>
          {logs.length === 0 && <p className="muted">No activity yet.</p>}
          <table className="tbl"><tbody>
            {logs.map((l) => <tr key={l._id}><td><strong>{l.action}</strong><div className="muted" style={{ fontSize: 12 }}>{l.userId?.name}</div></td><td className="muted" style={{ fontSize: 12 }}>{fmtDate(l.createdAt)}</td></tr>)}
          </tbody></table>
        </div>
      </div>

      {modal === 'suspend' && (
        <Modal title={`Suspend ${t.name}`} onClose={() => setModal(null)}>
          <p className="muted">The public site will show &ldquo;unavailable&rdquo; and tenant users will not be able to log in.</p>
          <Field label="Reason (required)"><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="row"><button className="btn danger" disabled={!reason.trim()} onClick={() => setStatus('suspended', reason)}>Suspend tenant</button><button className="btn" onClick={() => setModal(null)}>Cancel</button></div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title={`Delete ${t.name}?`} onClose={() => setModal(null)}>
          <p>This is a soft delete: the site goes offline and can be restored later. Data is retained for the retention period.</p>
          <div className="row"><button className="btn danger" onClick={() => run(() => api(`/admin/tenants/${id}`, { method: 'DELETE' }), 'Tenant deleted (can be restored).')}>Delete tenant</button><button className="btn" onClick={() => setModal(null)}>Cancel</button></div>
        </Modal>
      )}
    </>
  );
}
