'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';
import { StoreCell, useStores } from '@/components/admin/bits';

// Pricing plans (limits + commission) and which plan each website is on.
export default function Plans() {
  const { user } = useAuth();
  const can = user.permissions.includes('plans.manage');
  const { data, error, loading, reload } = useLoad(() => api('/admin/plans'));
  const stores = useStores();
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  async function act(fn, ok) { setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await reload(); await stores.reload(); } catch (e) { setErr(e.message); } }
  if (loading && !data) return <Loading />;
  const lim = (n) => (n > 0 ? n.toLocaleString() : 'Unlimited');
  return (
    <>
      <div className="page-head"><div><h1>Plans</h1><p className="muted" style={{ margin: '4px 0 0' }}>Limits are enforced: a website cannot add more products or staff than its plan allows.</p></div>{can && <button className="btn primary" onClick={() => setEdit({})}>＋ New plan</button>}</div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      <div className="plan-cards">
        {data?.plans.map((p) => (
          <div className={`plan-card ${p.isPopular ? 'pop' : ''}`} key={p._id} style={{ opacity: p.isActive ? 1 : .55 }}>
            {p.isPopular && <span className="tag">Most popular</span>}
            <div className="row between"><h3 style={{ margin: 0 }}>{p.name}</h3>{!p.isActive && <Badge>hidden</Badge>}</div>
            <div className="muted">{p.description}</div>
            <div className="price-big">{money(p.price)}<small className="muted" style={{ fontSize: 14, fontWeight: 500 }}> /{p.interval}</small></div>
            <ul>
              <li>{lim(p.maxProducts)} products</li><li>{lim(p.maxStaff)} staff accounts</li><li>{p.commissionPercent}% platform commission</li>
              {p.features?.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <div className="grow" />
            <div className="row between"><span className="muted" style={{ fontSize: 13 }}>{p.stores} website{p.stores === 1 ? '' : 's'}</span>
              {can && <div className="row"><button className="btn sm" onClick={() => setEdit(p)}>Edit</button><button className="btn sm danger" onClick={() => confirm(`Delete ${p.name}?`) && act(() => api(`/admin/plans/${p._id}`, { method: 'DELETE' }), 'Plan deleted.')}>Delete</button></div>}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Website plans</h3>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Website</th><th>Status</th><th>Plan</th></tr></thead>
          <tbody>{stores.data?.stores.map((s) => (
            <tr key={s.id}><td><StoreCell s={s} /></td><td><Badge>{s.status}</Badge></td>
              <td>{can ? (
                <select className="select-sm" value={s.planId || ''} onChange={(e) => act(() => api(`/admin/tenants/${s.id}/plan`, { method: 'PUT', body: { planId: e.target.value || null } }), `${s.name} moved to the new plan.`)} aria-label={`Plan for ${s.name}`}>
                  <option value="">No plan</option>{data?.plans.map((p) => <option key={p._id} value={p._id}>{p.name} — {money(p.price)}/{p.interval}</option>)}
                </select>
              ) : (data?.plans.find((p) => p._id === s.planId)?.name || 'No plan')}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
      {edit && <Form plan={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); setMsg('Plan saved.'); reload(); }} />}
    </>
  );
}

function Form({ plan, onClose, onDone }) {
  const [f, setF] = useState({ name: plan.name || '', description: plan.description || '', price: plan.price ?? 0, interval: plan.interval || 'month', maxProducts: plan.maxProducts ?? 0, maxStaff: plan.maxStaff ?? 0, commissionPercent: plan.commissionPercent ?? 0, features: (plan.features || []).join('\n'), isPopular: !!plan.isPopular, isActive: plan.isActive !== false });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    const body = { ...f, price: Number(f.price), maxProducts: Number(f.maxProducts) || 0, maxStaff: Number(f.maxStaff) || 0, commissionPercent: Number(f.commissionPercent) || 0, features: f.features.split('\n').map((x) => x.trim()).filter(Boolean) };
    try { await api(plan._id ? `/admin/plans/${plan._id}` : '/admin/plans', { method: plan._id ? 'PUT' : 'POST', body }); onDone(); } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title={plan._id ? `Edit ${plan.name}` : 'New plan'} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Name" value={f.name} onChange={set('name')} error={fe.name} required autoFocus />
        <Field label="Short description" value={f.description} onChange={set('description')} />
        <div className="grid2">
          <Field label="Price (Rs.)" type="number" min="0" value={f.price} onChange={set('price')} />
          <Field label="Billed"><select value={f.interval} onChange={set('interval')}><option value="month">Monthly</option><option value="year">Yearly</option></select></Field>
          <Field label="Max products" type="number" min="0" value={f.maxProducts} onChange={set('maxProducts')} hint="0 = unlimited" />
          <Field label="Max staff accounts" type="number" min="0" value={f.maxStaff} onChange={set('maxStaff')} hint="0 = unlimited" />
        </div>
        <Field label="Platform commission (%)" type="number" min="0" max="50" step="0.5" value={f.commissionPercent} onChange={set('commissionPercent')} hint="Deducted from the store's earnings in Payouts." />
        <Field label="Features (one per line)"><textarea rows={4} value={f.features} onChange={set('features')} placeholder={'Coupons & flash sales\nEmail support'} /></Field>
        <div className="row"><label><input type="checkbox" checked={f.isPopular} onChange={(e) => setF({ ...f, isPopular: e.target.checked })} /> Mark as most popular</label><label><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Visible</label></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Save plan</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
