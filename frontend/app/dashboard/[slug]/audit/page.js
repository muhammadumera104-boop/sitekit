'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Loading, Pager, useLoad } from '@/components/ui';

export default function TenantAudit() {
  const { slug } = useTenant();
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => api(`/tenant/audit${qs({ page, limit: 25 })}`, { tenant: slug }), [slug, page]);
  return (
    <Protected area="tenant" slug={slug} perm="audit.view">
      <div className="page-head"><h1>Audit log</h1></div>
      <div className="card">
        <Alert>{error}</Alert>
        {loading && !data ? <Loading /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Time</th><th>Action</th><th>User</th><th>IP</th></tr></thead>
            <tbody>{data?.items.map((l) => <tr key={l._id}><td className="muted">{fmtDate(l.createdAt)}</td><td><strong>{l.action}</strong></td><td>{l.userId?.name || '—'}</td><td>{l.ip}</td></tr>)}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </Protected>
  );
}
