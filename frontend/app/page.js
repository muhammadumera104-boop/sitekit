import Link from 'next/link';

export const metadata = { title: 'SiteForge', description: 'Multi-tenant website platform' };

// Deliberately neutral: the platform home never lists customer websites.
// Every business lives at its own address (/their-name) with its own login (/their-name/login).
export default function Home() {
  return (
    <div className="land-hero" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>◆ SiteForge</div>
        <p style={{ color: '#c7cdd9', maxWidth: 440, margin: '0 auto 24px' }}>Website platform. If you are looking for a business, open its own web address.</p>
        <Link className="btn" href="/login" style={{ color: '#101828' }}>Platform admin sign in</Link>
      </div>
    </div>
  );
}
