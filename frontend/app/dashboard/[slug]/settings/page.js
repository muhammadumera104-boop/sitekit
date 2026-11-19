'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DAYS, FONTS } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Field, ImageField, Loading, useLoad } from '@/components/ui';

// datetime-local needs "YYYY-MM-DDTHH:mm" in the browser's time zone.
const toLocal = (d) => { const x = new Date(d); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };

const pick = (t) => ({
  name: t.name, theme: t.theme, branding: t.branding || {}, hero: t.hero || {}, about: t.about || '', contact: t.contact || {}, socials: t.socials || {},
  seo: t.seo || {}, sections: t.sections,
  announcement: { text: t.announcement?.text || '', enabled: t.announcement?.enabled !== false },
  slides: (t.slides || []).map((s) => ({ eyebrow: s.eyebrow || '', title: s.title || '', subtitle: s.subtitle || '', image: s.image || '', cta: s.cta || '', link: s.link || '' })),
  flashSale: { enabled: !!t.flashSale?.enabled, title: t.flashSale?.title || '', endsAt: t.flashSale?.endsAt ? toLocal(t.flashSale.endsAt) : '' },
  openingHours: DAYS.map((d) => t.openingHours?.find((h) => h.day === d) || { day: d, open: '09:00', close: '21:00', closed: false }),
});

export default function Settings() {
  const { slug, reload } = useTenant();
  const { data, loading, error } = useLoad(() => api('/tenant/settings', { tenant: slug }), [slug]);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const [tab, setTab] = useState('general');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(pick(data.tenant)); }, [data]);

  if (loading || !f) return <Loading />;
  const up = (path, v) => setF((s) => { const n = structuredClone(s); const k = path.split('.'); let o = n; k.slice(0, -1).forEach((x) => { o = o[x]; }); o[k.at(-1)] = v; return n; });
  const bind = (path) => ({ value: path.split('.').reduce((o, k) => o?.[k], f) ?? '', onChange: (e) => up(path, e.target.value), error: fe[path] });

  async function save(e) {
    e.preventDefault(); setBusy(true); setMsg(''); setErr(''); setFe({});
    const body = { ...f, flashSale: { ...f.flashSale, endsAt: f.flashSale.endsAt ? new Date(f.flashSale.endsAt).toISOString() : null }, slides: f.slides.filter((s) => s.title || s.image) };
    try { await api('/tenant/settings', { method: 'PUT', body, tenant: slug }); setMsg('Settings saved.'); reload(); } catch (x) { setErr(x.message); setFe(x.errors || {}); }
    setBusy(false);
  }
  const tabs = [['general', 'General'], ['theme', 'Theme'], ['content', 'Hero & about'], ['contact', 'Contact & social'], ['storefront', 'Storefront extras'], ['hours', 'Opening hours'], ['seo', 'Sections & SEO']];

  return (
    <Protected area="tenant" slug={slug} perm="settings.edit">
      <div className="page-head"><h1>Site settings</h1></div>
      <Alert>{error || err}{Object.entries(fe).map(([k, v]) => <div key={k}>{k}: {v}</div>)}</Alert><Alert type="success">{msg}</Alert>
      <form className="card" onSubmit={save}>
        <div className="tabs">{tabs.map(([k, l]) => <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

        {tab === 'general' && <div className="grid2">
          <Field label="Business name" {...bind('name')} required /><Field label="Tagline" {...bind('branding.tagline')} />
          <ImageField label="Logo" value={f.branding.logo} onChange={(v) => up('branding.logo', v)} uploadPath="/tenant/media" tenant={slug} />
          <ImageField label="Favicon" value={f.branding.favicon} onChange={(v) => up('branding.favicon', v)} uploadPath="/tenant/media" tenant={slug} />
        </div>}

        {tab === 'theme' && <div className="grid2">
          <Field label="Primary colour" type="color" {...bind('theme.primary')} /><Field label="Secondary colour" type="color" {...bind('theme.secondary')} />
          <Field label="Heading font"><select {...bind('theme.fontHeading')}>{FONTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
          <Field label="Body font"><select {...bind('theme.fontBody')}>{FONTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
          <Field label="Appearance" hint="Dark is the premium default. Light gives a bright, white storefront."><select {...bind('theme.mode')}><option value="dark">Dark (premium)</option><option value="light">Light</option></select></Field>
          <Field label="Corner radius"><select {...bind('theme.radius')}>{['0px', '4px', '10px', '18px', '28px'].map((r) => <option key={r}>{r}</option>)}</select></Field>
        </div>}

        {tab === 'content' && <>
          <div className="grid2"><Field label="Hero title" {...bind('hero.title')} /><Field label="Hero subtitle" {...bind('hero.subtitle')} /></div>
          <ImageField label="Hero banner image" value={f.hero.image} onChange={(v) => up('hero.image', v)} uploadPath="/tenant/media" tenant={slug} />
          <Field label="About text"><textarea rows={6} {...bind('about')} /></Field>
        </>}

        {tab === 'contact' && <>
          <div className="grid2"><Field label="Phone" {...bind('contact.phone')} /><Field label="Email" {...bind('contact.email')} /><Field label="Address" {...bind('contact.address')} /><Field label="Map link" {...bind('contact.map')} /></div>
          <h3>Social links</h3>
          <div className="grid3">{['facebook', 'instagram', 'twitter', 'youtube', 'whatsapp'].map((k) => <Field key={k} label={k} {...bind(`socials.${k}`)} />)}</div>
        </>}

        {tab === 'storefront' && <>
          <h3>Announcement bar</h3>
          <div className="grid2">
            <Field label="Text shown above the header" {...bind('announcement.text')} hint="e.g. Free delivery on orders over Rs. 5,000 — use code WELCOME10" />
            <Field label="Show it"><select value={f.announcement.enabled ? 'on' : 'off'} onChange={(e) => up('announcement.enabled', e.target.value === 'on')}><option value="on">Yes</option><option value="off">No</option></select></Field>
          </div>
          <h3>Flash sale countdown</h3>
          <div className="grid3">
            <Field label="Show it"><select value={f.flashSale.enabled ? 'on' : 'off'} onChange={(e) => up('flashSale.enabled', e.target.value === 'on')}><option value="off">No</option><option value="on">Yes</option></select></Field>
            <Field label="Title" {...bind('flashSale.title')} />
            <Field label="Ends at" type="datetime-local" {...bind('flashSale.endsAt')} />
          </div>
          <p className="muted" style={{ marginTop: -6 }}>Shows products that have a discount. Hides itself once the time is over.</p>
          <div className="row between"><h3 style={{ margin: 0 }}>Hero slides</h3><button type="button" className="btn sm" disabled={f.slides.length >= 6} onClick={() => up('slides', [...f.slides, { eyebrow: '', title: '', subtitle: '', image: '', cta: 'Shop now', link: 'products' }])}>＋ Add slide</button></div>
          <p className="muted">Big rotating banners on the home page. Leave empty to use the single hero from &ldquo;Hero &amp; about&rdquo;. Link example: <code>products</code> or <code>products?sale=1</code>.</p>
          {f.slides.map((s, i) => (
            <div className="card" key={i} style={{ marginBottom: 12 }}>
              <div className="row between"><strong>Slide {i + 1}</strong><button type="button" className="btn sm danger" onClick={() => up('slides', f.slides.filter((_, k) => k !== i))}>Remove</button></div>
              <div className="grid2">
                <Field label="Small label (eyebrow)" {...bind(`slides.${i}.eyebrow`)} /><Field label="Headline" {...bind(`slides.${i}.title`)} />
                <Field label="Subtitle" {...bind(`slides.${i}.subtitle`)} /><Field label="Button text" {...bind(`slides.${i}.cta`)} />
                <Field label="Button link" {...bind(`slides.${i}.link`)} />
              </div>
              <ImageField label="Image" value={s.image} onChange={(v) => up(`slides.${i}.image`, v)} uploadPath="/tenant/media" tenant={slug} />
            </div>
          ))}
        </>}

        {tab === 'hours' && f.openingHours.map((h, i) => (
          <div className="row" key={h.day} style={{ marginBottom: 8 }}>
            <span style={{ width: 90 }}>{h.day}</span>
            <input type="time" value={h.open || ''} disabled={h.closed} onChange={(e) => up(`openingHours.${i}.open`, e.target.value)} /> –
            <input type="time" value={h.close || ''} disabled={h.closed} onChange={(e) => up(`openingHours.${i}.close`, e.target.value)} />
            <label><input type="checkbox" checked={!!h.closed} onChange={(e) => up(`openingHours.${i}.closed`, e.target.checked)} /> Closed</label>
          </div>
        ))}

        {tab === 'seo' && <>
          <h3>Visible sections</h3>
          <div className="row" style={{ marginBottom: 18 }}>{['about', 'menu', 'gallery', 'contact'].map((k) => <label key={k}><input type="checkbox" checked={!!f.sections[k]} onChange={(e) => up(`sections.${k}`, e.target.checked)} /> {k}</label>)}</div>
          <h3>SEO</h3>
          <Field label="Page title" {...bind('seo.title')} /><Field label="Meta description" {...bind('seo.description')} />
          <ImageField label="Social sharing image (Open Graph)" value={f.seo.ogImage} onChange={(v) => up('seo.ogImage', v)} uploadPath="/tenant/media" tenant={slug} />
        </>}

        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>
    </Protected>
  );
}
