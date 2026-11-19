'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth, homeFor } from '@/lib/auth';
import { api } from '@/lib/api';
import { Loading, Modal, Field, Alert } from './ui';

export function Forbidden({ message = 'You do not have permission to view this page.' }) {
  return (
    <div className="fullpage"><div className="center"><h1 style={{ fontSize: 56, margin: 0 }}>403</h1><h3>Access denied</h3><p className="muted">{message}</p></div></div>
  );
}

/**
 * Route guard.
 *  area="platform" -> Super Admin / Platform Staff only (tenant users are redirected to their dashboard)
 *  area="tenant"   -> tenant users of `slug` only (+ platform users, who are audited as impersonation)
 *  perm            -> optional permission required for the page; a miss shows 403 and is logged
 */
export function Protected({ area, slug, perm, children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const reported = useRef('');

  const wrongTenant = user && area === 'tenant' && !user.isPlatform && user.tenantSlug !== slug;
  const noPerm = user && perm && !user.permissions.includes(perm);
  const blocked = user && area === 'platform' && !user.isPlatform;

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace(area === 'tenant' ? `/${slug}/login?next=${encodeURIComponent(path)}` : `/login?next=${encodeURIComponent(path)}`); return; }
    if (blocked) router.replace(homeFor(user));
  }, [loading, user, blocked, router, path, area, slug]);

  useEffect(() => {
    if ((wrongTenant || noPerm) && reported.current !== path) {
      reported.current = path;
      api('/auth/access-denied', { method: 'POST', body: { path } }).catch(() => {});
    }
  }, [wrongTenant, noPerm, path]);

  if (loading || !user || blocked) return <Loading />;
  if (wrongTenant) return <Forbidden message="This dashboard belongs to a different business." />;
  if (noPerm) return <Forbidden />;
  return children;
}

// Lets any signed-in person choose their own password.
function ChangePassword({ onClose }) {
  const [f, setF] = useState({ cur: '', next: '', again: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.next !== f.again) return setErr('The new passwords do not match');
    setBusy(true);
    try { await api('/auth/change-password', { method: 'POST', body: { currentPassword: f.cur, newPassword: f.next } }); setDone(true); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <><Alert type="success">Your password was changed. Other devices were signed out.</Alert><button className="btn primary" onClick={onClose}>Done</button></>
      ) : (
        <form onSubmit={submit} className="stack">
          <Alert>{err}</Alert>
          <Field label="Current password" type="password" value={f.cur} onChange={(e) => setF({ ...f, cur: e.target.value })} required autoComplete="current-password" />
          <Field label="New password" type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} minLength={8} required autoComplete="new-password" hint="At least 8 characters" />
          <Field label="Confirm new password" type="password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} minLength={8} required autoComplete="new-password" />
          <div className="row"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
        </form>
      )}
    </Modal>
  );
}

export function Shell({ title, brand, logo, nav, banner, children }) {
  const { user, logout } = useAuth();
  const [pw, setPw] = useState(false);
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const allowed = nav.filter((n) => n.sep || !n.perm || user.permissions.includes(n.perm));
  // Drop section headings that have no visible link under them (e.g. "Sales" for an editor).
  const visible = allowed.filter((n, i) => !n.sep || (allowed[i + 1] && !allowed[i + 1].sep));
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand">{logo ? <img className="logo-sm" src={logo} alt="" /> : <span>◆</span>}<span>{brand}</span></div>
        <nav>
          {visible.map((n, i) => (n.sep
            ? <div key={i} className="sep">{n.sep}</div>
            : <Link key={n.href} href={n.href} className={(n.exact ? path === n.href : path.startsWith(n.href)) ? 'on' : ''}>{n.icon} {n.label}{n.badge > 0 && <span className="nav-badge">{n.badge}</span>}</Link>))}
        </nav>
      </aside>
      <div className="main">
        {banner}
        <header className="topbar">
          <div className="row"><button className="btn sm burger" onClick={() => setOpen(!open)} aria-label="Menu">☰</button><strong>{title}</strong></div>
          <div className="row">
            <button className="btn sm theme-toggle" aria-label="Toggle dark mode" onClick={() => {
              const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
              document.documentElement.dataset.theme = next;
              try { localStorage.setItem('theme', next); } catch { /* ignore */ }
            }}>🌓</button>
            <span className="muted" style={{ fontSize: 13 }}>{user.name} · {user.role.replace('_', ' ')}</span>
            <button className="btn sm" onClick={() => setPw(true)}>Change password</button>
            <button className="btn sm" onClick={logout}>Log out</button>
          </div>
        </header>
        {pw && <ChangePassword onClose={() => setPw(false)} />}
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
