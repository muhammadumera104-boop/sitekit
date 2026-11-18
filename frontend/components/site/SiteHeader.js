'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useOrdering } from './Ordering';

export default function SiteHeader({ name, logo, home, nav, current, staffHref, trackHref }) {
  const [open, setOpen] = useState(false);
  const o = useOrdering();
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href={home} className="site-logo" onClick={() => setOpen(false)}>
          {logo && <img src={logo} alt="" />}<span className="logo-text">{name}</span>
        </Link>
        {o.locOn && o.features?.cart && !o.preview && (
          <button className="loc-pill" onClick={o.openLocation} aria-label="Change delivery location">
            <span>📍</span><span><small>{o.loc ? 'Delivering to' : 'Select location'}</small><b>{o.loc ? o.loc.areaName : 'Choose area'}</b></span><i>▾</i>
          </button>
        )}
        <button className="nav-toggle" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button>
        <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Main">
          {nav.map((n) => <Link key={n.slug} href={n.href} className={current === n.slug ? 'on' : ''} onClick={() => setOpen(false)}>{n.title}</Link>)}
          {trackHref && <Link href={trackHref} className={current === 'track' ? 'on' : ''} onClick={() => setOpen(false)}>Track order</Link>}
          {o.cartOn && !o.preview && <button className="hd-cart" onClick={o.openCart} aria-label={`Cart, ${o.count} items`}>🛒{o.count > 0 && <b>{o.count}</b>}</button>}
          {staffHref && <Link href={staffHref} className="staff-btn" onClick={() => setOpen(false)}>🔐 Staff login</Link>}
        </nav>
      </div>
    </header>
  );
}
