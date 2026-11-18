'use client';
import { useEffect, useState } from 'react';
import { money } from '@/lib/util';
import { useOrdering } from './Ordering';

// Price block: shows the sale price and the struck-through original when the Discounts feature is on for this store.
export function Price({ i }) {
  if (!(i.discountPercent > 0)) return <span className="price">{money(i.price)}</span>;
  return <span className="price-wrap"><span className="price">{money(i.salePrice)}</span><s className="was">{money(i.price)}</s></span>;
}

// Item popup: description, special instructions, quantity and "Add to cart" (like the reference site).
function ItemModal({ item, onClose }) {
  const o = useOrdering();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const cartOn = o.cartOn && !o.preview;
  return (
    <div className="im-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im" role="dialog" aria-modal="true" aria-label={item.name}>
        <div className="im-img">{item.image ? <img src={item.image} alt={item.name} /> : <div className="ph" aria-hidden="true">🍽️</div>}
          {item.discountPercent > 0 && <span className="ribbon sale">{item.discountPercent}% OFF</span>}</div>
        <div className="im-body">
          <button className="im-x" onClick={onClose} aria-label="Close">✕</button>
          <h3>{item.name}</h3>
          <div style={{ fontSize: 22, margin: '4px 0 10px' }}><Price i={item} /></div>
          {item.description && <p className="muted" style={{ margin: '0 0 12px' }}>{item.description}</p>}
          {item.lowStock && <p className="low-stock">Only {item.lowStock} left!</p>}
          {cartOn && item.isAvailable && (
            <>
              <label className="im-label" htmlFor="im-note">Special instructions</label>
              <textarea id="im-note" rows={3} maxLength={500} placeholder="Please enter instructions about this item" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="im-foot">
                <div className="qty2"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less">−</button><b>{qty}</b><button onClick={() => setQty(Math.min(99, qty + 1))} aria-label="More">+</button></div>
                <button className="cta" onClick={() => { o.add(item.id, qty, note); onClose(); }}>{money(item.salePrice * qty)} · Add to cart</button>
              </div>
            </>
          )}
          {!item.isAvailable && <p className="sold">Currently unavailable</p>}
        </div>
      </div>
    </div>
  );
}

// Product catalog, driven by the store's feature toggles (search, cart, discounts...).
export default function StoreCatalog({ menu, features = {}, preview }) {
  const o = useOrdering();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const cartOn = !!features.cart && !preview;

  const all = menu.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name, cid: c.id })));
  const shown = all.filter((i) => (cat === 'all' || i.cid === cat) && (!q || `${i.name} ${i.description}`.toLowerCase().includes(q.toLowerCase())));
  const inCart = (id) => o.cart?.[id]?.qty || 0;

  return (
    <>
      <div className="store-tools">
        {features.search && <input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />}
        <div className="row cat-scroll">
          <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
          {menu.map((c) => <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      </div>
      {shown.length === 0 && <p className="muted center">No items found.</p>}
      <div className="p-grid">
        {shown.map((i) => (
          <div key={i.id} className="p-card">
            <button className="p-img" onClick={() => setOpen(i)} aria-label={`View ${i.name}`}>
              {i.image ? <img src={i.image} alt={i.name} loading="lazy" /> : <div className="ph" aria-hidden="true">🍽️</div>}
              {!i.isAvailable ? <span className="ribbon">Sold out</span> : i.discountPercent > 0 && <span className="ribbon sale">{i.discountPercent}% OFF</span>}
            </button>
            <div className="b">
              <h4><button className="linkish" onClick={() => setOpen(i)}>{i.name}</button></h4>
              <p>{i.description}</p>
              {i.lowStock && <small className="low-stock">Only {i.lowStock} left!</small>}
              <div className="row between"><Price i={i} />
                {!i.isAvailable ? <span className="sold">Sold out</span> : cartOn ? (
                  inCart(i.id) > 0
                    ? <div className="qty2"><button onClick={() => o.add(i.id, -1)} aria-label="Less">−</button><b>{inCart(i.id)}</b><button onClick={() => o.add(i.id, 1)} aria-label="More">+</button></div>
                    : <button className="add-btn" onClick={() => o.add(i.id, 1)} aria-label={`Add ${i.name}`}>+</button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      {open && <ItemModal item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
