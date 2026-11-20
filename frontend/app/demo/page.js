'use client';
import { useEffect, useState } from 'react';
import { api, setToken } from '@/lib/api';
import { Alert, Spinner } from '@/components/ui';

// Public visitor link: opens the admin portal in read-only demo mode, no password needed.
export default function Demo() {
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        // Start clean: an older sign-in in this browser must not leak into the demo.
        setToken(null);
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
        const d = await api('/auth/demo', { method: 'POST' });
        setToken(d.accessToken);
        window.location.replace('/admin');
      } catch (e) { setError(e.message); }
    })();
  }, []);
  return (
    <div className="fullpage"><div className="center" style={{ maxWidth: 420, textAlign: 'center' }}>
      {error ? <Alert>{error}</Alert> : <><Spinner /><p className="muted">Opening the demo…</p></>}
    </div></div>
  );
}
