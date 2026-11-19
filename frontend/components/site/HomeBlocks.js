'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Featured } from './StoreCatalog';
import { useOrdering } from './Ordering';

// Full-width hero carousel: eyebrow, serif headline, subtitle and a call to action per slide. Auto-advances every 6 s.
export function HeroSlider({ slides, slug, preview, children }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (slides.length < 2 || hold) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length, hold]);
  const go = (n) => setI((n + slides.length) % slides.length);
  return (
    <section className="hero hero-slider" id="top" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} aria-roledescription="carousel">
      {slides.map((s, k) => (
        <div key={k} className={`slide ${k === i ? 'on' : ''}`} style={s.image ? { backgroundImage: `url(${s.image})` } : undefined} aria-hidden={k !== i} />
      ))}
      <div className="wrap">
        {slides.map((s, k) => k === i && (
          <div className="hero-copy slide-copy" key={k}>
            {s.eyebrow && <span className="slide-eyebrow">{s.eyebrow}</span>}
            <h1>{s.title}</h1>
            {s.subtitle && <p>{s.subtitle}</p>}
            {s.cta && <div className="hero-actions"><Link className="cta lg" href={preview ? '#' : `/${slug}/${String(s.link || '').replace(/^\//, '')}`}>{s.cta} →</Link></div>}
          </div>
        ))}
        {children}
      </div>
      {slides.length > 1 && (
        <>
          <button className="sl-arrow l" onClick={() => go(i - 1)} aria-label="Previous slide">‹</button>
          <button className="sl-arrow r" onClick={() => go(i + 1)} aria-label="Next slide">›</button>
          <div className="sl-dots">{slides.map((_, k) => <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} />)}</div>
        </>
      )}
    </section>
  );
}

const pad = (n) => String(Math.max(0, n)).padStart(2, '0');

// "Limited-time deals" with a live countdown to the end date, then the discounted products.
export function FlashSale({ sale, items, href, preview }) {
  const end = new Date(sale.endsAt).getTime();
  const [left, setLeft] = useState(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [end]);
  if (left === 0 || !items.length) return null;
  const s = left === null ? null : Math.floor(left / 1000);
  const parts = s === null ? ['--', '--', '--', '--'] : [pad(Math.floor(s / 86400)), pad(Math.floor((s % 86400) / 3600)), pad(Math.floor((s % 3600) / 60)), pad(s % 60)];
  return (
    <section className="sec flash" id="flash"><div className="wrap">
      <div className="sec-head">
        <div>
          <span className="eyebrow">⚡ Flash sale</span>
          <h2>{sale.title}</h2>
        </div>
        <div className="countdown" aria-label="Time left">
          <span className="ends">Ends in</span>
          {['Days', 'Hrs', 'Min', 'Sec'].map((l, k) => <div key={l}><b>{parts[k]}</b><small>{l}</small></div>)}
        </div>
      </div>
      <Featured items={items} preview={preview} />
      <div className="center"><Link className="cta alt dark" href={href}>See all deals →</Link></div>
    </div></section>
  );
}

// Trust badges (fashion / shipped goods).
export function Perks({ eta }) {
  const list = [['🚚', 'Fast delivery', eta ? `Delivered in ${eta}` : 'Reliable shipping to your door'], ['🔒', 'Secure checkout', 'Your data is always protected'], ['↩️', 'Easy returns', 'Hassle-free within 14 days'], ['💬', 'Friendly support', 'We are here when you need us']];
  return <div className="perks">{list.map(([i, t, d]) => <div key={t}><span>{i}</span><div><strong>{t}</strong><small>{d}</small></div></div>)}</div>;
}

export function Newsletter({ slug, preview, name }) {
  const [email, setEmail] = useState('');
  const [st, setSt] = useState({ busy: false, ok: '', err: '' });
  async function sub(e) {
    e.preventDefault();
    if (preview) return setSt({ busy: false, ok: 'Preview mode.', err: '' });
    setSt({ busy: true, ok: '', err: '' });
    try {
      const r = await fetch(`/api/public/tenants/${slug}/subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const d = await r.json();
      if (!r.ok) return setSt({ busy: false, ok: '', err: d.errors ? Object.values(d.errors)[0] : d.message });
      setEmail(''); setSt({ busy: false, ok: d.message, err: '' });
    } catch { setSt({ busy: false, ok: '', err: 'Could not subscribe. Please try again.' }); }
  }
  return (
    <section className="sec news"><div className="wrap narrow center">
      <span className="eyebrow center">Newsletter</span>
      <h2>Join the {name} list</h2>
      <p className="sub" style={{ marginBottom: 22 }}>Be the first to hear about new arrivals, exclusive offers and flash sales.</p>
      <form className="news-form" onSubmit={sub} noValidate>
        <input type="email" required placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
        <button className="cta" disabled={st.busy}>{st.busy ? '…' : 'Subscribe'}</button>
      </form>
      {st.ok && <div className="ok-text" style={{ marginTop: 10 }}>{st.ok}</div>}
      {st.err && <div className="err" style={{ marginTop: 10 }}>{st.err}</div>}
    </div></section>
  );
}

// /wishlist page: everything the visitor hearted (kept in this browser).
export function Wishlist({ menu, features, preview }) {
  const o = useOrdering();
  const all = menu.flatMap((c) => c.items);
  const items = all.filter((i) => (o.wish || []).includes(i.id));
  if (!o.ready) return null;
  if (!items.length) return <div className="center"><h2>Your wishlist is empty</h2><p className="muted">Tap the heart on any product to save it here.</p><Link className="cta" href={`/${o.slug}/${o.menuSlug}`}>Browse the collection</Link></div>;
  return (
    <>
      <span className="eyebrow center">Saved for later</span>
      <h2>My wishlist</h2>
      <p className="sub">{items.length} item{items.length === 1 ? '' : 's'} saved in this browser.</p>
      <Featured items={items} preview={preview} grid features={features} />
    </>
  );
}
