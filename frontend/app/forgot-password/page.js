'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Field } from '@/components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setMsg('');
    try { setMsg((await api('/auth/forgot-password', { method: 'POST', body: { email } })).message); } catch (x) { setError(x.message); }
    setBusy(false);
  }
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Forgot password</h2>
        <p className="muted">Enter your email and we&apos;ll send you a reset link.</p>
        <Alert>{error}</Alert><Alert type="success">{msg}</Alert>
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
        <p className="center" style={{ fontSize: 14 }}><Link href="/login" style={{ color: 'var(--brand)' }}>Back to sign in</Link></p>
      </form>
    </div>
  );
}
