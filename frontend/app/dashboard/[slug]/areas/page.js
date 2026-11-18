'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';

// Delivery cities and areas (what customers pick first), plus tax, minimum order and delivery time.
export default function AreasPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => Promise.all([api('/tenant/areas', { tenant: slug }), api('/tenant/branches', { tenant: slug }), api('/tenant/ordering', { tenant: slug })]), [slug]);
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function act(fn, ok) { setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await reload(); } catch (e) { setErr(e.message); } }
  if (loading && !data) return <Loading />;
  const [{ areas = [] } = {}, { branches = [] } = {}, { ordering = {} } = {}] = data || [];
  const cities = [...new Set(areas.map((a) => a.city))];

  return (
    <Protected area="tenant" slug={slug} perm="areas.manage">
      <div className="page-head"><h1>Delivery areas</h1><button className="btn primary" onClick={() => setAdd(true)}>＋ Add city / areas</button></div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      <Settings key={JSON.stringify(ordering)} ordering={ordering} slug={slug} onSaved={() => { setMsg('Ordering settings saved.'); reload(); }} />
      {!cities.length && <div className="card center muted" style={{ marginTop: 16 }}>No delivery areas yet. Customers will not be asked for a location until you add some.</div>}
      {cities.map((city) => {
        const list = areas.filter((a) => a.city === city);
        const isOpen = open[city];
        return (
          <div className="card" key={city} style={{ marginTop: 16 }}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>{city} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>({list.length} areas)</span></h3>
              <div className="row">
                <button className="btn sm" onClick={() => setOpen({ ...open, [city]: !isOpen })}>{isOpen ? 'Hide areas' : 'Show areas'}</button>
                <button className="btn sm danger" onClick={() => confirm(`Remove ${city} and all ${list.length} areas?`) && act(() => api(`/tenant/areas?city=${encodeURIComponent(city)}`, { method: 'DELETE', tenant: slug }), `${city} removed.`)}>Remove city</button>
              </div>
            </div>
            {isOpen && (
              <div className="table-wrap" style={{ marginTop: 10 }}><table className="tbl">
                <thead><tr><th>Area</th><th>Branch</th><th>Delivery fee</th><th>Min. order</th><th>Status</th><th /></tr></thead>
                <tbody>{list.map((a) => (
                  <tr key={a._id}><td><strong>{a.name}</strong></td><td className="muted">{a.branchId?.name || '—'}</td><td>{money(a.deliveryFee)}</td><td>{a.minOrder ? money(a.minOrder) : '—'}</td><td><Badge>{a.isActive ? 'active' : 'disabled'}</Badge></td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setEdit(a)}>Edit</button>
                      <button className="btn sm" onClick={() => act(() => api(`/tenant/areas/${a._id}`, { method: 'PUT', body: { isActive: !a.isActive }, tenant: slug }))}>{a.isActive ? 'Disable' : 'Enable'}</button>
                      <button className="btn sm danger" onClick={() => act(() => api(`/tenant/areas/${a._id}`, { method: 'DELETE', tenant: slug }))}>Delete</button>
                    </div></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        );
      })}
      {add && <AddModal slug={slug} branches={branches} cities={cities} onClose={() => setAdd(false)} onDone={(m) => { setAdd(false); setMsg(m); reload(); }} />}
      {edit && <EditModal area={edit} slug={slug} branches={branches} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </Protected>
  );
}

function Settings({ ordering, slug, onSaved }) {
  const [f, setF] = useState({ taxPercent: ordering.taxPercent ?? 0, taxInclusive: ordering.taxInclusive !== false, taxLabel: ordering.taxLabel || 'Tax', minOrder: ordering.minOrder ?? 0, etaMinutes: ordering.etaMinutes ?? 45 });
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); setErr('');
    try { await api('/tenant/ordering', { method: 'PUT', tenant: slug, body: { ...f, taxPercent: Number(f.taxPercent), minOrder: Number(f.minOrder), etaMinutes: Number(f.etaMinutes) } }); onSaved(); } catch (x) { setErr(x.message); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="card" onSubmit={save}>
      <h3>Ordering settings</h3>
      <Alert>{err}</Alert>
      <div className="grid3">
        <Field label="Tax (%)" type="number" min="0" max="50" step="0.5" value={f.taxPercent} onChange={set('taxPercent')} hint="0 = no tax line." />
        <Field label="Tax name" value={f.taxLabel} onChange={set('taxLabel')} hint="e.g. GST, Sales tax" />
        <Field label="Estimated delivery (minutes)" type="number" min="5" max="240" value={f.etaMinutes} onChange={set('etaMinutes')} />
      </div>
      <div className="grid2">
        <Field label="Minimum order for delivery (Rs.)" type="number" min="0" value={f.minOrder} onChange={set('minOrder')} hint="Applies to every area (an area can set a higher one)." />
        <Field label="Menu prices"><select value={f.taxInclusive ? 'in' : 'ex'} onChange={(e) => setF({ ...f, taxInclusive: e.target.value === 'in' })}><option value="in">Already include tax</option><option value="ex">Tax is added at checkout</option></select></Field>
      </div>
      <button className="btn primary">Save settings</button>
    </form>
  );
}

function AddModal({ slug, branches, cities, onClose, onDone }) {
  const [f, setF] = useState({ city: '', names: '', deliveryFee: 100, minOrder: 0, branchId: '' });
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); setErr('');
    const names = f.names.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    try {
      const d = await api('/tenant/areas/bulk', { method: 'POST', tenant: slug, body: { city: f.city.trim(), names, deliveryFee: Number(f.deliveryFee), minOrder: Number(f.minOrder), branchId: f.branchId || null } });
      onDone(`Added ${d.added} area(s)${d.skipped ? `, ${d.skipped} already existed` : ''}.`);
    } catch (x) { setErr(x.message); }
  }
  return (
    <Modal title="Add city / areas" onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="City" list="city-list" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} required autoFocus />
        <datalist id="city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        <Field label="Areas (one per line)"><textarea rows={6} value={f.names} onChange={(e) => setF({ ...f, names: e.target.value })} placeholder={'Clifton Block 5\nDHA Phase 8\nGulshan-e-Iqbal'} required /></Field>
        <div className="grid2">
          <Field label="Delivery fee (Rs.)" type="number" min="0" value={f.deliveryFee} onChange={(e) => setF({ ...f, deliveryFee: e.target.value })} />
          <Field label="Min. order (Rs.)" type="number" min="0" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} />
        </div>
        {branches.length > 0 && <Field label="Served by branch"><select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">Any branch</option>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>}
        <div className="row"><button className="btn primary">Add</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function EditModal({ area, slug, branches, onClose, onDone }) {
  const [f, setF] = useState({ name: area.name, deliveryFee: area.deliveryFee, minOrder: area.minOrder, branchId: area.branchId?._id || '' });
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault(); setErr('');
    try { await api(`/tenant/areas/${area._id}`, { method: 'PUT', tenant: slug, body: { city: area.city, name: f.name, deliveryFee: Number(f.deliveryFee), minOrder: Number(f.minOrder), branchId: f.branchId || null } }); onDone(); } catch (x) { setErr(x.message); }
  }
  return (
    <Modal title={`Edit ${area.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Area name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <div className="grid2">
          <Field label="Delivery fee (Rs.)" type="number" min="0" value={f.deliveryFee} onChange={(e) => setF({ ...f, deliveryFee: e.target.value })} />
          <Field label="Min. order (Rs.)" type="number" min="0" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} />
        </div>
        <Field label="Served by branch"><select value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}><option value="">Any branch</option>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>
        <div className="row"><button className="btn primary">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
