'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export const Spinner = () => <span className="spinner" aria-label="Loading" />;
export const Loading = () => <div className="fullpage"><Spinner /></div>;
export const Badge = ({ children }) => <span className={`badge ${String(children).toLowerCase()}`}>{String(children).replace('_', ' ')}</span>;

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return <div className={`alert ${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>;
}

// Password box with a Show / Hide button.
export function PasswordInput({ style, ...input }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input {...input} type={show ? 'text' : 'password'} style={{ ...style, paddingRight: 64, width: '100%' }} />
      <button type="button" className="btn ghost sm" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

export function Field({ label, error, hint, children, ...input }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children || (input.type === 'password' ? <PasswordInput {...input} /> : <input {...input} />)}
      {hint && <small>{hint}</small>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h3>{title}</h3><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Pager({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

// Loads data with loading/error state. `fn` must be stable-ish; pass deps to reload.
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fn()); } catch (e) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

// Image URL field with direct upload. `uploadPath` is the API route to POST the file to; `tenant` sets X-Tenant-Slug.
export function ImageField({ label, value, onChange, uploadPath = '/admin/upload', tenant, hint }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const form = new FormData(); form.append('file', f);
      const d = await api(uploadPath, { method: 'POST', form, tenant });
      onChange(d.url || d.media?.url);
    } catch (x) { setErr(x.message); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  }
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        {value ? <img className="thumb" src={value} alt="" /> : <div className="thumb" />}
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="https://… or upload" style={{ flex: 1, padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8, minWidth: 0 }} />
        <button type="button" className="btn sm" disabled={busy} onClick={() => ref.current.click()}>{busy ? 'Uploading…' : 'Upload'}</button>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={pick} />
      </div>
      {hint && <small>{hint}</small>}
      {err && <span className="err">{err}</span>}
    </div>
  );
}
