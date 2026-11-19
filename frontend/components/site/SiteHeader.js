'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useOrdering } from './Ordering';

export default function SiteHeader({ name, logo, home, nav, current, staffHref, trackHref, accountHref, overHero, searchHref, wishHref }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const router = useRouter();
  const input = useRef(null);
  const o = useOrdering();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => { if (search) input.current?.focus(); }, [search]);
  const cls = ['site-header', overHero ? 'over' : '', scrolled ? 'scrolled' : '', open || search ? 'menu-open' : ''].filter(Boolean).join(' ');
  function submit(e) {
    e.preventDefault();
    router.push(`${searchHref}${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
    setSearch(false); setOpen(false);
  }
  return (
    <header className={cls}>
      <div className="wrap">
        <Link href={home} className="site-logo" onClick={() => setOpen(false)}>
          {logo && <img src={logo} alt="" />}<span className="logo-text">{name}</span>
        </Link>
        {o.locOn && o.features?.cart && !o.preview && (o.loc || !o.ordering?.etaLabel) && (
          <button className="loc-pill" onClick={o.openLocation} aria-label="Change delivery location">
            <span>📍</span><span><small>{o.loc ? 'Delivering to' : 'Select location'}</small><b>{o.loc ? o.loc.areaName : 'Choose area'}</b></span><i>▾</i>
          </button>
        )}
        <button className="nav-toggle" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button>
        <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Main">
          {nav.map((n) => <Link key={n.slug} href={n.href} className={current === n.slug ? 'on' : ''} onClick={() => setOpen(false)}>{n.title}</Link>)}
          {trackHref && <Link href={trackHref} className={current === 'track' ? 'on' : ''} onClick={() => setOpen(false)}>Track order</Link>}
          {searchHref && <button className="hd-cart hd-icon" onClick={() => setSearch(!search)} aria-label="Search products" aria-expanded={search}>🔍</button>}
          {wishHref && <Link href={wishHref} className="hd-cart hd-icon wish-link" aria-label={`Wishlist, ${(o.wish || []).length} saved`} onClick={() => setOpen(false)}>♡{(o.wish || []).length > 0 && <b>{o.wish.length}</b>}</Link>}
          {accountHref && <Link href={accountHref} className={current === 'account' ? 'on' : ''} onClick={() => setOpen(false)}>👤 Account</Link>}
          {o.cartOn && !o.preview && <button className="hd-cart" onClick={o.openCart} aria-label={`Cart, ${o.count} items`}>🛒{o.count > 0 && <b>{o.count}</b>}</button>}
          {staffHref && <Link href={staffHref} className="staff-btn" onClick={() => setOpen(false)}>🔐 Staff login</Link>}
        </nav>
      </div>
      {search && searchHref && (
        <form className="hd-search wrap" onSubmit={submit} role="search">
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" aria-label="Search products" />
          <button className="cta">Search</button>
          <button type="button" className="hd-x" onClick={() => setSearch(false)} aria-label="Close search">✕</button>
        </form>
      )}
    </header>
  );
}
