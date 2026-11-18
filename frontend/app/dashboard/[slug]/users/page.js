'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';

const ROLES = [['tenant_owner', 'Owner'], ['tenant_manager', 'Manager'], ['tenant_editor', 'Editor'], ['tenant_cashier', 'Cashier'], ['tenant_vendor', 'Vendor'], ['tenant_rider', 'Delivery rider']];
const NEEDS_BRANCH = ['tenant_cashier', 'tenant_vendor'];

export default function TenantUsers() {
  const { slug } = useTenant();
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useLoad(() => Promise.all([api('/tenant/users', { tenant: slug }), api('/tenant/branches', { tenant: slug })]), [slug]);
  const users = data?.[0].users;
  const branches = data?.[1].branches || [];
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function act(fn) { setErr(''); try { await fn(); reload(); } catch (e) { setErr(e.message); } }
  return (
    <Protected area="tenant" slug={slug} perm="tenantUsers.manage">
      <div className="page-head"><h1>Team</h1><button className="btn primary" onClick={() => setEdit({})}>＋ Add user</button></div>
      <Alert>{error || err}</Alert><Alert type="info">{msg}</Alert>
      <div className="card">
        {loading && !data ? <Loading /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th>Last login</th><th /></tr></thead>
            <tbody>{users?.map((u) => (
              <tr key={u._id}><td><strong>{u.name}</strong></td><td>{u.email}</td><td>{u.role.replace('tenant_', '')}</td><td className="muted">{branches.find((b) => b._id === u.branchId)?.name || '—'}</td><td><Badge>{u.status}</Badge></td><td className="muted">{fmtDate(u.lastLogin)}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => setEdit(u)}>Edit</button>
                  {u._id !== me.id && <>
                    <button className="btn sm" onClick={() => act(() => api(`/tenant/users/${u._id}`, { method: 'PUT', body: { status: u.status === 'disabled' ? 'active' : 'disabled' }, tenant: slug }))}>{u.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                    <button className="btn sm danger" onClick={() => confirm(`Remove ${u.email}?`) && act(() => api(`/tenant/users/${u._id}`, { method: 'DELETE', tenant: slug }))}>Remove</button>
                  </>}
                </div></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <Form u={edit} slug={slug} branches={branches} self={edit._id === me.id} onClose={() => setEdit(null)} onDone={(m) => { setEdit(null); setMsg(m); reload(); }} />}
    </Protected>
  );
}

function Form({ u, slug, branches, self, onClose, onDone }) {
  const isNew = !u._id;
  const [f, setF] = useState({ name: u.name || '', email: u.email || '', role: u.role || 'tenant_editor', branchId: u.branchId || '', phone: u.phone || '', password: '' });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    try {
      const body = { name: f.name, role: f.role, phone: f.phone, ...(NEEDS_BRANCH.includes(f.role) ? { branchId: f.branchId || null } : {}), ...(isNew ? { email: f.email } : {}), ...(f.password ? { password: f.password } : {}) };
      const d = await api(isNew ? '/tenant/users' : `/tenant/users/${u._id}`, { method: isNew ? 'POST' : 'PUT', body, tenant: slug });
      onDone(isNew ? `User added.${d.inviteLink ? ` Invite link (dev): ${d.inviteLink}` : ''}` : 'User updated.');
    } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title={isNew ? 'Add team member' : 'Edit team member'} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fe.name} required />
        <Field label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={fe.email} disabled={!isNew} required />
        <Field label="Role" hint="Owner: full control · Manager: content & settings · Editor: content only · Cashier: point of sale & orders · Vendor: products & stock of one branch · Delivery rider: own deliveries"><select value={f.role} disabled={self} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {f.role === 'tenant_rider' && <Field label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} hint="Shown to the customer when the rider is on the way." />}
        {NEEDS_BRANCH.includes(f.role) && (
          <Field label="Branch" error={fe.branchId} hint={f.role === 'tenant_vendor' ? 'A vendor only manages the products of this branch.' : 'A cashier sells and sees orders for this branch.'}>
            <select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })} required={f.role === 'tenant_vendor'}>
              <option value="">{f.role === 'tenant_vendor' ? 'Select a branch…' : 'All branches'}</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={isNew ? 'Password (optional)' : 'Reset password (optional)'} type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={fe.password} hint={isNew ? 'Leave empty to send an invitation email.' : undefined} />
        <div className="row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
