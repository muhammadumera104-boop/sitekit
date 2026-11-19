import Link from 'next/link';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';

// Shown when a website cannot be displayed: not published yet, suspended, or the platform is in maintenance mode.
export default async function Unavailable({ code }) {
  const draft = code === 'DRAFT';
  const maintenance = code === 'MAINTENANCE';
  let notice = '';
  if (maintenance) {
    try { notice = (await (await fetch(`${BACKEND}/api/public/platform`, { cache: 'no-store' })).json()).maintenance || ''; } catch { /* ignore */ }
  }
  return (
    <div className="state-page">
      <div>
        <div style={{ fontSize: 56 }}>{draft ? '🚧' : maintenance ? '🛠️' : '⏸️'}</div>
        <h2>{draft ? 'Coming soon' : maintenance ? 'Be right back' : 'Site unavailable'}</h2>
        <p className="muted">{draft ? 'This website has not been published yet.' : maintenance ? (notice || 'We are doing some quick maintenance and will be back shortly.') : 'This website is currently unavailable. Please check back later.'}</p>
        {!maintenance && <Link className="btn primary" href="/">Back to home</Link>}
      </div>
    </div>
  );
}
