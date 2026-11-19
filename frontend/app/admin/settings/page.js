'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Field, Loading, useLoad } from '@/components/ui';

// Platform-wide settings. Only the Super Admin can change them.
export default function PlatformSettings() {
  const { user } = useAuth();
  const can = user.permissions.includes('platform.settings');
  const { data, error, loading, reload } = useLoad(() => Promise.all([api('/admin/settings'), api('/admin/plans')]));
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  useEffect(() => { if (data) setF(data[0].settings); }, [data]);
  if ((loading && !data) || !f) return <Loading />;
  const plans = data?.[1].plans || [];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg(''); setFe({});
    try { await api('/admin/settings', { method: 'PUT', body: { ...f, defaultPlanId: f.defaultPlanId || null } }); setMsg('Settings saved.'); reload(); } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <form onSubmit={save}>
      <div className="page-head"><div><h1>Platform settings</h1><p className="muted" style={{ margin: '4px 0 0' }}>Branding, defaults and the maintenance switch for the whole platform.</p></div>{can && <button className="btn primary">Save settings</button>}</div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      {!can && <Alert type="info">Only the Super Admin can change these settings.</Alert>}
      <fieldset disabled={!can} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="card">
          <h3>General</h3>
          <div className="grid2">
            <Field label="Platform name" value={f.platformName} onChange={set('platformName')} error={fe.platformName} hint="Shown in the admin header." />
            <Field label="Currency symbol" value={f.currency} onChange={set('currency')} error={fe.currency} hint="Used when a store has no currency of its own." />
            <Field label="Support email" type="email" value={f.supportEmail} onChange={set('supportEmail')} error={fe.supportEmail} />
            <Field label="Support phone" value={f.supportPhone} onChange={set('supportPhone')} />
          </div>
        </div>
        <div className="card">
          <h3>Defaults for new websites</h3>
          <div className="grid2">
            <Field label="Default plan"><select value={f.defaultPlanId || ''} onChange={set('defaultPlanId')}><option value="">No plan</option>{plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>
            <Field label="Default theme"><select value={f.defaultThemeMode} onChange={set('defaultThemeMode')}><option value="dark">Dark (premium)</option><option value="light">Light</option></select></Field>
          </div>
          <label><input type="checkbox" checked={!!f.allowSignups} onChange={(e) => setF({ ...f, allowSignups: e.target.checked })} /> Allow new businesses to sign up on their own</label>
        </div>
        <div className="card">
          <h3>Maintenance mode</h3>
          <p className="muted" style={{ marginTop: 0 }}>When on, every public website and its ordering pages show the message below. Staff dashboards and this portal keep working.</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}>
            <span className="switch"><input type="checkbox" checked={!!f.maintenanceMode} onChange={(e) => setF({ ...f, maintenanceMode: e.target.checked })} /><span className="slider" /></span>
            <strong>{f.maintenanceMode ? 'Maintenance is ON — websites are offline' : 'Maintenance is off'}</strong>
          </label>
          <Field label="Message shown to visitors"><textarea rows={2} value={f.maintenanceMessage} onChange={set('maintenanceMessage')} /></Field>
          {f.maintenanceMode && <Alert>Websites are currently showing the maintenance message to customers.</Alert>}
        </div>
      </fieldset>
    </form>
  );
}
