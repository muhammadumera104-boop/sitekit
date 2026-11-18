// Server layout for the staff login: gives the tab the store's own name and logo (the page itself is a client component).
const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';

export async function generateMetadata({ params }) {
  try {
    const r = await fetch(`${BACKEND}/api/public/tenants/${encodeURIComponent(params.slug)}/brand`, { cache: 'no-store' });
    if (!r.ok) return { title: 'Staff login' };
    const b = await r.json();
    return { title: `Staff login | ${b.name}`, applicationName: b.name, robots: { index: false }, icons: b.logo ? { icon: b.logo, apple: b.logo } : undefined };
  } catch { return { title: 'Staff login' }; }
}

export default function LoginLayout({ children }) { return children; }
