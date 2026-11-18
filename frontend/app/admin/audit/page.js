'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { Alert, Loading, Pager, useLoad } from '@/components/ui';

export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, error, loading } = useLoad(() => api(`/admin/audit${qs({ page, action, limit: 25 })}`), [page, action]);
  return (
    <>
      <div className="page-head"><h1>Audit log</h1>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} aria-label="Filter by action">
          <option value="">All actions</option>
          {['login', 'login.failed', 'tenant.create', 'tenant.suspend', 'tenant.activate', 'tenant.delete', 'role.change', 'site.publish', 'impersonate.start', 'impersonate.access', 'access.denied'].map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div className="card">
        <Alert>{error}</Alert>
        {loading && !data ? <Loading /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Time</th><th>Action</th><th>User</th><th>Tenant</th><th>IP</th><th>Details</th></tr></thead>
            <tbody>
              {data?.items.map((l) => (
                <tr key={l._id}><td className="muted">{fmtDate(l.createdAt)}</td><td><strong>{l.action}</strong></td><td>{l.userId ? `${l.userId.name}` : '—'}</td><td>{l.tenantId?.name || '—'}</td><td>{l.ip}</td>
                  <td className="muted" style={{ fontSize: 12, maxWidth: 280, wordBreak: 'break-word' }}>{l.details ? JSON.stringify(l.details) : ''}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </>
  );
}
