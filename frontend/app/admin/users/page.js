'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Field, Loading, Modal, Pager, useLoad } from '@/components/ui';

const PLATFORM = ['super_admin', 'platform_staff'];
const TENANT = ['tenant_owner', 'tenant_manager', 'tenant_editor', 'tenant_cashier', 'tenant_vendor'];

function UsersInner() {
  const { user: me } = useAuth();
  const isSuper = me.permissions.includes('platformUsers.manage');
  const initTenant = useSearchParams().get('tenantId') || '';
  const [scope, setScope] = useState('');
  const [tenantId, setTenantId] = useState(initTenant);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState(null); // {} for new, user for edit
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useLoad(() => api(`/admin/users${qs({ scope, tenantId, q: dq, page, limit: 15 })}`), [scope, tenantId, dq, page]);
  const tenants = useLoad(() => api('/admin/tenants?limit=100'));

  async function remove(u) {
    if (!confirm(`Delete ${u.email}?`)) return;
    setErr('');
    try { await api(`/admin/users/${u._id}`, { method: 'DELETE' }); reload(); } catch (e) { setErr(e.message); }
  }
  async function toggle(u) {
    setErr('');
    try { await api(`/admin/users/${u._id}`, { method: 'PUT', body: { status: u.status === 'disabled' ? 'active' : 'disabled' } }); reload(); } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="page-head"><h1>Users</h1><button className="btn primary" onClick={() => setEdit({})}>＋ Add user</button></div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} />
          {isSuper && <select value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }} style={{ padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} aria-label="Scope"><option value="">All users</option><option value="platform">Platform users</option><option value="tenant">Tenant users</option></select>}
          <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); setPage(1); }} style={{ padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} aria-label="Tenant">
            <option value="">All tenants</option>{tenants.data?.items.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </div>
        {loading && !data ? <Loading /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Tenant</th><th>Status</th><th>Last login</th><th /></tr></thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u._id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td>{u.role.replace('_', ' ')}</td><td>{u.tenantId?.name || '— platform —'}</td><td><Badge>{u.status}</Badge></td><td className="muted">{fmtDate(u.lastLogin)}</td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setEdit(u)}>Edit</button>
                    <button className="btn sm" onClick={() => toggle(u)}>{u.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                    <button className="btn sm danger" onClick={() => remove(u)}>Delete</button>
                  </div></td></tr>
              ))}
              {data?.items.length === 0 && <tr><td colSpan={7} className="center muted">No users.</td></tr>}
            </tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
      {edit && <UserModal user={edit} isSuper={isSuper} tenants={tenants.data?.items || []} defaultTenant={tenantId} onClose={() => setEdit(null)} onDone={(m) => { setEdit(null); setMsg(m); reload(); }} />}
    </>
  );
}

function UserModal({ user, isSuper, tenants, defaultTenant, onClose, onDone }) {
  const isNew = !user._id;
  const roles = isSuper ? [...PLATFORM, ...TENANT] : TENANT;
  const [f, setF] = useState({ name: user.name || '', email: user.email || '', role: user.role || 'tenant_editor', tenantId: user.tenantId?._id || defaultTenant || '', branchId: user.branchId || '', password: '' });
  const [branches, setBranches] = useState([]);
  const needsBranch = ['tenant_cashier', 'tenant_vendor'].includes(f.role);
  useEffect(() => {
    if (!needsBranch || !f.tenantId) { setBranches([]); return; }
    api(`/admin/tenants/${f.tenantId}/branches`).then((d) => setBranches(d.branches)).catch(() => setBranches([]));
  }, [needsBranch, f.tenantId]);
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isPlatform = PLATFORM.includes(f.role);
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    try {
      const body = { name: f.name, role: f.role, ...(isNew ? { email: f.email } : {}), ...(f.password ? { password: f.password } : {}), ...(isNew && !isPlatform ? { tenantId: f.tenantId } : {}), ...(needsBranch ? { branchId: f.branchId || null } : {}) };
      const d = await api(isNew ? '/admin/users' : `/admin/users/${user._id}`, { method: isNew ? 'POST' : 'PUT', body });
      onDone(isNew ? `User created.${d.inviteLink ? ` Invite link (dev): ${d.inviteLink}` : ''}` : 'User updated.');
    } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title={isNew ? 'Add user' : 'Edit user'} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Name" value={f.name} onChange={set('name')} error={fe.name} required />
        <Field label="Email" type="email" value={f.email} onChange={set('email')} error={fe.email} disabled={!isNew} required />
        <Field label="Role"><select value={f.role} onChange={set('role')}>{roles.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></Field>
        {!isPlatform && isNew && <Field label="Tenant"><select value={f.tenantId} onChange={set('tenantId')} required><option value="">Select…</option>{tenants.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>}
        {needsBranch && <Field label="Branch" error={fe.branchId} hint={branches.length ? undefined : 'This store has no branches yet. Add one in its dashboard first.'}><select value={f.branchId} onChange={set('branchId')} required={f.role === 'tenant_vendor'}><option value="">{f.role === 'tenant_vendor' ? 'Select a branch…' : 'All branches'}</option>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>}
        <Field label={isNew ? 'Password (optional)' : 'Reset password (optional)'} type="password" value={f.password} onChange={set('password')} error={fe.password} hint={isNew ? 'Leave empty to send an invitation email instead.' : 'Leave empty to keep the current password.'} minLength={8} />
        <div className="row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export default function Users() { return <Suspense><UsersInner /></Suspense>; }
