'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';

// Branches / outlets of one store. Cashiers and vendors are assigned to a branch from the Team page.
export default function BranchesPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/branches', { tenant: slug }), [slug]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  async function act(fn) { setErr(''); try { await fn(); await reload(); } catch (e) { setErr(e.message); } }

  return (
    <Protected area="tenant" slug={slug} perm="branches.manage">
      <div className="page-head"><h1>Branches</h1><button className="btn primary" onClick={() => setEdit({})}>＋ Add branch</button></div>
      <Alert>{error || err}</Alert>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.branches.length ? <p className="muted center">No branches yet. Add your first one.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Address</th><th>Phone</th><th>Status</th><th /></tr></thead>
            <tbody>{data.branches.map((b) => (
              <tr key={b._id}><td><strong>{b.name}</strong></td><td>{b.address}</td><td>{b.phone}</td><td><Badge>{b.isActive ? 'active' : 'disabled'}</Badge></td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => setEdit(b)}>Edit</button>
                  <button className="btn sm" onClick={() => act(() => api(`/tenant/branches/${b._id}`, { method: 'PUT', body: { isActive: !b.isActive }, tenant: slug }))}>{b.isActive ? 'Disable' : 'Enable'}</button>
                  <button className="btn sm danger" onClick={() => confirm(`Delete ${b.name}? Its products go back to "all branches" and its staff become unassigned.`) && act(() => api(`/tenant/branches/${b._id}`, { method: 'DELETE', tenant: slug }))}>Delete</button>
                </div></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <Form b={edit} slug={slug} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </Protected>
  );
}

function Form({ b, slug, onClose, onDone }) {
  const [f, setF] = useState({ name: b.name || '', address: b.address || '', phone: b.phone || '' });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    try { await api(b._id ? `/tenant/branches/${b._id}` : '/tenant/branches', { method: b._id ? 'PUT' : 'POST', body: f, tenant: slug }); onDone(); } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title={b._id ? 'Edit branch' : 'New branch'} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={fe.name} required autoFocus />
        <Field label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Field label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <div className="row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
