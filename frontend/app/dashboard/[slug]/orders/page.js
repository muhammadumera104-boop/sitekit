'use client';
import { Fragment, useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';

const TABS = ['all', 'new', 'confirmed', 'preparing', 'completed', 'cancelled'];
// What the next step of an order is, so staff can move it along with one click.
const NEXT = { new: ['confirmed', 'Confirm'], confirmed: ['preparing', 'Start preparing'], preparing: ['completed', 'Mark completed'] };

export default function OrdersPage() {
  const { slug } = useTenant();
  const { user } = useAuth();
  const canManage = user.permissions.includes('orders.manage');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  const { data, error, loading, reload } = useLoad(() => api(`/tenant/orders${qs({ status: status === 'all' ? '' : status, source, page })}`, { tenant: slug }), [slug, status, source, page]);

  async function patch(o, body) {
    setErr('');
    try { await api(`/tenant/orders/${o._id}`, { method: 'PATCH', body, tenant: slug }); await reload(); } catch (e) { setErr(e.message); }
  }
  const counts = data?.counts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Protected area="tenant" slug={slug} perm="orders.view">
      <div className="page-head"><h1>Orders</h1>
        <div className="row">
          <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} aria-label="Order source" className="select-sm">
            <option value="">All sources</option><option value="online">Online</option><option value="pos">Point of sale</option>
          </select>
          <button className="btn" onClick={reload}>Refresh</button>
        </div>
      </div>
      <Alert>{error || err}</Alert>
      <div className="row" style={{ marginBottom: 14 }}>
        {TABS.map((t) => <button key={t} className={`tab ${status === t ? 'on' : ''}`} onClick={() => { setStatus(t); setPage(1); }}>{t === 'all' ? 'All' : t} <span className="muted">({t === 'all' ? all : counts[t] || 0})</span></button>)}
      </div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No orders yet.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Order</th><th>When</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th /></tr></thead>
            <tbody>{data.items.map((o) => (
              <Fragment key={o._id}>
                <tr>
                  <td><strong>#{o.number}</strong><div className="muted" style={{ fontSize: 12 }}>{o.source === 'pos' ? `POS${o.branchId?.name ? ` · ${o.branchId.name}` : ''}` : 'Online'}</div></td>
                  <td className="muted">{fmtDate(o.createdAt)}</td>
                  <td>{o.customer?.name || <span className="muted">Walk-in</span>}<div className="muted" style={{ fontSize: 12 }}>{o.customer?.phone}</div></td>
                  <td><strong>{money(o.total)}</strong>{o.discount > 0 && <div className="muted" style={{ fontSize: 12 }}>saved {money(o.discount)}</div>}</td>
                  <td><Badge>{o.paymentStatus}</Badge><div className="muted" style={{ fontSize: 12 }}>{o.paymentMethod}</div></td>
                  <td><Badge>{o.status}</Badge></td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setOpen(open === o._id ? null : o._id)}>{open === o._id ? 'Hide' : 'Details'}</button>
                    {canManage && NEXT[o.status] && <button className="btn sm primary" onClick={() => patch(o, { status: NEXT[o.status][0] })}>{NEXT[o.status][1]}</button>}
                    {canManage && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' && <button className="btn sm" onClick={() => patch(o, { paymentStatus: 'paid' })}>Mark paid</button>}
                    {canManage && !['completed', 'cancelled'].includes(o.status) && <button className="btn sm danger" onClick={() => confirm(`Cancel order #${o.number}? Stock will be returned.`) && patch(o, { status: 'cancelled' })}>Cancel</button>}
                  </div></td>
                </tr>
                {open === o._id && (
                  <tr><td colSpan={7} style={{ background: 'color-mix(in srgb, var(--line) 35%, transparent)' }}>
                    {o.items.map((i, k) => <div key={k} className="row between"><span>{i.qty} × {i.name}{i.discountPercent > 0 && <span className="muted"> ({i.discountPercent}% off)</span>}</span><span>{money(i.unitPrice * i.qty)}</span></div>)}
                    {o.customer?.address && <p style={{ margin: '8px 0 0' }}><strong>Deliver to:</strong> {o.customer.address}</p>}
                    {o.customer?.note && <p style={{ margin: '4px 0 0' }}><strong>Note:</strong> {o.customer.note}</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
        <Pager page={data?.page} pages={data?.pages} onPage={setPage} />
      </div>
    </Protected>
  );
}
