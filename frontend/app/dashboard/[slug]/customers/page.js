'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Loading, Pager, useLoad } from '@/components/ui';

// People who created an account on the website.
export default function CustomersPage() {
  const { slug } = useTenant();
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(() => api(`/tenant/customers${qs({ page })}`, { tenant: slug }), [slug, page]);
  return (
    <Protected area="tenant" slug={slug} perm="customers.view">
      <div className="page-head"><h1>Customers</h1></div>
      <Alert>{error}</Alert>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No customer accounts yet. They appear here when someone signs up on your website.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Orders</th><th>Spent</th><th>Addresses</th><th>Joined</th></tr></thead>
            <tbody>{data.items.map((c) => (
              <tr key={c._id}><td><strong>{c.name}</strong></td><td>{c.phone}</td><td className="muted">{c.email || '—'}</td><td>{c.orders}</td><td>{money(c.spent)}</td><td>{c.addresses}</td><td className="muted">{fmtDate(c.createdAt)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        <Pager page={data?.page} pages={data?.pages} onPage={setPage} />
      </div>
    </Protected>
  );
}
