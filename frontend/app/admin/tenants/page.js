'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';

export default function Tenants() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [dir, setDir] = useState('desc');
  const [page, setPage] = useState(1);

  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const { data, error, loading } = useLoad(() => api(`/admin/tenants${qs({ q: dq, status, sort, dir, page, limit: 10 })}`), [dq, status, sort, dir, page]);

  const th = (key, label) => (
    <th className="sortable" onClick={() => { if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDir('asc'); } }}>
      {label}{sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <>
      <div className="page-head"><h1>Tenants</h1>{user.permissions.includes('tenant.create') && <Link className="btn primary" href="/admin/tenants/new">＋ Add new tenant</Link>}</div>
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <input placeholder="Search name, slug or owner email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} aria-label="Filter by status">
            <option value="">All (except deleted)</option><option value="active">Active</option><option value="draft">Draft</option><option value="suspended">Suspended</option><option value="deleted">Deleted</option>
          </select>
        </div>
        <Alert>{error}</Alert>
        {loading && !data ? <Loading /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>{th('name', 'Business')}{th('slug', 'Slug')}<th>Template</th><th>Owner</th>{th('status', 'Status')}{th('createdAt', 'Created')}<th /></tr></thead>
              <tbody>
                {data?.items.map((t) => (
                  <tr key={t._id}>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}>{t.branding?.logo ? <img className="logo-sm" src={t.branding.logo} alt="" /> : <div className="logo-sm" />}<Link href={`/admin/tenants/${t._id}`}><strong>{t.name}</strong></Link></div></td>
                    <td>/{t.slug}</td><td>{t.templateKey}</td><td>{t.owner?.email}</td><td><Badge>{t.status}</Badge></td><td className="muted">{fmtDate(t.createdAt)}</td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><Link className="btn sm" href={`/admin/tenants/${t._id}`}>Manage</Link>{t.status === 'active' && <a className="btn sm" href={`/${t.slug}`} target="_blank" rel="noopener noreferrer">Open site ↗</a>}</div></td>
                  </tr>
                ))}
                {data?.items.length === 0 && <tr><td colSpan={7} className="center muted">No tenants match.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </>
  );
}
