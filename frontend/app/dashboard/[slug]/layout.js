'use client';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Forbidden, Protected, Shell } from '@/components/Shell';
import { TenantProvider } from '@/components/TenantCtx';
import { Badge, Loading, useLoad } from '@/components/ui';
import { api } from '@/lib/api';
import { useTabBrand } from '@/lib/useTabBrand';
import { useOrderAlerts } from '@/lib/useOrderAlerts';
import '../../admin.css';
import { useAuth } from '@/lib/auth';

function Inner({ slug, children }) {
  const { data, error, loading, reload } = useLoad(() => api('/tenant/me', { tenant: slug }), [slug]);
  useTabBrand(data ? `${data.tenant.name} — Dashboard` : 'Dashboard', data?.tenant.logo);
  const { user } = useAuth();
  // Messages from the platform team, dismissible per browser.
  const ann = useLoad(() => api('/tenant/announcements', { tenant: slug }).catch(() => ({ items: [] })), [slug]);
  const [hidden, setHidden] = useState([]);
  useEffect(() => { try { setHidden(JSON.parse(localStorage.getItem('ann-hidden') || '[]')); } catch { /* ignore */ } }, []);
  const dismiss = (id) => { const n = [...hidden, id]; setHidden(n); try { localStorage.setItem('ann-hidden', JSON.stringify(n)); } catch { /* ignore */ } };
  const alerts = useOrderAlerts(slug, !!user?.permissions.includes('orders.view'), data?.tenant.name);
  if (loading && !data) return <Loading />;
  if (error) return <Forbidden message={error} />;
  const base = `/dashboard/${slug}`;
  const nav = [
    { href: base, label: 'Overview', icon: '▦', exact: true },
    { sep: 'Sales' },
    { href: `${base}/deliveries`, label: 'My deliveries', icon: '🛵', perm: 'deliveries.use' },
    { href: `${base}/orders`, label: 'Orders', icon: '🧾', perm: 'orders.view', badge: alerts.newOrders },
    { href: `${base}/pos`, label: 'Point of sale', icon: '💳', perm: 'pos.use', feature: 'pos' },
    { href: `${base}/inventory`, label: 'Inventory', icon: '📦', perm: 'inventory.manage', feature: 'inventory' },
    { href: `${base}/branches`, label: 'Branches', icon: '🏬', perm: 'branches.manage' },
    { href: `${base}/areas`, label: 'Delivery areas', icon: '🗺️', perm: 'areas.manage' },
    { href: `${base}/promos`, label: 'Promo codes', icon: '🏷️', perm: 'promos.manage' },
    { href: `${base}/customers`, label: 'Customers', icon: '🧑‍🤝‍🧑', perm: 'customers.view' },
    { href: `${base}/reviews`, label: 'Reviews', icon: '⭐', perm: 'reviews.manage' },
    { sep: 'Content' },
    { href: `${base}/menu`, label: data.tenant.templateKey === 'store' ? 'Products' : 'Menu', icon: '🍽️', perm: 'products.manage' },
    { href: `${base}/pages`, label: 'Pages', icon: '📄', perm: 'content.manage' },
    { href: `${base}/media`, label: 'Media & gallery', icon: '🖼️', perm: 'content.manage' },
    { href: `${base}/messages`, label: 'Messages', icon: '✉️', perm: 'messages.manage' },
    { sep: 'Site' },
    { href: `${base}/settings`, label: 'Site settings', icon: '⚙️', perm: 'settings.edit' },
    { href: `${base}/preview`, label: 'Preview', icon: '👁️', perm: 'content.manage' },
    { href: `${base}/analytics`, label: 'Analytics', icon: '📈', perm: 'analytics.view' },
    { sep: 'Team' },
    { href: `${base}/users`, label: 'Users', icon: '👥', perm: 'tenantUsers.manage' },
    { href: `${base}/audit`, label: 'Audit log', icon: '📜', perm: 'audit.view' },
  ].filter((n) => !n.feature || data.features?.[n.feature]);
  const notices = (ann.data?.items || []).filter((a) => !hidden.includes(a._id)).map((a) => (
    <div className={`announce-bar ${a.level}`} key={a._id} role="status"><span>📣 <strong>{a.title}</strong>{a.body ? ` — ${a.body}` : ''}</span><button className="btn ghost sm" onClick={() => dismiss(a._id)} aria-label="Dismiss">✕</button></div>
  ));
  const imp = data.impersonating && <div className="imp-banner">⚠ You are viewing <strong>{data.tenant.name}</strong>&apos;s dashboard as platform support. This session is recorded in the audit log.</div>;
  const banner = imp || notices.length ? <>{imp}{notices}</> : null;
  return (
    <TenantProvider value={{ slug, tenant: data.tenant, features: data.features || {}, branchId: data.branchId, impersonating: data.impersonating, reload }}>
      <div style={{ '--brand': data.tenant.primary || undefined, display: 'contents' }}><Shell title={<span>{data.tenant.name} <Badge>{data.tenant.status}</Badge></span>} brand={data.tenant.name} logo={data.tenant.logo} nav={nav} banner={banner}>{children}</Shell></div>
    </TenantProvider>
  );
}

export default function TenantLayout({ children }) {
  const { slug } = useParams();
  return <Protected area="tenant" slug={slug}><Inner slug={slug}>{children}</Inner></Protected>;
}
