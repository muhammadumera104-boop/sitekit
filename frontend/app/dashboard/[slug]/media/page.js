'use client';
import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Loading, useLoad } from '@/components/ui';

export default function MediaPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/media', { tenant: slug }), [slug]);
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toGallery, setToGallery] = useState(true);

  async function upload(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true); setErr('');
    for (const file of files) {
      try { const form = new FormData(); form.append('file', file); form.append('isGallery', String(toGallery)); await api('/tenant/media', { method: 'POST', form, tenant: slug }); } catch (x) { setErr(`${file.name}: ${x.message}`); }
    }
    setBusy(false); ref.current.value = ''; reload();
  }
  async function act(fn) { setErr(''); try { await fn(); reload(); } catch (x) { setErr(x.message); } }

  return (
    <Protected area="tenant" slug={slug} perm="content.manage">
      <div className="page-head"><h1>Media & gallery</h1>
        <div className="row">
          <label><input type="checkbox" checked={toGallery} onChange={(e) => setToGallery(e.target.checked)} /> Add to gallery</label>
          <button className="btn primary" disabled={busy} onClick={() => ref.current.click()}>{busy ? 'Uploading…' : '⬆ Upload images'}</button>
          <input ref={ref} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={upload} />
        </div>
      </div>
      <Alert>{error || err}</Alert>
      <p className="muted">Images up to 5 MB (JPG, PNG, WEBP, GIF). Images marked &ldquo;In gallery&rdquo; appear on your website gallery.</p>
      {loading && !data ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {data?.media.map((m) => (
            <div className="card" key={m._id} style={{ padding: 10, marginTop: 0 }}>
              <img src={m.url} alt={m.caption || ''} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} loading="lazy" />
              <div className="row between" style={{ marginTop: 8 }}>
                <label style={{ fontSize: 13 }}><input type="checkbox" checked={m.isGallery} onChange={(e) => act(() => api(`/tenant/media/${m._id}`, { method: 'PATCH', body: { isGallery: e.target.checked }, tenant: slug }))} /> In gallery</label>
                <button className="btn sm danger" onClick={() => confirm('Delete this image?') && act(() => api(`/tenant/media/${m._id}`, { method: 'DELETE', tenant: slug }))}>✕</button>
              </div>
              <button className="btn sm ghost" style={{ padding: 0 }} onClick={() => navigator.clipboard?.writeText(m.url.startsWith('/') ? location.origin + m.url : m.url)}>Copy URL</button>
            </div>
          ))}
          {data?.media.length === 0 && <p className="muted">No images yet.</p>}
        </div>
      )}
    </Protected>
  );
}
