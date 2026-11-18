import Link from 'next/link';
import ContactForm from './ContactForm';
import StoreCatalog, { Price, Featured, Stars } from './StoreCatalog';
import SiteHeader from './SiteHeader';
import Gallery from './Gallery';
import { OrderingProvider } from './Ordering';
import Checkout from './Checkout';
import TrackOrder from './TrackOrder';
import ComplaintForm from './ComplaintForm';
import Account from './Account';
import { money } from '@/lib/util';

// Data-driven template renderer (FR-W2): layout comes from the template key, content from the tenant's data.
// Used for the public site (server rendered) and for the dashboard / wizard live previews (preview=true).
const onColor = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#111' : '#fff';
};
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

function Dish({ i, href }) {
  const Wrap = href ? Link : 'div';
  return (
    <Wrap className="dish" {...(href ? { href } : {})}>
      <div className="dish-img">
        {i.image ? <img src={i.image} alt={i.name} loading="lazy" /> : <div className="ph" aria-hidden="true">🍽️</div>}
        {!i.isAvailable ? <span className="ribbon">Unavailable</span> : i.discountPercent > 0 && <span className="ribbon sale">{i.discountPercent}% OFF</span>}
      </div>
      <div className="dish-body">
        <div className="dish-top"><h4>{i.name}</h4><Price i={i} /></div>
        {i.description && <p>{i.description}</p>}
      </div>
    </Wrap>
  );
}

function RestaurantMenu({ menu, itemHref }) {
  if (!menu.length) return <p className="muted center">Menu coming soon.</p>;
  return (
    <>
      <div className="cat-nav" aria-label="Categories">
        <div className="wrap-inner">{menu.map((c) => <a key={c.id} href={`#cat-${slugOf(c.name)}`}>{c.name}</a>)}</div>
      </div>
      {menu.map((c) => (
        <div key={c.id} id={`cat-${slugOf(c.name)}`} className="cat-block">
          <h3 className="cat-title">{c.name}</h3>
          <div className="dish-grid">{c.items.map((i) => <Dish key={i.id} i={i} href={itemHref(i)} />)}</div>
        </div>
      ))}
    </>
  );
}

function Hours({ hours }) {
  if (!hours?.length) return null;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return (
    <table className="hours"><tbody>
      {hours.map((h) => (
        <tr key={h.day} className={h.day === today ? 'today' : ''}><td>{h.day}</td><td style={{ textAlign: 'right' }}>{h.closed ? 'Closed' : `${h.open || ''} – ${h.close || ''}`}</td></tr>
      ))}
    </tbody></table>
  );
}

const ICONS = {
  facebook: 'M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.9.4-1.7 1.8-1.7H17V3.8C16.7 3.7 15.7 3.6 14.7 3.6c-2.5 0-4.2 1.5-4.2 4.3v2.6H7.7v3.3h2.8V22h3Z',
  instagram: 'M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  twitter: 'M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.3l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z',
  youtube: 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.7 2 12 2 12s0 3.3.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8C22 15.3 22 12 22 12s0-3.3-.4-4.8ZM10 15V9l5.2 3L10 15Z',
  whatsapp: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.300.1-.2 0-.3 0-.4l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.200c0 1.300.9 2.500 1 2.700.1.200 1.800 2.800 4.400 3.900 1.600.7 2.200.7 3 .6.500-.1 1.500-.6 1.700-1.200.2-.6.2-1.100.2-1.200-.1-.1-.3-.2-.5-.3Z',
};
const Social = ({ k, v }) => (
  <a href={k === 'whatsapp' ? `https://wa.me/${String(v).replace(/\D/g, '')}` : v} target="_blank" rel="noopener noreferrer" aria-label={k} title={k}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[k] || ICONS.facebook} /></svg>
  </a>
);

export default function SiteView({ site, page, preview = false, detail = null }) {
  const t = site.tenant;
  const isStore = t.templateKey === 'store';
  const features = site.features || {};
  // The cart is a feature, not a template: any store can switch it on, and a store-template site can switch it off.
  const useCatalog = isStore || !!features.cart;
  const sec = { about: true, menu: true, gallery: true, contact: true, ...(t.sections || {}) };
  const label = site.template?.dataSchema?.itemLabel || (isStore ? 'Products' : 'Menu');
  const menuSlug = isStore ? 'products' : 'menu';
  const href = (p) => (preview ? `#${p || 'top'}` : p ? `/${t.slug}/${p}` : `/${t.slug}`);
  const itemHref = (i) => (preview ? null : `/${t.slug}/${menuSlug}/${i.id}`);
  const style = { '--primary': t.theme?.primary, '--secondary': t.theme?.secondary, '--fh': t.theme?.fontHeading, '--fb': t.theme?.fontBody, '--r': t.theme?.radius, '--on-primary': onColor(t.theme?.primary), '--on-sec': onColor(t.theme?.secondary) };
  const current = page === 'menu' ? menuSlug : page;
  const ext = ['checkout', 'track', 'complaint', 'locations', 'account'].includes(page) ? page : null; // ordering pages

  const nav = [
    { slug: '', title: 'Home' },
    sec.menu && { slug: menuSlug, title: label },
    sec.about && t.about && { slug: 'about', title: 'About' },
    sec.gallery && site.gallery.length > 0 && { slug: 'gallery', title: 'Gallery' },
    ...site.nav.map((n) => ({ slug: n.slug, title: n.title })),
    sec.contact && { slug: 'contact', title: 'Contact' },
  ].filter(Boolean).map((n) => ({ ...n, href: href(n.slug) }));

  const showAll = !current && !detail && !ext;
  const show = (name) => !detail && !ext && (showAll || current === name);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayHours = t.openingHours?.find((h) => h.day === today);
  const custom = site.pages.find((p) => p.slug === current);
  const bodyParas = (txt) => String(txt || '').split(/\n{2,}/).filter(Boolean);
  const reviews = site.reviews;
  const allItems = site.menu.flatMap((c) => c.items.map((i) => ({ ...i, cid: c.id })));
  const availableItems = allItems.filter((i) => i.isAvailable);
  // "Popular right now": discounted first, then the first dishes of each category.
  const featured = [...availableItems.filter((i) => i.discountPercent > 0), ...site.menu.flatMap((c) => c.items.filter((i) => i.isAvailable).slice(0, 2))]
    .filter((i, k, arr) => arr.findIndex((x) => x.id === i.id) === k).slice(0, 10);
  const tiles = site.menu.filter((c) => c.items.length).map((c) => ({ ...c, img: c.items.find((i) => i.image)?.image }));
  const hasHero = showAll;
  const catHref = (c) => (useCatalog ? `${href(menuSlug)}?cat=${c.id}` : `${href(menuSlug)}#cat-${slugOf(c.name)}`);

  return (
    <div className={`site t-${t.templateKey} ${hasHero ? 'has-hero' : ''}`} style={style}>
    <OrderingProvider slug={t.slug} menuSlug={menuSlug} menu={site.menu} features={features} ordering={site.ordering} locations={site.locations || []} preview={preview}>
      {preview && <div className="preview-bar">Preview — this is how your website looks{t.status !== 'active' ? ' (not published yet)' : ''}</div>}
      <SiteHeader name={t.name} logo={t.branding?.logo} home={href('')} nav={nav} current={current || ''} overHero={hasHero}
        staffHref={preview ? null : `/${t.slug}/login`} trackHref={features.orderTracking && features.cart && !preview ? `/${t.slug}/track` : null}
        accountHref={features.accounts && features.cart && !preview ? `/${t.slug}/account` : null} />

      <main>
        {showAll && (
          <>
            <section className="hero" id="top" style={t.hero?.image ? { backgroundImage: `url(${t.hero.image})` } : undefined}>
              <div className="wrap">
                <div className="hero-copy">
                  {todayHours && !todayHours.closed && <span className="hero-badge fade-up">Open today · {todayHours.open} – {todayHours.close}</span>}
                  <h1 className="fade-up d1">{t.hero?.title || t.name}</h1>
                  {(t.hero?.subtitle || t.branding?.tagline) && <p className="fade-up d2">{t.hero?.subtitle || t.branding?.tagline}</p>}
                  <div className="hero-actions fade-up d2">
                    {sec.menu && <Link className="cta lg" href={href(menuSlug)}>{features.cart ? 'Order now' : isStore ? 'Shop now' : `View ${label}`} →</Link>}
                    {sec.contact && <Link className="cta alt lg" href={href('contact')}>Contact us</Link>}
                  </div>
                  <ul className="hero-chips fade-up d3">
                    {reviews?.count > 0 && <li>⭐ {reviews.avg} <span style={{ opacity: .75 }}>({reviews.count} reviews)</span></li>}
                    {features.cart && site.ordering?.etaMinutes && <li>🛵 Delivery in ~{site.ordering.etaMinutes} min</li>}
                    {features.cart && features.pickup && <li>🏪 Pickup available</li>}
                    {site.branches?.length > 1 && <li>📍 {site.branches.length} branches</li>}
                  </ul>
                </div>
              </div>
              <a className="scroll-cue" href="#featured" aria-label="Scroll down">↓</a>
            </section>
            {(t.contact?.phone || t.contact?.address || todayHours) && (
              <div className="wrap">
                <div className="info-strip">
                  {t.contact?.phone && <a href={`tel:${t.contact.phone}`}><span>📞</span><div><small>Call us</small><strong>{t.contact.phone}</strong></div></a>}
                  {t.contact?.address && <a href={t.contact.map || '#'} target={t.contact.map ? '_blank' : undefined} rel="noopener noreferrer"><span>📍</span><div><small>Find us</small><strong>{t.contact.address}</strong></div></a>}
                  {todayHours && <div className="info-item"><span>🕒</span><div><small>Today</small><strong>{todayHours.closed ? 'Closed' : `${todayHours.open} – ${todayHours.close}`}</strong></div></div>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Home: popular items, category tiles, about, reviews, gallery, call to action, contact */}
        {showAll && sec.menu && featured.length > 0 && (
          <section className="sec" id="featured"><div className="wrap">
            <div className="sec-head">
              <div><span className="eyebrow">Popular right now</span><h2>{isStore ? 'Customer favourites' : 'Most loved dishes'}</h2></div>
              <Link className="link-arrow" href={href(menuSlug)}>See full {label.toLowerCase()} →</Link>
            </div>
            <Featured items={featured} preview={preview} />
          </div></section>
        )}
        {showAll && sec.menu && tiles.length > 1 && (
          <section className="sec alt"><div className="wrap">
            <span className="eyebrow center">Explore</span><h2>Browse by category</h2><p className="sub">Find exactly what you are craving.</p>
            <div className="cat-tiles">
              {tiles.map((c) => (
                <Link key={c.id} className="cat-tile" href={catHref(c)}>
                  {c.img && <img src={c.img} alt="" loading="lazy" />}
                  <span className="go" aria-hidden="true">→</span>
                  <div className="ct"><h3>{c.name}</h3><small>{c.items.length} items</small></div>
                </Link>
              ))}
            </div>
          </div></section>
        )}

        {detail && <section className="sec"><div className="wrap">{detail}</div></section>}

        {ext === 'checkout' && <section className="sec"><div className="wrap"><Checkout /></div></section>}
        {ext === 'account' && <section className="sec"><div className="wrap"><Account slug={t.slug} /></div></section>}
        {ext === 'track' && <section className="sec"><div className="wrap narrow"><span className="eyebrow center">Order status</span><h2>Track your order</h2><p className="sub">Enter your order number and the mobile number you used.</p><TrackOrder slug={t.slug} preview={preview} /></div></section>}
        {ext === 'complaint' && <section className="sec"><div className="wrap"><span className="eyebrow center">We are listening</span><h2>Submit your complaint</h2><p className="sub">From complaint to care — tell us what went wrong and we will make it right.</p><ComplaintForm slug={t.slug} preview={preview} /></div></section>}
        {ext === 'locations' && (
          <section className="sec"><div className="wrap">
            <span className="eyebrow center">Find us</span><h2>Our locations</h2>
            <div className="loc-cards">
              {(site.branches || []).map((b) => <div className="box" key={b.id}><h3>{b.name}</h3>{b.address && <p>📍 {b.address}</p>}{b.phone && <p>📞 <a href={`tel:${b.phone}`}>{b.phone}</a></p>}</div>)}
              {!site.branches?.length && <p className="muted center">Locations coming soon.</p>}
            </div>
            {(site.locations || []).length > 0 && <><h3 style={{ marginTop: 36 }}>We deliver to</h3>{site.locations.map((c) => <p key={c.city}><strong>{c.city}:</strong> <span className="muted">{c.areas.map((a) => a.name).join(' · ')}</span></p>)}</>}
          </div></section>
        )}

        {!showAll && !detail && !ext && current && !['about', 'gallery', 'contact', menuSlug].includes(current) && !custom && (
          <section className="sec"><div className="wrap center"><h2>Page not found</h2><Link className="cta" href={href('')}>Back to home</Link></div></section>
        )}

        {custom && (
          <section className="sec"><div className="wrap narrow">
            <h2>{custom.title}</h2>
            {custom.sections.map((s, i) => (
              <div key={i} style={{ margin: '28px 0' }}>
                {s.heading && s.heading !== custom.title && <h3 className="center">{s.heading}</h3>}
                {s.image && <img src={s.image} alt="" className="page-img" />}
                {bodyParas(s.body).map((p, k) => <p key={k} className="lead">{p}</p>)}
              </div>
            ))}
          </div></section>
        )}

        {sec.about && t.about && show('about') && (
          <section className="sec alt" id="about"><div className="wrap">
            <div className={`about-grid ${site.gallery[0] ? '' : 'solo'}`}>
              {site.gallery[0] && <div className="about-media"><img className="about-img" src={site.gallery[0].url} alt={t.name} loading="lazy" /></div>}
              <div>
                <span className="eyebrow">Our story</span><h2 style={{ textAlign: 'left' }}>About {t.name}</h2>
                {bodyParas(t.about).map((p, k) => <p key={k} className="lead left">{p}</p>)}
                <div className="stats-row">
                  {allItems.length > 0 && <div><strong>{allItems.length}+</strong><span>{label}</span></div>}
                  {(site.branches?.length || 0) > 0 && <div><strong>{site.branches.length}</strong><span>{site.branches.length === 1 ? 'Branch' : 'Branches'}</span></div>}
                  {(site.locations?.length || 0) > 0 && <div><strong>{site.locations.length}</strong><span>{site.locations.length === 1 ? 'City' : 'Cities'}</span></div>}
                  {reviews?.count > 0 && <div><strong>{reviews.avg}★</strong><span>{reviews.count} reviews</span></div>}
                </div>
              </div>
            </div>
          </div></section>
        )}

        {sec.menu && current === menuSlug && !detail && (
          <section className="sec" id={menuSlug}><div className="wrap">
            <span className="eyebrow center">{isStore ? 'Shop' : 'Our food'}</span>
            <h2>{isStore ? 'Our Products' : 'Our Menu'}</h2>
            {t.branding?.tagline && <p className="sub">{t.branding.tagline}</p>}
            {useCatalog ? <StoreCatalog menu={site.menu} features={features} preview={preview} /> : <RestaurantMenu menu={site.menu} itemHref={itemHref} />}
          </div></section>
        )}

        {showAll && reviews?.count > 0 && (
          <section className="sec"><div className="wrap">
            <span className="eyebrow center">Reviews</span><h2>Loved by our customers</h2>
            <div className="rev-top"><div className="rev-avg">{reviews.avg}</div><div><Stars value={reviews.avg} /><div className="muted">Based on {reviews.count} verified orders</div></div></div>
            <div className="rev-grid">
              {reviews.items.map((r, k) => (
                <article className="rev" key={k}>
                  <Stars value={r.rating} />
                  {r.comment && <p>“{r.comment}”</p>}
                  {r.reply && <div className="reply"><strong>{t.name}:</strong> {r.reply}</div>}
                  <footer><span className="av">{String(r.name || '?').charAt(0).toUpperCase()}</span><span><strong>{r.name}</strong> · Verified order</span></footer>
                </article>
              ))}
            </div>
          </div></section>
        )}

        {sec.gallery && site.gallery.length > 0 && show('gallery') && (
          <section className="sec alt" id="gallery"><div className="wrap">
            <span className="eyebrow center">Gallery</span><h2>A taste of {t.name}</h2><p className="sub">Moments from our kitchen and tables</p>
            <Gallery images={site.gallery} alt={t.name} />
          </div></section>
        )}

        {showAll && sec.menu && (
          <section className="sec" style={{ paddingTop: 0 }}><div className="wrap">
            <div className="cta-band">
              <div><h2>{features.cart ? 'Hungry? We deliver.' : `Discover ${t.name}`}</h2><p>{features.cart ? `Fresh, hot and at your door${site.ordering?.etaMinutes ? ` in about ${site.ordering.etaMinutes} minutes` : ''}.` : t.branding?.tagline}</p></div>
              <Link className="cta lg" href={href(menuSlug)}>{features.cart ? 'Order now' : `View ${label}`} →</Link>
            </div>
          </div></section>
        )}

        {sec.contact && show('contact') && (
          <section className="sec" id="contact"><div className="wrap">
            <span className="eyebrow center">Contact</span><h2>Visit or message us</h2><p className="sub">We&apos;d love to hear from you</p>
            <div className="contact-grid">
              <div className="box">
                <h3>Get in touch</h3>
                {t.contact?.phone && <p>📞 <a href={`tel:${t.contact.phone}`}>{t.contact.phone}</a></p>}
                {t.contact?.email && <p>✉️ <a href={`mailto:${t.contact.email}`}>{t.contact.email}</a></p>}
                {t.contact?.address && <p>📍 {t.contact.address}{t.contact.map && <> — <a href={t.contact.map} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>Open map</a></>}</p>}
                <h3 style={{ marginTop: 22 }}>Opening hours</h3>
                <Hours hours={t.openingHours} />
              </div>
              <div className="box"><h3>Send us a message</h3><ContactForm slug={t.slug} preview={preview} /></div>
            </div>
          </div></section>
        )}
      </main>

      {t.socials?.whatsapp && !preview && (
        <a className="wa-fab" href={`https://wa.me/${String(t.socials.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">💬 WhatsApp</a>
      )}
      <footer className="site-footer">
        <div className="wrap foot-grid">
          <div>
            <div className="site-logo light">{t.branding?.logo && <img src={t.branding.logo} alt="" />}<span className="logo-text">{t.name}</span></div>
            <p style={{ opacity: .75, marginTop: 14, maxWidth: 320 }}>{t.branding?.tagline}</p>
            <div className="socials">{Object.entries(t.socials || {}).filter(([, v]) => v).map(([k, v]) => <Social key={k} k={k} v={v} />)}</div>
          </div>
          <div><h4>Explore</h4>{nav.slice(0, 6).map((n) => <Link key={n.slug} href={n.href}>{n.title}</Link>)}</div>
          <div><h4>Help</h4>
            {!preview && features.orderTracking && features.cart && <Link href={`/${t.slug}/track`}>Track order</Link>}
            {!preview && features.accounts && features.cart && <Link href={`/${t.slug}/account`}>My account</Link>}
            {!preview && features.complaints && <Link href={`/${t.slug}/complaint`}>Submit a complaint</Link>}
            {!preview && (site.branches?.length > 0 || site.locations?.length > 0) && <Link href={`/${t.slug}/locations`}>Our locations</Link>}
            {!preview && <Link href={`/${t.slug}/login`}>Staff login</Link>}</div>
          <div><h4>Contact</h4>
            {t.contact?.phone && <a href={`tel:${t.contact.phone}`}>{t.contact.phone}</a>}{t.contact?.email && <a href={`mailto:${t.contact.email}`}>{t.contact.email}</a>}{t.contact?.address && <span>{t.contact.address}</span>}
          </div>
        </div>
        <div className="wrap copy"><span>© {new Date().getFullYear()} {t.name}. All rights reserved.</span><span className="powered">Powered by SiteForge</span></div>
      </footer>
    </OrderingProvider>
    </div>
  );
}

export { Dish };
