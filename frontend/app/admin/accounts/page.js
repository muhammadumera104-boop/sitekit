'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Field, Loading, Modal, Pager, useLoad } from '@/components/ui';
import { StoreSelect, useSearch, useStores } from '@/components/admin/bits';

const ROLES = [['super_admin', 'Super Admin', true], ['platform_staff', 'Platform Staff', true], ['tenant_owner', 'Store Owner'], ['tenant_manager', 'Store Manager'], ['tenant_editor', 'Store Editor'], ['tenant_cashier', 'Cashier'], ['tenant_rider', 'Delivery Rider']];
const pwd = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const a = new Uint32Array(12); crypto.getRandomValues(a); return [...a].map((n) => c[n % c.length]).join('') + '#7'; };

// Login accounts (email + password) for the platform team and for every store.
export default function Accounts() {
  const { user: me } = useAuth();
  const isSuper = me.permissions.includes('platformUsers.manage');
  const stores = useStores();
  const [store, setStore] = useState('');
  const [scope, setScope] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ, dq] = useSearch();
  const [create, setCreate] = useState(false);
  const [reset, setReset] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const { data, error, loading, reload } = useLoad(() => api(`/admin/users${qs({ tenantId: store, scope, q: dq, page, limit: 15 })}`), [store, scope, dq, page]);
  async function act(fn, ok) { setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); reload(); } catch (e) { setErr(e.message); } }
  const role = (r) => (ROLES.find((x) => x[0] === r) || [])[1] || r.replace(/_/g, ' ');

  return (
    <>
      <div className="page-head"><div><h1>Accounts</h1><p className="muted" style={{ margin: '4px 0 0' }}>Create logins with an email and password, reset passwords, and switch accounts on or off.</p></div><button className="btn primary" onClick={() => setCreate(true)}>＋ New account</button></div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      {!isSuper && <Alert type="info">Platform staff can manage store accounts. Only the Super Admin can reset passwords or manage platform accounts.</Alert>}
      <div className="toolbar">
        <input className="search" placeholder="Search name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search accounts" />
        {isSuper && <select className="select-sm" value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }} aria-label="Scope"><option value="">All accounts</option><option value="platform">Platform team</option><option value="tenant">Store accounts</option></select>}
        <StoreSelect stores={stores.data?.stores} value={store} onChange={(v) => { setStore(v); setPage(1); }} all="All websites" />
      </div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No accounts found.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Email (login)</th><th>Role</th><th>Website</th><th>Status</th><th>Last login</th><th /></tr></thead>
            <tbody>{data.items.map((u) => (
              <tr key={u._id}>
                <td><strong>{u.name}</strong>{u._id === me.id && <span className="muted"> (you)</span>}</td><td>{u.email}</td><td>{role(u.role)}</td><td>{u.tenantId?.name || <span className="muted">Platform</span>}</td>
                <td><Badge>{u.status}</Badge></td><td className="muted">{fmtDate(u.lastLogin)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  {isSuper && <button className="btn sm" onClick={() => setReset(u)}>🔑 Set password</button>}
                  {u._id !== me.id && <button className="btn sm" onClick={() => act(() => api(`/admin/users/${u._id}`, { method: 'PUT', body: { status: u.status === 'disabled' ? 'active' : 'disabled' } }), `${u.email} ${u.status === 'disabled' ? 'enabled' : 'disabled'}.`)}>{u.status === 'disabled' ? 'Enable' : 'Disable'}</button>}
                  {u._id !== me.id && <button className="btn sm danger" onClick={() => confirm(`Delete the account ${u.email}?`) && act(() => api(`/admin/users/${u._id}`, { method: 'DELETE' }), 'Account deleted.')}>Delete</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
      {create && <CreateModal isSuper={isSuper} stores={stores.data?.stores || []} onClose={() => setCreate(false)} onDone={(m) => { setCreate(false); setMsg(m); reload(); }} />}
      {reset && <ResetModal u={reset} onClose={() => setReset(null)} onDone={(m) => { setReset(null); setMsg(m); reload(); }} />}
    </>
  );
}

function PasswordField({ value, onChange, error }) {
  const [show, setShow] = useState(true);
  return (
    <div className="field">
      <label>Password (min. 8 characters)</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} minLength={8} required autoComplete="new-password" style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={() => onChange(pwd())}>Generate</button>
        <button type="button" className="btn sm" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        <button type="button" className="btn sm" onClick={() => value && navigator.clipboard?.writeText(value)}>Copy</button>
      </div>
      {error && <span className="err">{error}</span>}
    </div>
  );
}

function CreateModal({ isSuper, stores, onClose, onDone }) {
  const roles = ROLES.filter((r) => isSuper || !r[2]);
  const [f, setF] = useState({ name: '', email: '', role: roles.find((r) => r[0] === 'tenant_owner')?.[0] || roles[0][0], tenantId: stores[0]?.id || '', password: pwd() });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const platform = f.role.startsWith('super') || f.role.startsWith('platform');
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    try {
      await api('/admin/users', { method: 'POST', body: { name: f.name, email: f.email, role: f.role, password: f.password, ...(platform ? {} : { tenantId: f.tenantId }) } });
      onDone(`Account created. Login: ${f.email} / ${f.password} — share it securely and ask them to change it.`);
    } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title="New account" onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fe.name} required autoFocus />
        <Field label="Email (used to log in)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={fe.email} required />
        <div className="grid2">
          <Field label="Role"><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {!platform && <Field label="Website"><select value={f.tenantId} onChange={(e) => setF({ ...f, tenantId: e.target.value })} required>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        </div>
        <PasswordField value={f.password} onChange={(v) => setF({ ...f, password: v })} error={fe.password} />
        <p className="muted sm" style={{ margin: '0 0 12px' }}>Vendors need a branch — create them from Users or the store dashboard.</p>
        <div className="row"><button className="btn primary">Create account</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function ResetModal({ u, onClose, onDone }) {
  const [password, setPassword] = useState(pwd());
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); setErr('');
    try { await api(`/admin/users/${u._id}/password`, { method: 'POST', body: { password } }); onDone(`Password changed for ${u.email}. New password: ${password} — they were signed out everywhere.`); } catch (x) { setErr(x.errors?.password || x.message); }
  }
  return (
    <Modal title={`Set password — ${u.email}`} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <p className="muted" style={{ marginTop: 0 }}>The old password stops working and the account is unlocked and signed out on all devices.</p>
        <PasswordField value={password} onChange={setPassword} />
        <div className="row"><button className="btn primary">Set password</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
