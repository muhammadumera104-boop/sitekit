'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';
import { Stars, StoreCell, StoreSelect, useStores } from '@/components/admin/bits';

// Moderate reviews from every website: hide anything abusive from the public site.
export default function Reviews() {
  const { user } = useAuth();
  const canModerate = user.permissions.includes('catalog.moderate');
  const stores = useStores();
  const [store, setStore] = useState('');
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const { data, error, loading, reload } = useLoad(() => api(`/admin/reviews${qs({ tenantId: store, rating, page, limit: 15 })}`), [store, rating, page]);
  async function toggle(r) { setErr(''); try { await api(`/admin/reviews/${r._id}`, { method: 'PATCH', body: { isPublished: !r.isPublished } }); reload(); } catch (e) { setErr(e.message); } }
  return (
    <>
      <div className="page-head">
        <div><h1>Reviews</h1><p className="muted" style={{ margin: '4px 0 0' }}>{data ? `${data.total} reviews · average ${data.avg || '—'} ★` : 'All websites'}</p></div>
      </div>
      <Alert>{error || err}</Alert>
      <div className="toolbar">
        <StoreSelect stores={stores.data?.stores} value={store} onChange={(v) => { setStore(v); setPage(1); }} />
        <select className="select-sm" value={rating} onChange={(e) => { setRating(e.target.value); setPage(1); }} aria-label="Rating"><option value="">All ratings</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select>
      </div>
      {loading && !data ? <Loading /> : !data?.items.length ? <div className="card center muted">No reviews yet.</div> : data.items.map((r) => (
        <div className="card" key={r._id} style={{ marginBottom: 12, opacity: r.isPublished ? 1 : .6 }}>
          <div className="row between">
            <div className="row"><Stars n={r.rating} /><strong>{r.name}</strong><span className="muted">· order #{r.orderNumber} · {fmtDate(r.createdAt)}</span></div>
            <div className="row">{!r.isPublished && <Badge>hidden</Badge>}<StoreCell s={r.store} />{canModerate && <button className="btn sm" onClick={() => toggle(r)}>{r.isPublished ? 'Hide' : 'Show'}</button>}</div>
          </div>
          {r.comment && <p style={{ margin: '10px 0 0' }}>“{r.comment}”</p>}
          {r.reply && <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>↪ Store reply: {r.reply}</div>}
        </div>
      ))}
      {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
    </>
  );
}
