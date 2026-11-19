'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, qs } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';
import { StoreCell, StoreSelect, useStores } from '@/components/admin/bits';

const METHODS = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank: 'Bank transfer', card: 'Card', online: 'Online' };

// Online / manual payments from every website: check the transaction ID, then confirm or reject the payment.
function Payments() {
  const params = useSearchParams();
  const { user } = useAuth();
  const can = user.permissions.includes('catalog.moderate');
  const stores = useStores();
  const [store, setStore] = useState('');
  const [status, setStatus] = useState(params.get('status') || '');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const { data, error, loading, reload } = useLoad(() => api(`/admin/payments${qs({ tenantId: store, status, method, page, limit: 15 })}`), [store, status, method, page]);
  const sum = (s) => data?.byStatus.find((x) => x._id === s) || { n: 0, amount: 0 };

  async function set(o, paymentStatus) {
    setErr('');
    try { await api(`/admin/payments/${o._id}`, { method: 'PATCH', body: { paymentStatus } }); reload(); } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <div className="page-head"><div><h1>Payments</h1><p className="muted" style={{ margin: '4px 0 0' }}>JazzCash, Easypaisa and bank payments across all websites. Cash on delivery is not listed.</p></div></div>
      <Alert>{error || err}</Alert>
      <div className="sum-cards">
        {[['paid', 'Received', '✅'], ['pending', 'Waiting to verify', '⏳'], ['failed', 'Rejected', '⛔']].map(([k, l, ic]) => (
          <button key={k} className={`stat stat-link ${status === k ? 'sel' : ''}`} onClick={() => { setStatus(status === k ? '' : k); setPage(1); }} style={{ textAlign: 'left', cursor: 'pointer' }}>
            <div className="ic">{ic}</div><div className="n" style={{ fontSize: 22 }}>{money(sum(k).amount)}</div><div className="l">{l} · {sum(k).n} orders</div>
          </button>
        ))}
        {data?.byMethod.map((m) => <div className="stat" key={m._id}><div className="n" style={{ fontSize: 22 }}>{money(m.amount)}</div><div className="l">{METHODS[m._id] || m._id} · {m.n}</div></div>)}
      </div>
      <div className="toolbar">
        <StoreSelect stores={stores.data?.stores} value={store} onChange={(v) => { setStore(v); setPage(1); }} />
        <select className="select-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Payment status"><option value="">All statuses</option><option value="pending">Waiting to verify</option><option value="paid">Received</option><option value="failed">Rejected</option><option value="unpaid">Unpaid</option></select>
        <select className="select-sm" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} aria-label="Method"><option value="">All online methods</option>{['jazzcash', 'easypaisa', 'bank'].map((m) => <option key={m} value={m}>{METHODS[m]}</option>)}</select>
      </div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No online payments found.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Order</th><th>Website</th><th>Customer</th><th>Amount</th><th>Method</th><th>Transaction ID</th><th>Status</th><th>Date</th><th /></tr></thead>
            <tbody>{data.items.map((o) => (
              <tr key={o._id}>
                <td><strong>#{o.number}</strong></td><td><StoreCell s={o.store} /></td>
                <td>{o.customer?.name}<div className="muted" style={{ fontSize: 12 }}>{o.customer?.phone}</div></td>
                <td><strong>{money(o.total)}</strong></td>
                <td>{METHODS[o.paymentMethod] || o.paymentMethod}{o.paymentSender && <div className="muted" style={{ fontSize: 12 }}>from {o.paymentSender}</div>}</td>
                <td><code className="code-chip">{o.paymentRef || '—'}</code></td>
                <td><Badge>{o.paymentStatus === 'pending' ? 'verify' : o.paymentStatus}</Badge></td>
                <td className="muted" style={{ fontSize: 13 }}>{fmtDate(o.createdAt)}</td>
                <td>{can && <div className="row" style={{ flexWrap: 'nowrap' }}>
                  {o.paymentStatus !== 'paid' && <button className="btn sm primary" onClick={() => set(o, 'paid')}>✓ Received</button>}
                  {o.paymentStatus === 'pending' && <button className="btn sm danger" onClick={() => confirm(`Reject the payment for #${o.number}?`) && set(o, 'failed')}>Reject</button>}
                  {o.paymentStatus === 'paid' && <button className="btn sm" onClick={() => set(o, 'pending')}>Undo</button>}
                </div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </>
  );
}

export default function PaymentsPage() { return <Suspense fallback={<Loading />}><Payments /></Suspense>; }
