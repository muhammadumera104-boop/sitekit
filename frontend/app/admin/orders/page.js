'use client';
import { Fragment, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, qs } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';
import { StoreCell, StoreSelect, downloadCsv, useSearch, useStores } from '@/components/admin/bits';

const STATUS = ['', 'new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];

// Orders from every website (read-only here; staff manage them inside each store dashboard).
function Orders() {
  const params = useSearchParams();
  const stores = useStores();
  const [store, setStore] = useState(params.get('store') || '');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [q, setQ, dq] = useSearch();
  const { data, error, loading } = useLoad(() => api(`/admin/orders${qs({ tenantId: store, status, source, q: dq, page, limit: 20 })}`), [store, status, source, dq, page]);
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  return (
    <>
      <div className="page-head">
        <div><h1>Orders</h1><p className="muted" style={{ margin: '4px 0 0' }}>{data ? `${data.total} orders · ${money(data.revenue)} revenue (cancelled excluded)` : 'All websites'}</p></div>
        <button className="btn" disabled={!data} onClick={() => downloadCsv('orders', [['Order', 'Website', 'Customer', 'Phone', 'Total', 'Status', 'Payment', 'Source', 'Date'], ...data.items.map((o) => [o.number, o.store?.name, o.customer?.name, o.customer?.phone, o.total, o.status, `${o.paymentMethod}/${o.paymentStatus}`, o.source, o.createdAt])])}>⬇ Export CSV</button>
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <input className="search" placeholder="Search order #, customer or phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search orders" />
        <StoreSelect stores={stores.data?.stores} value={store} onChange={reset(setStore)} />
        <select className="select-sm" value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Status">{STATUS.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>)}</select>
        <select className="select-sm" value={source} onChange={(e) => reset(setSource)(e.target.value)} aria-label="Source"><option value="">All sources</option><option value="online">Online</option><option value="pos">Point of sale</option></select>
      </div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No orders match.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Order</th><th>Website</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Placed</th><th /></tr></thead>
            <tbody>{data.items.map((o) => (
              <Fragment key={o._id}>
                <tr>
                  <td><strong>#{o.number}</strong><div className="muted" style={{ fontSize: 12 }}>{o.source === 'pos' ? 'POS' : o.orderType}</div></td>
                  <td><StoreCell s={o.store} /></td>
                  <td>{o.customer?.name || <span className="muted">Walk-in</span>}<div className="muted" style={{ fontSize: 12 }}>{o.customer?.phone}</div></td>
                  <td><strong>{money(o.total)}</strong></td>
                  <td><Badge>{o.paymentStatus === 'pending' ? 'verify' : o.paymentStatus}</Badge><div className="muted" style={{ fontSize: 12 }}>{o.paymentMethod}</div></td>
                  <td><Badge>{String(o.status).replace(/_/g, ' ')}</Badge></td>
                  <td className="muted" style={{ fontSize: 13 }}>{fmtDate(o.createdAt)}</td>
                  <td><button className="btn sm" onClick={() => setOpen(open === o._id ? null : o._id)}>{open === o._id ? 'Hide' : 'Details'}</button></td>
                </tr>
                {open === o._id && (
                  <tr><td colSpan={8} style={{ background: 'color-mix(in srgb, var(--line) 35%, transparent)' }}>
                    {o.items.map((i, k) => <div className="row between" key={k}><span>{i.qty} × {i.name}{i.options?.length > 0 && <span className="muted"> ({i.options.map((x) => x.name).join(', ')})</span>}</span><span>{money(i.unitPrice * i.qty)}</span></div>)}
                    <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                      {o.promoDiscount > 0 && `Promo ${o.promoCode} −${money(o.promoDiscount)} · `}{o.tax > 0 && `Tax ${money(o.tax)} · `}{o.deliveryFee > 0 && `Delivery ${money(o.deliveryFee)} · `}Total {money(o.total)}
                    </div>
                    {o.customer?.address && <p style={{ margin: '6px 0 0' }}><strong>Deliver to:</strong> {o.customer.address}{o.area ? `, ${o.area}` : ''}{o.city ? `, ${o.city}` : ''}</p>}
                    {o.paymentRef && <p style={{ margin: '4px 0 0' }}><strong>Payment ref:</strong> {o.paymentRef}</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </>
  );
}

export default function OrdersPage() { return <Suspense fallback={<Loading />}><Orders /></Suspense>; }
