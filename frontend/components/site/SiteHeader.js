'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function SiteHeader({ name, logo, home, nav, current }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href={home} className="site-logo" onClick={() => setOpen(false)}>
          {logo && <img src={logo} alt="" />}<span className="logo-text">{name}</span>
        </Link>
        <button className="nav-toggle" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button>
        <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Main">
          {nav.map((n) => <Link key={n.slug} href={n.href} className={current === n.slug ? 'on' : ''} onClick={() => setOpen(false)}>{n.title}</Link>)}
        </nav>
      </div>
    </header>
  );
}
