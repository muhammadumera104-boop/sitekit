'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// Promo codes customers type at checkout: percent or flat discount, minimum order, dates and usage limit.
export default function PromosPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/promos', { tenant: slug }), [slug]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  async function act(fn) { setErr(''); try { await fn(); await reload(); } catch (e) { setErr(e.message); } }
  const status = (p) => {
    if (!p.isActive) return 'disabled';
    if (p.validTo && new Date(p.validTo) < new Date()) return 'expired';
    if (p.usageLimit > 0 && p.used >= p.usageLimit) return 'used up';
    return 'active';
  };
  return (
    <Protected area="tenant" slug={slug} perm="promos.manage">
      <div className="page-head"><h1>Promo codes</h1><button className="btn primary" onClick={() => setEdit({})}>＋ New promo code</button></div>
      <Alert>{error || err}</Alert>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.promos.length ? <p className="muted center">No promo codes yet. Create one (e.g. WELCOME10) to attract first orders.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Code</th><th>Discount</th><th>Min. order</th><th>Used</th><th>Valid</th><th>Status</th><th /></tr></thead>
            <tbody>{data.promos.map((p) => (
              <tr key={p._id}>
                <td><strong className="code-chip">{p.code}</strong><div className="muted" style={{ fontSize: 12 }}>{p.description}</div></td>
                <td>{p.type === 'percent' ? `${p.value}%` : money(p.value)}{p.type === 'percent' && p.maxDiscount > 0 && <div className="muted" style={{ fontSize: 12 }}>up to {money(p.maxDiscount)}</div>}</td>
                <td>{p.minOrder ? money(p.minOrder) : '—'}</td>
                <td>{p.used}{p.usageLimit > 0 ? ` / ${p.usageLimit}` : ''}</td>
                <td className="muted" style={{ fontSize: 13 }}>{p.validFrom || p.validTo ? `${p.validFrom ? fmtDate(p.validFrom).split(',')[0] : 'now'} → ${p.validTo ? fmtDate(p.validTo).split(',')[0] : 'no end'}` : 'Always'}</td>
                <td><Badge>{status(p)}</Badge></td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => setEdit(p)}>Edit</button>
                  <button className="btn sm" onClick={() => act(() => api(`/tenant/promos/${p._id}`, { method: 'PUT', body: { isActive: !p.isActive }, tenant: slug }))}>{p.isActive ? 'Disable' : 'Enable'}</button>
                  <button className="btn sm danger" onClick={() => confirm(`Delete ${p.code}?`) && act(() => api(`/tenant/promos/${p._id}`, { method: 'DELETE', tenant: slug }))}>Delete</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {edit && <Form p={edit} slug={slug} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </Protected>
  );
}

function Form({ p, slug, onClose, onDone }) {
  const [f, setF] = useState({ code: p.code || '', description: p.description || '', type: p.type || 'percent', value: p.value ?? 10, minOrder: p.minOrder ?? 0, maxDiscount: p.maxDiscount ?? 0, validFrom: day(p.validFrom), validTo: day(p.validTo), usageLimit: p.usageLimit ?? 0 });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    const body = { ...f, value: Number(f.value), minOrder: Number(f.minOrder) || 0, maxDiscount: Number(f.maxDiscount) || 0, usageLimit: Number(f.usageLimit) || 0, validFrom: f.validFrom || null, validTo: f.validTo ? `${f.validTo}T23:59:59` : null };
    try { await api(p._id ? `/tenant/promos/${p._id}` : '/tenant/promos', { method: p._id ? 'PUT' : 'POST', body, tenant: slug }); onDone(); } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title={p._id ? `Edit ${p.code}` : 'New promo code'} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} error={fe.code} required autoFocus hint="What customers type, e.g. WELCOME10" />
        <Field label="Description (shown to the customer)" value={f.description} onChange={set('description')} />
        <div className="grid2">
          <Field label="Type"><select value={f.type} onChange={set('type')}><option value="percent">Percent off</option><option value="flat">Flat amount off (Rs.)</option></select></Field>
          <Field label={f.type === 'percent' ? 'Percent (%)' : 'Amount (Rs.)'} type="number" min="1" value={f.value} onChange={set('value')} error={fe.value} required />
          <Field label="Minimum order (Rs.)" type="number" min="0" value={f.minOrder} onChange={set('minOrder')} />
          {f.type === 'percent' && <Field label="Max discount (Rs.)" type="number" min="0" value={f.maxDiscount} onChange={set('maxDiscount')} hint="0 = no cap" />}
          <Field label="Valid from" type="date" value={f.validFrom} onChange={set('validFrom')} />
          <Field label="Valid until" type="date" value={f.validTo} onChange={set('validTo')} />
        </div>
        <Field label="Total uses allowed" type="number" min="0" value={f.usageLimit} onChange={set('usageLimit')} hint="0 = unlimited" />
        <div className="row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
