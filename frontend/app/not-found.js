import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="state-page">
      <div>
        <h1>404</h1>
        <h2>Website not found</h2>
        <p className="muted">We couldn&apos;t find the page or website you were looking for.</p>
        <Link className="btn primary" href="/">Back to home</Link>
      </div>
    </div>
  );
}
