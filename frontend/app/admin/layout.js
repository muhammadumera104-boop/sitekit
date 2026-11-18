'use client';
import { Protected, Shell } from '@/components/Shell';
import { useTabBrand } from '@/lib/useTabBrand';

const nav = [
  { href: '/admin', label: 'Dashboard', icon: '▦', exact: true },
  { href: '/admin/sites', label: 'All websites', icon: '🌐', exact: true },
  { href: '/admin/tenants', label: 'Tenants', icon: '🏢', exact: true },
  { href: '/admin/tenants/new', label: 'Add tenant', icon: '＋', perm: 'tenant.create' },
  { href: '/admin/templates', label: 'Templates', icon: '🎨' },
  { href: '/admin/features', label: 'Feature toggles', icon: '🎚️' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/audit', label: 'Audit log', icon: '📜', perm: 'audit.view' },
];

export default function AdminLayout({ children }) {
  useTabBrand('SiteForge Admin', '/icon.svg');
  return (
    <Protected area="platform">
      <Shell title="Admin Portal" brand="SiteForge Admin" nav={nav}>{children}</Shell>
    </Protected>
  );
}
