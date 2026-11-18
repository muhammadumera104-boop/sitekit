import Link from 'next/link';
import ContactForm from './ContactForm';
import StoreCatalog, { Price } from './StoreCatalog';
import SiteHeader from './SiteHeader';
import Gallery from './Gallery';
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

  const nav = [
    { slug: '', title: 'Home' },
    sec.menu && { slug: menuSlug, title: label },
    sec.about && t.about && { slug: 'about', title: 'About' },
    sec.gallery && site.gallery.length > 0 && { slug: 'gallery', title: 'Gallery' },
    ...site.nav.map((n) => ({ slug: n.slug, title: n.title })),
    sec.contact && { slug: 'contact', title: 'Contact' },
  ].filter(Boolean).map((n) => ({ ...n, href: href(n.slug) }));

  const showAll = !current && !detail;
  const show = (name) => !detail && (showAll || current === name);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayHours = t.openingHours?.find((h) => h.day === today);
  const custom = site.pages.find((p) => p.slug === current);
  const bodyParas = (txt) => String(txt || '').split(/\n{2,}/).filter(Boolean);

  return (
    <div className={`site t-${t.templateKey}`} style={style}>
      {preview && <div className="preview-bar">Preview — this is how your website looks{t.status !== 'active' ? ' (not published yet)' : ''}</div>}
      <SiteHeader name={t.name} logo={t.branding?.logo} home={href('')} nav={nav} current={current || ''} />

      <main>
        {showAll && (
          <>
            <section className="hero" id="top" style={t.hero?.image ? { backgroundImage: `url(${t.hero.image})` } : undefined}>
              <div className="wrap">
                {todayHours && !todayHours.closed && <span className="hero-badge">● Open today {todayHours.open} – {todayHours.close}</span>}
                <h1>{t.hero?.title || t.name}</h1>
                {(t.hero?.subtitle || t.branding?.tagline) && <p>{t.hero?.subtitle || t.branding?.tagline}</p>}
                <div className="hero-actions">
                  {sec.menu && <Link className="cta" href={href(menuSlug)}>{isStore ? 'Shop now' : `View ${label}`}</Link>}
                  {sec.contact && <Link className="cta alt" href={href('contact')}>Contact us</Link>}
                </div>
              </div>
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

        {detail && <section className="sec"><div className="wrap">{detail}</div></section>}

        {!showAll && !detail && current && !['about', 'gallery', 'contact', menuSlug].includes(current) && !custom && (
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
              {site.gallery[0] && <img className="about-img" src={site.gallery[0].url} alt={t.name} loading="lazy" />}
              <div><span className="eyebrow">Our story</span><h2 style={{ textAlign: 'left' }}>About {t.name}</h2>{bodyParas(t.about).map((p, k) => <p key={k} className="lead left">{p}</p>)}</div>
            </div>
          </div></section>
        )}

        {sec.menu && show(menuSlug) && (
          <section className="sec" id={menuSlug}><div className="wrap">
            <span className="eyebrow center">{isStore ? 'Shop' : 'Our food'}</span>
            <h2>{isStore ? 'Our Products' : 'Our Menu'}</h2>
            {t.branding?.tagline && <p className="sub">{t.branding.tagline}</p>}
            {useCatalog ? <StoreCatalog slug={t.slug} menu={site.menu} features={features} itemBase={menuSlug} preview={preview} /> : <RestaurantMenu menu={site.menu} itemHref={itemHref} />}
          </div></section>
        )}

        {sec.gallery && site.gallery.length > 0 && show('gallery') && (
          <section className="sec alt" id="gallery"><div className="wrap">
            <span className="eyebrow center">Gallery</span><h2>A taste of {t.name}</h2><p className="sub">Moments from our kitchen and tables</p>
            <Gallery images={site.gallery} alt={t.name} />
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
            <p style={{ opacity: .75, marginTop: 10 }}>{t.branding?.tagline}</p>
          </div>
          <div><h4>Explore</h4>{nav.slice(0, 6).map((n) => <Link key={n.slug} href={n.href}>{n.title}</Link>)}</div>
          <div><h4>Contact</h4>
            {t.contact?.phone && <span>{t.contact.phone}</span>}{t.contact?.email && <span>{t.contact.email}</span>}{t.contact?.address && <span>{t.contact.address}</span>}
            <div style={{ marginTop: 10 }}>{Object.entries(t.socials || {}).filter(([, v]) => v).map(([k, v]) => (
              <a key={k} className="soc" href={k === 'whatsapp' ? `https://wa.me/${String(v).replace(/\D/g, '')}` : v} target="_blank" rel="noopener noreferrer">{k}</a>
            ))}</div>
          </div>
        </div>
        <div className="copy">© {new Date().getFullYear()} {t.name}. All rights reserved.{!preview && <> · <Link href={`/${t.slug}/login`} style={{ opacity: .6 }}>Staff login</Link></>}</div>
      </footer>
    </div>
  );
}

export { Dish };
