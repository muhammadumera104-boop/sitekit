'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { Alert, Loading, Pager, useLoad } from '@/components/ui';
import { StoreCell, StoreSelect, downloadCsv, useSearch, useStores } from '@/components/admin/bits';

// Customers who created an account on any website.
export default function Customers() {
  const stores = useStores();
  const [store, setStore] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ, dq] = useSearch();
  const { data, error, loading } = useLoad(() => api(`/admin/customers${qs({ tenantId: store, q: dq, page, limit: 20 })}`), [store, dq, page]);
  return (
    <>
      <div className="page-head">
        <div><h1>Customers</h1><p className="muted" style={{ margin: '4px 0 0' }}>{data ? `${data.total} customer account${data.total === 1 ? '' : 's'}` : 'All websites'}</p></div>
        <button className="btn" disabled={!data} onClick={() => downloadCsv('customers', [['Name', 'Website', 'Phone', 'Email', 'Orders', 'Spent', 'Joined'], ...data.items.map((c) => [c.name, c.store?.name, c.phone, c.email, c.orders, c.spent, c.createdAt])])}>⬇ Export CSV</button>
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <input className="search" placeholder="Search name, phone or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search customers" />
        <StoreSelect stores={stores.data?.stores} value={store} onChange={(v) => { setStore(v); setPage(1); }} />
      </div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No customer accounts yet.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Customer</th><th>Website</th><th>Mobile</th><th>Email</th><th>Orders</th><th>Spent</th><th>Joined</th><th>Last login</th></tr></thead>
            <tbody>{data.items.map((c) => (
              <tr key={c._id}><td><strong>{c.name}</strong></td><td><StoreCell s={c.store} /></td><td>{c.phone}</td><td className="muted">{c.email || '—'}</td><td>{c.orders}</td><td>{money(c.spent)}</td><td className="muted">{fmtDate(c.createdAt)}</td><td className="muted">{fmtDate(c.lastLogin)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </>
  );
}
