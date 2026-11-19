'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { Alert, Loading, Pager, useLoad } from '@/components/ui';
import { StoreSelect, downloadCsv, useSearch, useStores } from '@/components/admin/bits';

// Activity logs: who did what, where and when, across the whole platform.
export default function Activity() {
  const stores = useStores();
  const [store, setStore] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ, dq] = useSearch();
  const { data, error, loading } = useLoad(() => api(`/admin/audit${qs({ page, q: dq, tenantId: store, from, to, limit: 25 })}`), [page, dq, store, from, to]);
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  return (
    <>
      <div className="page-head">
        <div><h1>Activity logs</h1><p className="muted" style={{ margin: '4px 0 0' }}>{data ? `${data.total.toLocaleString()} events` : 'Logins, changes, payouts and access attempts.'}</p></div>
        <button className="btn" disabled={!data} onClick={() => downloadCsv('activity-log', [['Time', 'Action', 'User', 'Role', 'Website', 'IP', 'Details'], ...data.items.map((l) => [l.createdAt, l.action, l.userId?.name, l.userId?.role, l.tenantId?.name, l.ip, l.details ? JSON.stringify(l.details) : ''])])}>⬇ Export CSV</button>
      </div>
      <Alert>{error}</Alert>
      <div className="toolbar">
        <input className="search" placeholder="Search an action (login, payout, tenant…)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search activity" />
        <StoreSelect stores={stores.data?.stores} value={store} onChange={reset(setStore)} />
        <label className="muted sm">From <input type="date" className="select-sm" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
        <label className="muted sm">To <input type="date" className="select-sm" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
      </div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No activity matches.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Time</th><th>Action</th><th>User</th><th>Website</th><th>IP</th><th>Details</th></tr></thead>
            <tbody>{data.items.map((l) => (
              <tr key={l._id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.createdAt)}</td><td><strong>{l.action}</strong></td>
                <td>{l.userId ? <>{l.userId.name}<div className="muted" style={{ fontSize: 12 }}>{String(l.userId.role).replace(/_/g, ' ')}</div></> : '—'}</td>
                <td>{l.tenantId?.name || '—'}</td><td className="muted">{l.ip}</td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 300, wordBreak: 'break-word' }}>{l.details ? JSON.stringify(l.details) : ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </>
  );
}
