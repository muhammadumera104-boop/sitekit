'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Field, ImageField, Loading, Modal, useLoad } from '@/components/ui';

export default function PagesPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/pages', { tenant: slug }), [slug]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  async function act(fn) { setErr(''); try { await fn(); await reload(); } catch (e) { setErr(e.message); } }
  const swap = async (a, b) => { await api(`/tenant/pages/${a._id}`, { method: 'PUT', body: { order: b.order }, tenant: slug }); await api(`/tenant/pages/${b._id}`, { method: 'PUT', body: { order: a.order }, tenant: slug }); };
  if (loading && !data) return <Loading />;
  const pages = data?.pages || [];
  return (
    <Protected area="tenant" slug={slug} perm="content.manage">
      <div className="page-head"><h1>Pages</h1><button className="btn primary" onClick={() => setEdit({ sections: [{ type: 'text', heading: '', body: '' }], isPublished: true, showInNav: true })}>＋ New page</button></div>
      <Alert>{error || err}</Alert>
      <p className="muted">Custom pages appear in your site navigation at <code>/{slug}/page-slug</code>. Home, menu, gallery and contact are built in.</p>
      <div className="card">
        <table className="tbl"><tbody>
          {pages.map((p, i) => (
            <tr key={p._id}>
              <td><strong>{p.title}</strong><div className="muted" style={{ fontSize: 12 }}>/{slug}/{p.slug}</div></td>
              <td><Badge>{p.isPublished ? 'active' : 'draft'}</Badge></td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn sm" disabled={i === 0} onClick={() => act(() => swap(p, pages[i - 1]))} aria-label="Move up">↑</button>
                <button className="btn sm" disabled={i === pages.length - 1} onClick={() => act(() => swap(p, pages[i + 1]))} aria-label="Move down">↓</button>
                <button className="btn sm" onClick={() => setEdit(p)}>Edit</button>
                <button className="btn sm danger" onClick={() => confirm(`Delete page "${p.title}"?`) && act(() => api(`/tenant/pages/${p._id}`, { method: 'DELETE', tenant: slug }))}>Delete</button>
              </div></td>
            </tr>
          ))}
          {!pages.length && <tr><td className="muted center">No custom pages yet.</td></tr>}
        </tbody></table>
      </div>
      {edit && <PageModal page={edit} slug={slug} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </Protected>
  );
}

function PageModal({ page, slug, onClose, onSaved }) {
  const [f, setF] = useState({ title: page.title || '', slug: page.slug || '', isPublished: page.isPublished ?? true, showInNav: page.showInNav ?? true, sections: page.sections?.map((s) => ({ type: s.type || 'text', heading: s.heading || '', body: s.body || '', image: s.image || '' })) || [] });
  const [err, setErr] = useState('');
  const setSec = (i, k, v) => setF((s) => ({ ...s, sections: s.sections.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
  async function save(e) {
    e.preventDefault(); setErr('');
    try { await api(page._id ? `/tenant/pages/${page._id}` : '/tenant/pages', { method: page._id ? 'PUT' : 'POST', body: f, tenant: slug }); onSaved(); } catch (x) { setErr(x.message); }
  }
  return (
    <Modal title={page._id ? 'Edit page' : 'New page'} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <Field label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        <Field label="URL slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} hint="Leave empty to generate from the title." />
        <h4>Sections</h4>
        {f.sections.map((s, i) => (
          <div className="card" key={i} style={{ background: '#fafafa', padding: 12 }}>
            <Field label="Heading" value={s.heading} onChange={(e) => setSec(i, 'heading', e.target.value)} />
            <Field label="Text"><textarea rows={4} value={s.body} onChange={(e) => setSec(i, 'body', e.target.value)} /></Field>
            <ImageField label="Image" value={s.image} onChange={(v) => setSec(i, 'image', v)} uploadPath="/tenant/media" tenant={slug} />
            <button type="button" className="btn sm danger" onClick={() => setF({ ...f, sections: f.sections.filter((_, j) => j !== i) })}>Remove section</button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => setF({ ...f, sections: [...f.sections, { type: 'text', heading: '', body: '', image: '' }] })}>＋ Add section</button>
        <div className="row" style={{ margin: '14px 0' }}>
          <label><input type="checkbox" checked={f.isPublished} onChange={(e) => setF({ ...f, isPublished: e.target.checked })} /> Published</label>
          <label><input type="checkbox" checked={f.showInNav} onChange={(e) => setF({ ...f, showInNav: e.target.checked })} /> Show in navigation</label>
        </div>
        <div className="row"><button className="btn primary">Save page</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
