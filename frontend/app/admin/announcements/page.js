'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// Messages from the platform team. They appear as a banner at the top of every store owner's dashboard.
export default function Announcements() {
  const { user } = useAuth();
  const can = user.permissions.includes('announcements.manage');
  const { data, error, loading, reload } = useLoad(() => api('/admin/announcements'));
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  async function act(fn) { setErr(''); try { await fn(); reload(); } catch (e) { setErr(e.message); } }
  const live = (a) => a.isActive && (!a.startsAt || new Date(a.startsAt) <= new Date()) && (!a.endsAt || new Date(a.endsAt) >= new Date());
  return (
    <>
      <div className="page-head"><div><h1>Announcements</h1><p className="muted" style={{ margin: '4px 0 0' }}>Tell store owners about updates, maintenance or offers.</p></div>{can && <button className="btn primary" onClick={() => setEdit({})}>＋ New announcement</button>}</div>
      <Alert>{error || err}</Alert>
      {loading && !data ? <Loading /> : !data?.items.length ? <div className="card center muted">No announcements yet.</div> : data.items.map((a) => (
        <div className={`card ann-card ${a.level}`} key={a._id} style={{ marginBottom: 12, opacity: live(a) ? 1 : .6 }}>
          <div className="row between">
            <div className="row"><strong style={{ fontSize: 16 }}>{a.title}</strong><Badge>{live(a) ? 'live' : a.isActive ? 'scheduled / ended' : 'off'}</Badge><Badge>{a.audience === 'owners' ? 'owners only' : 'everyone'}</Badge></div>
            {can && <div className="row">
              <button className="btn sm" onClick={() => act(() => api(`/admin/announcements/${a._id}`, { method: 'PUT', body: { isActive: !a.isActive } }))}>{a.isActive ? 'Turn off' : 'Turn on'}</button>
              <button className="btn sm" onClick={() => setEdit(a)}>Edit</button>
              <button className="btn sm danger" onClick={() => confirm('Delete this announcement?') && act(() => api(`/admin/announcements/${a._id}`, { method: 'DELETE' }))}>Delete</button>
            </div>}
          </div>
          {a.body && <p style={{ margin: '8px 0 4px' }}>{a.body}</p>}
          <div className="muted" style={{ fontSize: 13 }}>{a.startsAt ? `From ${fmtDate(a.startsAt).split(',')[0]}` : 'Starts now'} · {a.endsAt ? `until ${fmtDate(a.endsAt).split(',')[0]}` : 'no end date'}</div>
        </div>
      ))}
      {edit && <Form a={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function Form({ a, onClose, onDone }) {
  const [f, setF] = useState({ title: a.title || '', body: a.body || '', level: a.level || 'info', audience: a.audience || 'all', startsAt: day(a.startsAt), endsAt: day(a.endsAt), isActive: a.isActive !== false });
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr(''); setFe({});
    const body = { ...f, startsAt: f.startsAt || null, endsAt: f.endsAt ? `${f.endsAt}T23:59:59` : null };
    try { await api(a._id ? `/admin/announcements/${a._id}` : '/admin/announcements', { method: a._id ? 'PUT' : 'POST', body }); onDone(); } catch (x) { setErr(x.message); setFe(x.errors || {}); }
  }
  return (
    <Modal title={a._id ? 'Edit announcement' : 'New announcement'} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Title" value={f.title} onChange={set('title')} error={fe.title} required autoFocus />
        <Field label="Message"><textarea rows={3} value={f.body} onChange={set('body')} /></Field>
        <div className="grid2">
          <Field label="Style"><select value={f.level} onChange={set('level')}><option value="info">Info</option><option value="success">Good news</option><option value="warning">Warning</option></select></Field>
          <Field label="Show to"><select value={f.audience} onChange={set('audience')}><option value="all">Everyone with a dashboard login</option><option value="owners">Store owners only</option></select></Field>
          <Field label="Start date" type="date" value={f.startsAt} onChange={set('startsAt')} hint="Empty = now" />
          <Field label="End date" type="date" value={f.endsAt} onChange={set('endsAt')} hint="Empty = until you turn it off" />
        </div>
        <label><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active</label>
        <div className="row" style={{ marginTop: 12 }}><button className="btn primary">Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
