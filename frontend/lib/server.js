// Server-side data loading for public tenant websites (SSR).
const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';

export async function getSite(slug) {
  try {
    const res = await fetch(`${BACKEND}/api/public/tenants/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { site: data };
    return { error: data.code || (res.status === 404 ? 'NOT_FOUND' : 'ERROR'), message: data.message };
  } catch {
    return { error: 'ERROR', message: 'The service is temporarily unavailable.' };
  }
}

export async function getItem(slug, id) {
  try {
    const res = await fetch(`${BACKEND}/api/public/tenants/${encodeURIComponent(slug)}/items/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : null;
  } catch { return null; }
}
