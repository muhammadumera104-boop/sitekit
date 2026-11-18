'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth, homeFor } from '@/lib/auth';
import { api } from '@/lib/api';
import { Loading } from './ui';

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

export function Shell({ title, brand, logo, nav, banner, children }) {
  const { user, logout } = useAuth();
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
            <button className="btn sm" onClick={logout}>Log out</button>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
