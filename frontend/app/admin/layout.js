'use client';
import { Protected, Shell } from '@/components/Shell';
import { useTabBrand } from '@/lib/useTabBrand';
import { useLoad } from '@/components/ui';
import '../admin.css';

const nav = [
  { href: '/admin', label: 'Overview', icon: '▦', exact: true },
  { sep: 'Marketplace' },
  { href: '/admin/sites', label: 'All websites', icon: '🌐', exact: true },
  { href: '/admin/products', label: 'Products', icon: '🛍️' },
  { href: '/admin/orders', label: 'Orders', icon: '🧾' },
  { href: '/admin/customers', label: 'Customers', icon: '🧑‍🤝‍🧑' },
  { href: '/admin/reviews', label: 'Reviews', icon: '⭐' },
  { href: '/admin/coupons', label: 'Coupons', icon: '🏷️' },
  { sep: 'Money' },
  { href: '/admin/payments', label: 'Payments', icon: '💳' },
  { href: '/admin/payouts', label: 'Payouts', icon: '🏦' },
  { href: '/admin/plans', label: 'Plans', icon: '📦' },
  { sep: 'Platform' },
  { href: '/admin/tenants', label: 'Tenants', icon: '🏢', exact: true },
  { href: '/admin/tenants/new', label: 'Add tenant', icon: '＋', perm: 'tenant.create' },
  { href: '/admin/templates', label: 'Templates', icon: '🎨' },
  { href: '/admin/features', label: 'Feature toggles', icon: '🎚️' },
  { href: '/admin/announcements', label: 'Announcements', icon: '📣' },
  { sep: 'Access' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/accounts', label: 'Accounts', icon: '🔑' },
  { href: '/admin/audit', label: 'Activity logs', icon: '📜', perm: 'audit.view' },
  { href: '/admin/settings', label: 'Platform settings', icon: '⚙️' },
];

export default function AdminLayout({ children }) {
  useTabBrand('SiteForge Admin', '/icon.svg');
  const platform = useLoad(() => fetch('/api/public/platform').then((r) => r.json()).catch(() => ({})), []);
  const name = platform.data?.name || 'SiteForge';
  return (
    <Protected area="platform">
      <Shell title="Admin Portal" brand={`${name} Admin`} nav={nav}>{children}</Shell>
    </Protected>
  );
}
