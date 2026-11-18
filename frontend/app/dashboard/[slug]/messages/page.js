'use client';
import { useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';

export default function Messages() {
  const { slug } = useTenant();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useLoad(() => api(`/tenant/messages${qs({ status, page, limit: 15 })}`, { tenant: slug }), [slug, status, page]);
  const [err, setErr] = useState('');
  async function mark(m, s) { setErr(''); try { await api(`/tenant/messages/${m._id}`, { method: 'PATCH', body: { status: s }, tenant: slug }); reload(); } catch (e) { setErr(e.message); } }
  return (
    <Protected area="tenant" slug={slug} perm="messages.manage">
      <div className="page-head"><h1>Messages {data?.unread > 0 && <Badge>{`${data.unread} new`}</Badge>}</h1>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8 }} aria-label="Filter">
          <option value="">Inbox</option><option value="new">Unread</option><option value="read">Read</option><option value="archived">Archived</option>
        </select>
      </div>
      <Alert>{error || err}</Alert>
      {loading && !data ? <Loading /> : (
        <>
          {data?.items.map((m) => (
            <div className="card" key={m._id} style={{ borderLeft: m.status === 'new' ? '4px solid var(--brand)' : undefined }}>
              <div className="row between"><div><strong>{m.name}</strong> <Badge>{m.status}</Badge>{m.type === 'complaint' && <span className="badge cancelled" style={{ marginLeft: 6 }}>complaint{m.orderNumber ? ` · #${m.orderNumber}` : ''}</span>}<div className="muted" style={{ fontSize: 13 }}>{[m.email, m.phone].filter(Boolean).join(' · ')} · {fmtDate(m.createdAt)}</div></div>
                <div className="row">
                  {m.status !== 'read' && <button className="btn sm" onClick={() => mark(m, 'read')}>Mark read</button>}
                  {m.status !== 'new' && <button className="btn sm" onClick={() => mark(m, 'new')}>Mark unread</button>}
                  {m.status !== 'archived' && <button className="btn sm" onClick={() => mark(m, 'archived')}>Archive</button>}
                </div></div>
              <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{m.message}</p>
            </div>
          ))}
          {data?.items.length === 0 && <div className="card center muted">No messages.</div>}
          {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
        </>
      )}
    </Protected>
  );
}
