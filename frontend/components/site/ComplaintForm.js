'use client';
import { useState } from 'react';

export default function ComplaintForm({ slug, preview }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', orderNumber: '', message: '' });
  const [st, setSt] = useState({ busy: false, ok: '', error: '', errors: {} });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (preview) return setSt({ busy: false, ok: 'Preview mode — complaints are not sent.', error: '', errors: {} });
    setSt({ busy: true, ok: '', error: '', errors: {} });
    try {
      const r = await fetch(`/api/public/tenants/${slug}/complaints`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const d = await r.json();
      if (!r.ok) return setSt({ busy: false, ok: '', error: d.message, errors: d.errors || {} });
      setF({ name: '', phone: '', email: '', orderNumber: '', message: '' });
      setSt({ busy: false, ok: d.message, error: '', errors: {} });
    } catch { setSt({ busy: false, ok: '', error: 'Could not send. Please try again.', errors: {} }); }
  }
  const E = ({ k }) => (st.errors[k] ? <span className="err">{st.errors[k]}</span> : null);
  return (
    <form onSubmit={submit} noValidate className="box" style={{ maxWidth: 620, margin: '0 auto' }}>
      {st.ok && <div className="alert success">{st.ok}</div>}
      {st.error && !Object.keys(st.errors).length && <div className="alert error">{st.error}</div>}
      <div className="grid2">
        <div className="field"><label>Name *</label><input value={f.name} onChange={set('name')} required /><E k="name" /></div>
        <div className="field"><label>Mobile number *</label><input value={f.phone} onChange={set('phone')} inputMode="tel" required /><E k="phone" /></div>
        <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set('email')} /><E k="email" /></div>
        <div className="field"><label>Order number (if any)</label><input value={f.orderNumber} onChange={set('orderNumber')} /></div>
      </div>
      <div className="field"><label>What went wrong? *</label><textarea rows={5} value={f.message} onChange={set('message')} required /><E k="message" /></div>
      <button className="cta" disabled={st.busy}>{st.busy ? 'Sending…' : 'Submit complaint'}</button>
    </form>
  );
}
