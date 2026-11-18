'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Field } from '@/components/ui';

function Form() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const invite = sp.get('invite');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loginPath, setLoginPath] = useState('/login');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setError('');
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try { const d = await api('/auth/reset-password', { method: 'POST', body: { token, password } }); setLoginPath(d.loginPath || '/login'); setDone(true); } catch (x) { setError(x.message); }
    setBusy(false);
  }
  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h2>{invite ? 'Set your password' : 'Reset password'}</h2>
        {done ? (
          <><Alert type="success">Password saved. You can now sign in.</Alert><Link className="btn primary" href={loginPath}>Go to sign in</Link></>
        ) : (
          <>
            <Alert>{error}</Alert>
            <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required hint="At least 8 characters" />
            <Field label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <button className="btn primary" style={{ width: '100%' }} disabled={busy || !token}>{busy ? 'Saving…' : 'Save password'}</button>
          </>
        )}
      </form>
    </div>
  );
}
export default function ResetPassword() { return <Suspense><Form /></Suspense>; }
