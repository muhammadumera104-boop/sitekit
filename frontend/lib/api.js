// Browser API client: attaches the access token, auto-refreshes on 401 using the HTTP-only cookie.
let token = null;
let refreshing = null;

export function setToken(t) {
  token = t;
  try { t ? sessionStorage.setItem('at', t) : sessionStorage.removeItem('at'); } catch { /* ignore */ }
}
export function getToken() {
  if (token) return token;
  try { token = sessionStorage.getItem('at'); } catch { /* ignore */ }
  return token;
}

export function refreshSession() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('refresh failed');
        const d = await r.json();
        setToken(d.accessToken);
        return d;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, tenant, form } = {}) {
  const run = () => fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(tenant ? { 'X-Tenant-Slug': tenant } : {}),
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  let res = await run();
  if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    try { await refreshSession(); res = await run(); } catch { setToken(null); }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.message || 'Request failed');
    e.status = res.status; e.errors = data.errors; e.code = data.code;
    throw e;
  }
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};
