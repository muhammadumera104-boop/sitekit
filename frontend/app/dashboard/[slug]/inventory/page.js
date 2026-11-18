'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Loading, useLoad } from '@/components/ui';

// Stock levels. "Not tracked" items (blank stock) are never limited; tracked items are blocked from overselling.
export default function InventoryPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/inventory', { tenant: slug }), [slug]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function send(item, body) {
    setErr(''); setMsg('');
    try { await api(`/tenant/inventory/${item._id}`, { method: 'PATCH', body, tenant: slug }); setEdit((e) => { const n = { ...e }; delete n[item._id]; return n; }); setMsg(`${item.name} updated.`); await reload(); } catch (e) { setErr(e.message); }
  }
  const items = (data?.items || []).filter((i) => !q || `${i.name} ${i.category}`.toLowerCase().includes(q.toLowerCase()));
  const low = (data?.items || []).filter((i) => i.stock !== null && i.stock <= 5).length;

  return (
    <Protected area="tenant" slug={slug} perm="inventory.manage">
      <div className="page-head"><h1>Inventory</h1>
        <input className="select-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inventory" />
      </div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      {low > 0 && <Alert type="info">{low} item(s) are low or out of stock.</Alert>}
      <div className="card">
        {loading && !data ? <Loading /> : !items.length ? <p className="muted center">No products found.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th /><th>Product</th><th>Stock</th><th>Set stock</th><th>Quick adjust</th></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i._id}>
                <td style={{ width: 70 }}>{i.image ? <img className="thumb" src={i.image} alt="" /> : <div className="thumb" />}</td>
                <td><strong>{i.name}</strong><div className="muted" style={{ fontSize: 12 }}>{i.category}</div></td>
                <td>{i.stock === null ? <Badge>not tracked</Badge> : i.stock === 0 ? <span className="sold">Sold out</span> : <strong className={i.stock <= 5 ? 'low' : ''}>{i.stock}</strong>}</td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input type="number" min="0" step="1" className="select-sm" style={{ width: 90 }} placeholder={i.stock === null ? 'qty' : String(i.stock)} value={edit[i._id] ?? ''} onChange={(e) => setEdit({ ...edit, [i._id]: e.target.value })} aria-label={`New stock for ${i.name}`} />
                  <button className="btn sm" disabled={edit[i._id] === undefined || edit[i._id] === ''} onClick={() => send(i, { stock: Number(edit[i._id]) })}>Save</button>
                  {i.stock !== null && <button className="btn sm" onClick={() => confirm(`Stop tracking stock for ${i.name}?`) && send(i, { stock: null })}>Untrack</button>}
                </div></td>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                  {[-1, 1, 10].map((n) => <button key={n} className="btn sm" disabled={i.stock === null || (n < 0 && i.stock <= 0)} onClick={() => send(i, { adjust: n })}>{n > 0 ? `+${n}` : n}</button>)}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </Protected>
  );
}
