'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Loading, useLoad } from '@/components/ui';

export default function Templates() {
  const { user } = useAuth();
  const canManage = user.permissions.includes('templates.manage');
  const { data, error, loading, reload } = useLoad(() => api('/admin/templates'));
  const [err, setErr] = useState('');
  async function toggle(t) {
    setErr('');
    try { await api(`/admin/templates/${t._id}`, { method: 'PUT', body: { status: t.status === 'enabled' ? 'disabled' : 'enabled' } }); reload(); } catch (e) { setErr(e.message); }
  }
  if (loading && !data) return <Loading />;
  return (
    <>
      <div className="page-head"><h1>Templates</h1></div>
      <p className="muted">Templates are defined once in code and registered here. Each declares the sections and data fields it needs.</p>
      <Alert>{error || err}</Alert>
      <div className="grid2">
        {data?.templates.map((t) => (
          <div key={t._id} className="card" style={{ marginTop: 0 }}>
            <div className="row between"><h3 style={{ margin: 0 }}>{t.name}</h3><Badge>{t.status}</Badge></div>
            <p className="muted">{t.description}</p>
            <p style={{ fontSize: 13 }}><strong>Sections:</strong> {t.supportedSections?.join(', ')}<br /><strong>Data:</strong> {t.dataSchema?.itemLabel} ({t.dataSchema?.fields?.join(', ')}){t.dataSchema?.cart ? ' · cart enabled' : ''}<br /><strong>Used by:</strong> {t.tenantCount} tenant(s) · v{t.version}</p>
            {canManage ? <button className="btn sm" onClick={() => toggle(t)}>{t.status === 'enabled' ? 'Disable' : 'Enable'}</button> : <span className="muted" style={{ fontSize: 13 }}>Only the Super Admin can manage templates.</span>}
          </div>
        ))}
      </div>
    </>
  );
}
