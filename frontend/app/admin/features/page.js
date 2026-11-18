'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Loading, useLoad } from '@/components/ui';

// Global feature toggles: a platform-wide kill switch. Each store can still be tuned on its own tenant page,
// but a feature switched off here is off for EVERY store.
export default function FeaturesPage() {
  const { user } = useAuth();
  const canEdit = user.permissions.includes('features.manage');
  const { data, error, loading, reload } = useLoad(() => api('/admin/features'), []);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function toggle(key, on) {
    setErr(''); setMsg('');
    try { await api('/admin/features', { method: 'PUT', body: { features: { [key]: on } } }); setMsg(`Feature ${on ? 'enabled' : 'disabled'} globally.`); await reload(); } catch (e) { setErr(e.message); }
  }
  if (loading && !data) return <Loading />;

  return (
    <>
      <div className="page-head"><h1>Feature toggles</h1></div>
      <p className="muted" style={{ marginTop: -8 }}>Turn a feature on or off for the whole platform. To tune a single store, open it under Tenants. Websites and dashboards pick the change up within a few seconds.</p>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      {!canEdit && <Alert type="info">Only the Super Admin can change global toggles.</Alert>}
      <div className="card">
        {data?.catalog.map((f) => {
          const on = data.globals[f.key] !== false;
          return (
            <div className="feature-row" key={f.key}>
              <div style={{ flex: 1 }}>
                <strong>{f.label}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{f.description}</div>
                <div className="muted" style={{ fontSize: 12 }}>Default: Store template {f.defaults.store ? 'on' : 'off'} · Restaurant template {f.defaults.restaurant ? 'on' : 'off'}</div>
              </div>
              <label className="switch" title={on ? 'On for all stores' : 'Off for all stores'}>
                <input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => toggle(f.key, e.target.checked)} aria-label={`${f.label} globally`} />
                <span className="slider" />
              </label>
            </div>
          );
        })}
      </div>
    </>
  );
}
