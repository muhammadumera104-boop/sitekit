'use client';
import { useState } from 'react';

export default function ContactForm({ slug, preview }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [state, setState] = useState({ busy: false, ok: '', error: '', errors: {} });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (preview) return setState({ busy: false, ok: 'Preview mode — messages are not sent.', error: '', errors: {} });
    setState({ busy: true, ok: '', error: '', errors: {} });
    try {
      const r = await fetch(`/api/public/tenants/${slug}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const d = await r.json();
      if (!r.ok) return setState({ busy: false, ok: '', error: d.message, errors: d.errors || {} });
      setF({ name: '', email: '', phone: '', message: '' });
      setState({ busy: false, ok: d.message, error: '', errors: {} });
    } catch { setState({ busy: false, ok: '', error: 'Could not send. Please try again.', errors: {} }); }
  }
  const { errors } = state;
  return (
    <form onSubmit={submit} noValidate>
      {state.ok && <div className="alert success">{state.ok}</div>}
      {state.error && !Object.keys(errors).length && <div className="alert error">{state.error}</div>}
      <div className="field"><label>Name *</label><input value={f.name} onChange={set('name')} required />{errors.name && <span className="err">{errors.name}</span>}</div>
      <div className="grid2">
        <div className="field"><label>Email</label><input type="email" value={f.email} onChange={set('email')} />{errors.email && <span className="err">{errors.email}</span>}</div>
        <div className="field"><label>Phone</label><input value={f.phone} onChange={set('phone')} /></div>
      </div>
      <div className="field"><label>Message *</label><textarea rows={4} value={f.message} onChange={set('message')} required />{errors.message && <span className="err">{errors.message}</span>}</div>
      <button className="cta" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send message'}</button>
    </form>
  );
}
