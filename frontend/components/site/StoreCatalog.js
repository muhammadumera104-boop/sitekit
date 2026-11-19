'use client';
import { useEffect, useState } from 'react';
import { money } from '@/lib/util';
import { useOrdering } from './Ordering';

// Price block: shows the sale price and the struck-through original when the Discounts feature is on for this store.
export function Price({ i }) {
  if (!(i.discountPercent > 0)) return <span className="price">{money(i.price)}</span>;
  return <span className="price-wrap"><span className="price">{money(i.salePrice)}</span><s className="was">{money(i.price)}</s></span>;
}

export const Stars = ({ value = 0 }) => (
  <span className="stars" aria-label={`${value} out of 5`}>{'★'.repeat(Math.round(value))}<span style={{ opacity: .25 }}>{'★'.repeat(5 - Math.round(value))}</span></span>
);

// Item popup: description, options / add-ons, special instructions, quantity and "Add to cart".
export function ItemModal({ item, onClose }) {
  const o = useOrdering();
  const groups = item.optionGroups || [];
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [sel, setSel] = useState(() => Object.fromEntries(groups.map((g) => [g.id, g.required && !g.multiple && g.options[0] ? [g.options[0].id] : []])));
  const [err, setErr] = useState('');
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const cartOn = o.cartOn && !o.preview;
  const toggle = (g, opt) => setSel((s) => {
    const cur = s[g.id] || [];
    if (!g.multiple) return { ...s, [g.id]: [opt.id] };
    if (cur.includes(opt.id)) return { ...s, [g.id]: cur.filter((x) => x !== opt.id) };
    if (g.max && cur.length >= g.max) return s;
    return { ...s, [g.id]: [...cur, opt.id] };
  });
  const extra = groups.reduce((sum, g) => sum + (sel[g.id] || []).reduce((a, id) => a + (g.options.find((x) => x.id === id)?.price || 0), 0), 0);
  const unit = item.salePrice + extra;

  function add() {
    for (const g of groups) {
      const n = (sel[g.id] || []).length;
      if ((g.required && n < 1) || (g.min && n < g.min)) return setErr(`Please choose ${g.name.toLowerCase()}`);
    }
    const options = groups.flatMap((g) => (sel[g.id] || []).map((id) => ({ groupId: g.id, optionId: id })));
    o.add(item.id, qty, note, options);
    onClose();
  }
  return (
    <div className="im-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im" role="dialog" aria-modal="true" aria-label={item.name}>
        <div className="im-img">{item.image ? <img src={item.image} alt={item.name} /> : <div className="ph" aria-hidden="true">🍽️</div>}
          {item.discountPercent > 0 && <span className="ribbon sale">{item.discountPercent}% OFF</span>}</div>
        <div className="im-body">
          <button className="im-x" onClick={onClose} aria-label="Close">✕</button>
          <h3>{item.name}</h3>
          {item.rating?.count > 0 && <div className="row" style={{ gap: 6, margin: '2px 0' }}><Stars value={item.rating.avg} /><small className="muted">{item.rating.avg} ({item.rating.count})</small></div>}
          <div style={{ fontSize: 22, margin: '4px 0 10px' }}><Price i={item} /></div>
          {item.description && <p className="muted" style={{ margin: '0 0 12px' }}>{item.description}</p>}
          {item.lowStock && <p className="low-stock">Only {item.lowStock} left!</p>}
          {cartOn && item.isAvailable && (
            <>
              {groups.map((g) => (
                <fieldset className="opt-group" key={g.id}>
                  <legend>{g.name}{g.required ? <em>Required</em> : <em>Optional</em>}{g.multiple && g.max ? <small> · up to {g.max}</small> : null}</legend>
                  {g.options.map((opt) => {
                    const on = (sel[g.id] || []).includes(opt.id);
                    return (
                      <label key={opt.id} className={`opt ${on ? 'on' : ''} ${opt.color ? 'swatch' : ''}`}>
                        <input type={g.multiple ? 'checkbox' : 'radio'} name={g.id} checked={on} onChange={() => { toggle(g, opt); setErr(''); }} />
                        {opt.color && <i className="sw" style={{ background: opt.color }} aria-hidden="true" />}
                        <span>{opt.name}</span><b>{opt.price > 0 ? `+ ${money(opt.price)}` : ''}</b>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
              <label className="im-label" htmlFor="im-note">Special instructions</label>
              <textarea id="im-note" rows={2} maxLength={500} placeholder="Please enter instructions about this item" value={note} onChange={(e) => setNote(e.target.value)} />
              {err && <div className="alert error" style={{ marginTop: 8 }}>{err}</div>}
              <div className="im-foot">
                <div className="qty2"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less">−</button><b>{qty}</b><button onClick={() => setQty(Math.min(99, qty + 1))} aria-label="More">+</button></div>
                <button className="cta" onClick={add}>{money(unit * qty)} · Add to cart</button>
              </div>
            </>
          )}
          {!item.isAvailable && <p className="sold">Currently unavailable</p>}
        </div>
      </div>
    </div>
  );
}

function Card({ i, cartOn, onOpen }) {
  const o = useOrdering();
  const wished = (o.wish || []).includes(i.id);
  const inCart = Object.values(o.cart || {}).filter((l) => l.id === i.id).reduce((s, l) => s + l.qty, 0);
  const hasOptions = i.optionGroups?.length > 0;
  return (
    <div className="p-card">
      <button className="p-img" onClick={() => onOpen(i)} aria-label={`View ${i.name}`}>
        {i.image ? <img src={i.image} alt={i.name} loading="lazy" /> : <div className="ph" aria-hidden="true">🍽️</div>}
        {!i.isAvailable ? <span className="ribbon">Sold out</span> : i.discountPercent > 0 && <span className="ribbon sale">{i.discountPercent}% OFF</span>}
        {i.rating?.count > 0 && <span className="rating-chip">★ {i.rating.avg}</span>}
      </button>
      {o.toggleWish && !o.preview && <button className={`heart ${wished ? 'on' : ''}`} onClick={() => o.toggleWish(i.id)} aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={wished}>{wished ? '♥' : '♡'}</button>}
      <div className="b">
        <h4><button className="linkish" onClick={() => onOpen(i)}>{i.name}</button></h4>
        <p>{i.description}</p>
        {i.lowStock && <small className="low-stock">Only {i.lowStock} left!</small>}
        <div className="row between"><Price i={i} />
          {!i.isAvailable ? <span className="sold">Sold out</span> : cartOn ? (
            hasOptions ? <button className="opt-btn" onClick={() => onOpen(i)}>Choose options</button>
            : inCart === 0
              ? <button className="add-btn" onClick={() => o.add(i.id, 1)} aria-label={`Add ${i.name}`}>+</button>
              : <div className="qty2"><button onClick={() => o.addToLine(i.id, -1)} aria-label="Less">−</button><b>{inCart}</b><button onClick={() => o.add(i.id, 1)} aria-label="More">+</button></div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Horizontal "popular right now" row for the home page.
export function Featured({ items, preview, grid }) {
  const o = useOrdering();
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className={grid ? 'p-grid' : 'feat-scroll'}>{items.map((i) => <Card key={i.id} i={i} cartOn={!!o.cartOn && !preview} onOpen={setOpen} />)}</div>
      {open && <ItemModal item={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// Product catalog, driven by the store's feature toggles (search, cart, discounts...).
export default function StoreCatalog({ menu, features = {}, preview }) {
  const o = useOrdering();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [sale, setSale] = useState(false);
  const cartOn = !!features.cart && !preview;
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const c = sp.get('cat'); if (c && menu.some((m) => m.id === c)) setCat(c);
      if (sp.get('q')) setQ(sp.get('q'));
      if (sp.get('sale')) setSale(true);
    } catch { /* ignore */ }
  }, [menu]);

  const all = menu.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name, cid: c.id })));
  const shown = all.filter((i) => (cat === 'all' || i.cid === cat) && (!sale || i.discountPercent > 0) && (!q || `${i.name} ${i.description}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="store-tools">
        {features.search && <input placeholder="Search the menu…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />}
        <div className="row cat-scroll">
          <button className={`chip ${cat === 'all' && !sale ? 'on' : ''}`} onClick={() => { setCat('all'); setSale(false); }}>All</button>
          {all.some((i) => i.discountPercent > 0) && <button className={`chip sale-chip ${sale ? 'on' : ''}`} onClick={() => { setSale(!sale); setCat('all'); }}>🔥 Sale</button>}
          {menu.map((c) => <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      </div>
      {shown.length === 0 && <p className="muted center">No items found.</p>}
      <div className="p-grid">{shown.map((i) => <Card key={i.id} i={i} cartOn={cartOn} onOpen={setOpen} />)}</div>
      {open && <ItemModal item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
