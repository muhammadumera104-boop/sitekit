'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Loading, useLoad } from '@/components/ui';
import { Stars } from '@/components/site/StoreCatalog';

// Customer ratings after delivery: reply publicly, or hide a review from the website.
export default function ReviewsPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/reviews', { tenant: slug }), [slug]);
  const [reply, setReply] = useState({});
  const [err, setErr] = useState('');
  async function patch(r, body) { setErr(''); try { await api(`/tenant/reviews/${r._id}`, { method: 'PATCH', body, tenant: slug }); await reload(); } catch (e) { setErr(e.message); } }
  return (
    <Protected area="tenant" slug={slug} perm="reviews.manage">
      <div className="page-head"><h1>Reviews</h1></div>
      <Alert>{error || err}</Alert>
      {data && (
        <div className="stats">
          <div className="stat"><div className="n">{data.avg || '—'} <span style={{ fontSize: 16 }}>★</span></div><div className="l">Average rating</div></div>
          <div className="stat"><div className="n">{data.count}</div><div className="l">Total reviews</div></div>
        </div>
      )}
      {loading && !data ? <Loading /> : !data?.items.length ? <div className="card center muted">No reviews yet. Customers can rate an order once it is delivered.</div> : (
        data.items.map((r) => (
          <div className="card" key={r._id} style={{ marginBottom: 12, opacity: r.isPublished ? 1 : .6 }}>
            <div className="row between">
              <div><Stars value={r.rating} /> <strong style={{ marginLeft: 8 }}>{r.name}</strong> <span className="muted">· order #{r.orderNumber} · {fmtDate(r.createdAt)}</span></div>
              <div className="row">{!r.isPublished && <Badge>hidden</Badge>}<button className="btn sm" onClick={() => patch(r, { isPublished: !r.isPublished })}>{r.isPublished ? 'Hide from website' : 'Show on website'}</button></div>
            </div>
            {r.comment && <p style={{ margin: '10px 0' }}>“{r.comment}”</p>}
            {r.reply ? <div className="muted" style={{ fontSize: 14 }}>↪ Your reply: {r.reply}</div> : null}
            <div className="row" style={{ marginTop: 8 }}>
              <input className="select-sm" style={{ flex: 1, minWidth: 200 }} placeholder={r.reply ? 'Edit your reply…' : 'Write a public reply…'} value={reply[r._id] ?? ''} onChange={(e) => setReply({ ...reply, [r._id]: e.target.value })} aria-label="Reply" />
              <button className="btn sm" disabled={!(reply[r._id] || '').trim()} onClick={async () => { await patch(r, { reply: reply[r._id] }); setReply({ ...reply, [r._id]: '' }); }}>Reply</button>
            </div>
          </div>
        ))
      )}
    </Protected>
  );
}
