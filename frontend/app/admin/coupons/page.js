'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';
import { StoreCell, StoreSelect, useStores } from '@/components/admin/bits';

// Coupons / promo codes of every website. Admins can create, pause or delete codes for any store.
export default function Coupons() {
  const { user } = useAuth();
  const can = user.permissions.includes('platformPromos.manage');
  const stores = useStores();
  const [store, setStore] = useState('');
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const { data, error, loading, reload } = useLoad(() => api(`/admin/promos${qs({ tenantId: store })}`), [store]);
  async function act(fn, ok) { setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); reload(); } catch (e) { setErr(e.message); } }
  const status = (p) => (!p.isActive ? 'disabled' : p.validTo && new Date(p.validTo) < new Date() ? 'expired' : p.usageLimit > 0 && p.used >= p.usageLimit ? 'used up' : 'active');
  return (
    <>
      <div className="page-head">
        <div><h1>Coupons</h1><p className="muted" style={{ margin: '4px 0 0' }}>Promo codes customers can use at checkout.</p></div>
        {can && <button className="btn primary" onClick={() => setEdit(true)}>＋ New coupon</button>}
      </div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      <div className="toolbar"><StoreSelect stores={stores.data?.stores} value={store} onChange={setStore} /></div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No coupons yet.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Code</th><th>Website</th><th>Discount</th><th>Min. order</th><th>Used</th><th>Valid until</th><th>Status</th><th /></tr></thead>
            <tbody>{data.items.map((p) => (
              <tr key={p._id}>
                <td><strong className="code-chip">{p.code}</strong><div className="muted" style={{ fontSize: 12 }}>{p.description}</div></td>
                <td><StoreCell s={p.store} /></td>
                <td>{p.type === 'percent' ? `${p.value}%` : money(p.value)}{p.type === 'percent' && p.maxDiscount > 0 && <div className="muted" style={{ fontSize: 12 }}>up to {money(p.maxDiscount)}</div>}</td>
                <td>{p.minOrder ? money(p.minOrder) : '—'}</td>
                <td>{p.used}{p.usageLimit > 0 ? ` / ${p.usageLimit}` : ''}</td>
                <td className="muted">{p.validTo ? fmtDate(p.validTo).split(',')[0] : 'No end'}</td>
                <td><Badge>{status(p)}</Badge></td>
                <td>{can && <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => act(() => api(`/admin/promos/${p._id}`, { method: 'PATCH', body: { isActive: !p.isActive } }))}>{p.isActive ? 'Pause' : 'Enable'}</button>
                  <button className="btn sm danger" onClick={() => confirm(`Delete ${p.code}?`) && act(() => api(`/admin/promos/${p._id}`, { method: 'DELETE' }), 'Coupon deleted.')}>Delete</button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <Form stores={stores.data?.stores || []} defaultStore={store} onClose={() => setEdit(false)} onDone={() => { setEdit(false); setMsg('Coupon created.'); reload(); }} />}
    </>
  );
}

function Form({ stores, defaultStore, onClose, onDone }) {
  const [f, setF] = useState({ tenantId: defaultStore || stores[0]?.id || '', code: '', description: '', type: 'percent', value: 10, minOrder: 0, maxDiscount: 0, validTo: '', usageLimit: 0 });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    try {
      await api('/admin/promos', { method: 'POST', body: { ...f, value: Number(f.value), minOrder: Number(f.minOrder) || 0, maxDiscount: Number(f.maxDiscount) || 0, usageLimit: Number(f.usageLimit) || 0, validTo: f.validTo ? `${f.validTo}T23:59:59` : null } });
      onDone();
    } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title="New coupon" onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Website"><select value={f.tenantId} onChange={set('tenantId')} required>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} error={fe.code} required hint="What customers type, e.g. WELCOME10" />
        <Field label="Description" value={f.description} onChange={set('description')} />
        <div className="grid2">
          <Field label="Type"><select value={f.type} onChange={set('type')}><option value="percent">Percent off</option><option value="flat">Flat amount (Rs.)</option></select></Field>
          <Field label={f.type === 'percent' ? 'Percent (%)' : 'Amount (Rs.)'} type="number" min="1" value={f.value} onChange={set('value')} error={fe.value} required />
          <Field label="Minimum order (Rs.)" type="number" min="0" value={f.minOrder} onChange={set('minOrder')} />
          {f.type === 'percent' && <Field label="Max discount (Rs.)" type="number" min="0" value={f.maxDiscount} onChange={set('maxDiscount')} hint="0 = no cap" />}
          <Field label="Valid until" type="date" value={f.validTo} onChange={set('validTo')} />
          <Field label="Total uses" type="number" min="0" value={f.usageLimit} onChange={set('usageLimit')} hint="0 = unlimited" />
        </div>
        <div className="row"><button className="btn primary">Create coupon</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
