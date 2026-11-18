'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { FONTS, defaultHours, parseImport } from '@/lib/util';
import { Alert, Field, ImageField, useLoad } from '@/components/ui';
import SiteView from '@/components/site/SiteView';

const STEPS = ['Basic info', 'Branding', 'Template', 'Content', 'Business data', 'Review'];
const TYPES = ['restaurant', 'bakery', 'food', 'store', 'services', 'other'];

const initial = {
  name: '', slug: '', businessType: 'restaurant', templateKey: 'restaurant',
  owner: { name: '', email: '', phone: '' },
  branding: { logo: '', favicon: '', tagline: '' },
  theme: { primary: '#c0392b', secondary: '#2c3e50', fontHeading: 'Georgia, serif', fontBody: 'system-ui, sans-serif', radius: '10px' },
  hero: { title: '', subtitle: '', image: '' }, about: '',
  contact: { phone: '', email: '', address: '', map: '' },
  socials: { facebook: '', instagram: '', twitter: '', whatsapp: '', youtube: '' },
  openingHours: defaultHours(),
  sections: { about: true, menu: true, gallery: true, contact: true },
  seo: { title: '', description: '', ogImage: '' },
  categories: [],
};

// Turn wizard state into the shape SiteView expects, for the live preview.
const toSite = (f, template) => ({
  tenant: { ...f, id: 'draft', status: 'draft', slug: f.slug || 'preview' },
  template: template && { key: template.key, name: template.name, dataSchema: template.dataSchema },
  nav: [], pages: [], gallery: [],
  menu: f.categories.map((c, ci) => ({ id: `c${ci}`, name: c.name || 'Category', items: (c.items || []).map((i, ii) => ({ id: `i${ci}-${ii}`, ...i, price: Number(i.price) || 0, isAvailable: i.isAvailable !== false })) })),
});

export default function NewTenant() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState({ checking: false, ok: null, reason: '' });
  const [stepErr, setStepErr] = useState('');
  const [serverErr, setServerErr] = useState({ message: '', errors: {} });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const templates = useLoad(() => api('/admin/templates'));
  const tpl = templates.data?.templates.find((t) => t.key === f.templateKey);

  const up = (path, value) => setF((s) => {
    const n = structuredClone(s); const keys = path.split('.'); let o = n;
    keys.slice(0, -1).forEach((k) => { o = o[k]; }); o[keys.at(-1)] = value; return n;
  });
  const bind = (path) => {
    const v = path.split('.').reduce((o, k) => o[k], f);
    return { value: v ?? '', onChange: (e) => up(path, e.target.value) };
  };

  // Auto-suggest slug from the name (FR-T8)
  useEffect(() => {
    if (!slugTouched) setF((s) => ({ ...s, slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) }));
  }, [f.name, slugTouched]);
  // Real-time uniqueness check (debounced)
  const seq = useRef(0);
  useEffect(() => {
    if (!f.slug) { setSlugState({ checking: false, ok: null, reason: '' }); return; }
    const mine = ++seq.current;
    setSlugState((s) => ({ ...s, checking: true }));
    const t = setTimeout(async () => {
      try { const d = await api(`/admin/tenants/check-slug?slug=${encodeURIComponent(f.slug)}`); if (mine === seq.current) setSlugState({ checking: false, ok: d.ok, reason: d.reason || '' }); }
      catch { if (mine === seq.current) setSlugState({ checking: false, ok: null, reason: '' }); }
    }, 350);
    return () => clearTimeout(t);
  }, [f.slug]);

  function validate(s) {
    if (s === 0) {
      if (f.name.trim().length < 2) return 'Business name is required.';
      if (!slugState.ok) return slugState.reason || 'Please wait for the slug check to finish.';
      if (f.owner.name.trim().length < 2) return 'Owner name is required.';
      if (!/^\S+@\S+\.\S+$/.test(f.owner.email)) return 'A valid owner email is required.';
    }
    if (s === 4) for (const c of f.categories) { if (!c.name.trim()) return 'Every category needs a name.'; for (const i of c.items || []) if (!i.name.trim()) return 'Every item needs a name.'; }
    return '';
  }
  const next = () => { const e = validate(step); setStepErr(e); if (!e) setStep(step + 1); };

  function selectTemplate(t) {
    up('templateKey', t.key);
    if (t.key === 'store' && f.businessType === 'restaurant') up('businessType', 'store');
  }

  async function create(status) {
    for (let s = 0; s < 5; s++) { const e = validate(s); if (e) { setStep(s); setStepErr(e); return; } }
    setBusy(true); setServerErr({ message: '', errors: {} });
    const clean = structuredClone(f);
    clean.categories = clean.categories.map((c) => ({ ...c, items: (c.items || []).map((i) => ({ ...i, price: Number(i.price) || 0 })) }));
    try {
      const d = await api('/admin/tenants', { method: 'POST', body: { ...clean, status } });
      setDone({ tenant: d.tenant, inviteLink: d.inviteLink, status });
    } catch (e) { setServerErr({ message: e.message, errors: e.errors || {} }); }
    setBusy(false);
  }

  const site = useMemo(() => toSite(f, tpl), [f, tpl]);

  if (done) {
    return (
      <div className="card center" style={{ maxWidth: 640, margin: '30px auto' }}>
        <div style={{ fontSize: 48 }}>🎉</div>
        <h2>{done.tenant.name} {done.status === 'active' ? 'is live!' : 'saved as draft'}</h2>
        {done.status === 'active' ? <p>Website available at <a href={`/${done.tenant.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', fontWeight: 700 }}>/{done.tenant.slug}</a></p> : <p className="muted">Publish it later from the tenant page.</p>}
        <p className="muted">An invitation email was sent to {f.owner.email}.</p>
        {done.inviteLink && <Alert type="info">Dev mode — invite link: <br /><a href={done.inviteLink} style={{ wordBreak: 'break-all' }}>{done.inviteLink}</a></Alert>}
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn primary" href={`/admin/tenants/${done.tenant._id}`}>Manage tenant</Link>
          <button className="btn" onClick={() => { setDone(null); setF(initial); setStep(0); setSlugTouched(false); }}>Add another</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head"><h1>Add new tenant</h1></div>
      <div className="steps">{STEPS.map((s, i) => <div key={s} className={`s ${i === step ? 'on' : i < step ? 'done' : ''}`}>{i < step ? '✓ ' : `${i + 1}. `}{s}</div>)}</div>
      <div className="card">
        <Alert>{stepErr}</Alert>

        {step === 0 && (
          <>
            <div className="grid2">
              <Field label="Business name *" {...bind('name')} placeholder="Kababjees" />
              <div className="field">
                <label>Slug (website address) *</label>
                <input value={f.slug} onChange={(e) => { setSlugTouched(true); up('slug', e.target.value.toLowerCase()); }} />
                {slugState.checking ? <small>Checking…</small> : slugState.ok === true ? <span className="ok-text">✓ /{f.slug} is available</span> : slugState.ok === false ? <span className="err">{slugState.reason}</span> : <small>localhost:3000/{f.slug || 'your-slug'}</small>}
              </div>
              <Field label="Business type"><select {...bind('businessType')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <span />
              <Field label="Owner name *" {...bind('owner.name')} />
              <Field label="Owner email *" type="email" {...bind('owner.email')} hint="The owner receives an invitation to set a password." />
              <Field label="Owner phone" {...bind('owner.phone')} />
            </div>
          </>
        )}

        {step === 1 && (
          <div className="grid2">
            <ImageField label="Logo" value={f.branding.logo} onChange={(v) => up('branding.logo', v)} />
            <ImageField label="Favicon" value={f.branding.favicon} onChange={(v) => up('branding.favicon', v)} />
            <Field label="Primary colour" type="color" {...bind('theme.primary')} />
            <Field label="Secondary colour" type="color" {...bind('theme.secondary')} />
            <Field label="Heading font"><select {...bind('theme.fontHeading')}>{FONTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
            <Field label="Body font"><select {...bind('theme.fontBody')}>{FONTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
            <div style={{ gridColumn: '1 / -1' }}><Field label="Tagline" {...bind('branding.tagline')} placeholder="Grilled to perfection" /></div>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="tpl-pick" style={{ marginBottom: 18 }}>
              {templates.data?.templates.filter((t) => t.status === 'enabled').map((t) => (
                <button type="button" key={t.key} className={f.templateKey === t.key ? 'on' : ''} onClick={() => selectTemplate(t)}>
                  <strong>{t.name}</strong><div className="muted" style={{ fontSize: 13 }}>{t.description}</div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>Data: {t.dataSchema?.itemLabel}{t.dataSchema?.cart ? ' + cart' : ''}</div>
                </button>
              ))}
            </div>
            <h3>Live preview</h3>
            <div className="preview-frame"><SiteView site={site} preview /></div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="grid2">
              <Field label="Hero title" {...bind('hero.title')} placeholder={f.name} />
              <Field label="Hero subtitle" {...bind('hero.subtitle')} />
              <ImageField label="Hero banner image" value={f.hero.image} onChange={(v) => up('hero.image', v)} />
              <span />
            </div>
            <Field label="About text"><textarea rows={4} {...bind('about')} /></Field>
            <h3>Contact</h3>
            <div className="grid2">
              <Field label="Phone" {...bind('contact.phone')} /><Field label="Email" type="email" {...bind('contact.email')} />
              <Field label="Address" {...bind('contact.address')} /><Field label="Map link" {...bind('contact.map')} placeholder="https://maps.google.com/…" />
            </div>
            <h3>Social links</h3>
            <div className="grid3">{['facebook', 'instagram', 'twitter', 'youtube', 'whatsapp'].map((k) => <Field key={k} label={k} {...bind(`socials.${k}`)} />)}</div>
            <h3>Opening hours</h3>
            {f.openingHours.map((h, i) => (
              <div className="row" key={h.day} style={{ marginBottom: 6 }}>
                <span style={{ width: 90 }}>{h.day}</span>
                <input type="time" value={h.open} disabled={h.closed} onChange={(e) => up(`openingHours.${i}.open`, e.target.value)} /> –
                <input type="time" value={h.close} disabled={h.closed} onChange={(e) => up(`openingHours.${i}.close`, e.target.value)} />
                <label><input type="checkbox" checked={!!h.closed} onChange={(e) => up(`openingHours.${i}.closed`, e.target.checked)} /> Closed</label>
              </div>
            ))}
            <h3>Visible sections</h3>
            <div className="row">{['about', 'menu', 'gallery', 'contact'].map((k) => <label key={k}><input type="checkbox" checked={f.sections[k]} onChange={(e) => up(`sections.${k}`, e.target.checked)} /> {k === 'menu' ? tpl?.dataSchema?.itemLabel || 'Menu' : k}</label>)}</div>
            <h3>SEO</h3>
            <div className="grid2"><Field label="Page title" {...bind('seo.title')} /><Field label="Meta description" {...bind('seo.description')} /></div>
          </>
        )}

        {step === 4 && <BusinessData f={f} setF={setF} label={tpl?.dataSchema?.itemLabel || 'Menu'} />}

        {step === 5 && (
          <>
            <Alert>{serverErr.message}{Object.entries(serverErr.errors).map(([k, v]) => <div key={k}>• {k}: {v}</div>)}</Alert>
            <div className="grid2">
              <div>
                <h3>Summary</h3>
                <table className="tbl"><tbody>
                  <tr><td className="muted">Business</td><td>{f.name} ({f.businessType})</td></tr>
                  <tr><td className="muted">URL</td><td>/{f.slug}</td></tr>
                  <tr><td className="muted">Template</td><td>{tpl?.name}</td></tr>
                  <tr><td className="muted">Owner</td><td>{f.owner.name} — {f.owner.email}</td></tr>
                  <tr><td className="muted">Colours</td><td><span style={{ background: f.theme.primary, padding: '2px 14px', borderRadius: 4 }} /> <span style={{ background: f.theme.secondary, padding: '2px 14px', borderRadius: 4 }} /></td></tr>
                  <tr><td className="muted">{tpl?.dataSchema?.itemLabel}</td><td>{f.categories.length} categories, {f.categories.reduce((s, c) => s + (c.items?.length || 0), 0)} items</td></tr>
                </tbody></table>
              </div>
              <div className="preview-frame" style={{ zoom: 0.4 }}><SiteView site={site} preview /></div>
            </div>
          </>
        )}

        <div className="row between" style={{ marginTop: 22 }}>
          <button className="btn" disabled={step === 0} onClick={() => { setStepErr(''); setStep(step - 1); }}>← Back</button>
          {step < 5 ? <button className="btn primary" onClick={next}>Next →</button> : (
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => create('draft')}>Save as draft</button>
              <button className="btn primary" disabled={busy} onClick={() => create('active')}>{busy ? 'Creating…' : 'Create & publish'}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function BusinessData({ f, setF, label }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const set = (fn) => setF((s) => { const n = structuredClone(s); fn(n.categories); return n; });
  const sample = 'category,name,description,price,image\nBBQ,Seekh Kabab,Spiced minced chicken,650,\nDrinks,Mint Margarita,Fresh mint and lemon,220,';

  function doImport() {
    try {
      const rows = parseImport(text);
      if (!rows.length) return setMsg('No valid rows found (need category and name columns).');
      set((cats) => rows.forEach((r) => {
        let c = cats.find((x) => x.name.toLowerCase() === r.category.toLowerCase());
        if (!c) { c = { name: r.category, items: [] }; cats.push(c); }
        c.items.push({ name: r.name, description: r.description, price: r.price, image: r.image, isAvailable: r.isAvailable });
      }));
      setMsg(`Imported ${rows.length} rows.`); setText('');
    } catch { setMsg('Could not parse the data. Use CSV with a header row or a JSON array.'); }
  }
  async function file(e) { const x = e.target.files?.[0]; if (x) setText(await x.text()); }

  return (
    <>
      <p className="muted">Add your {label.toLowerCase()} categories and items, or bulk-import from CSV/JSON. You can also do this later from the dashboard.</p>
      {f.categories.map((c, ci) => (
        <div key={ci} className="card" style={{ background: '#fafafa' }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <input value={c.name} placeholder="Category name" onChange={(e) => set((cs) => { cs[ci].name = e.target.value; })} style={{ flex: 1, padding: '9px 12px', border: '1px solid #d0d5dd', borderRadius: 8, fontWeight: 700 }} />
            <button className="btn sm danger" onClick={() => set((cs) => { cs.splice(ci, 1); })}>Remove</button>
          </div>
          {(c.items || []).map((it, ii) => (
            <div className="row" key={ii} style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
              <input placeholder="Item name" value={it.name} onChange={(e) => set((cs) => { cs[ci].items[ii].name = e.target.value; })} style={{ flex: 2, minWidth: 0, padding: 8, border: '1px solid #d0d5dd', borderRadius: 8 }} />
              <input placeholder="Description" value={it.description || ''} onChange={(e) => set((cs) => { cs[ci].items[ii].description = e.target.value; })} style={{ flex: 3, minWidth: 0, padding: 8, border: '1px solid #d0d5dd', borderRadius: 8 }} />
              <input placeholder="Price" type="number" min="0" value={it.price ?? ''} onChange={(e) => set((cs) => { cs[ci].items[ii].price = e.target.value; })} style={{ width: 90, padding: 8, border: '1px solid #d0d5dd', borderRadius: 8 }} />
              <button className="btn sm" onClick={() => set((cs) => { cs[ci].items.splice(ii, 1); })} aria-label="Remove item">✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => set((cs) => { (cs[ci].items ||= []).push({ name: '', description: '', price: '' }); })}>＋ Add item</button>
        </div>
      ))}
      <button className="btn" onClick={() => set((cs) => { cs.push({ name: '', items: [{ name: '', description: '', price: '' }] }); })}>＋ Add category</button>

      <h3 style={{ marginTop: 26 }}>Bulk import (CSV / JSON)</h3>
      <Alert type="info">{msg}</Alert>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={sample} style={{ width: '100%', padding: 10, border: '1px solid #d0d5dd', borderRadius: 8, fontFamily: 'monospace' }} />
      <div className="row" style={{ marginTop: 8 }}>
        <input type="file" accept=".csv,.json,text/csv,application/json" onChange={file} />
        <button className="btn sm primary" disabled={!text.trim()} onClick={doImport}>Import rows</button>
      </div>
    </>
  );
}
