'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { api, getToken, setToken, refreshSession } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export const homeFor = (u) => (u.isPlatform ? '/admin' : `/dashboard/${u.tenantSlug}`);
// Each audience has its own door: platform team -> /login, a business's staff -> /{slug}/login.
export const loginFor = (u) => (u && !u.isPlatform && u.tenantSlug ? `/${u.tenantSlug}/login` : '/login');

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const path = usePathname();
  const started = useRef(false);
  // /{slug}/login is a staff door too, but visitors on public pages never need a session.
  const portal = /^\/(admin|dashboard|login|forgot-password|reset-password)(\/|$)/.test(path || '') || /^\/[^/]+\/login\/?$/.test(path || '');

  useEffect(() => {
    if (!portal) { if (!started.current) setLoading(false); return; }
    if (started.current) return;
    started.current = true;
    setLoading(true);
    (async () => {
      try {
        if (getToken()) {
          try { setUser((await api('/auth/me')).user); return; } catch { /* fall through to refresh */ }
        }
        setUser((await refreshSession()).user);
      } catch { setToken(null); setUser(null); } finally { setLoading(false); }
    })();
  }, [portal]);

  const login = useCallback(async (email, password, tenantSlug) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password, ...(tenantSlug ? { tenantSlug } : {}) } });
    setToken(d.accessToken); setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    const to = loginFor(user);
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setToken(null); setUser(null);
    window.location.href = to;
  }, [user]);

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
