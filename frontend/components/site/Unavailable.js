import Link from 'next/link';

export default function Unavailable({ code }) {
  const draft = code === 'DRAFT';
  return (
    <div className="state-page">
      <div>
        <div style={{ fontSize: 56 }}>{draft ? '🚧' : '⏸️'}</div>
        <h2>{draft ? 'Coming soon' : 'Site unavailable'}</h2>
        <p className="muted">{draft ? 'This website has not been published yet.' : 'This website is currently unavailable. Please check back later.'}</p>
        <Link className="btn primary" href="/">Back to home</Link>
      </div>
    </div>
  );
}
