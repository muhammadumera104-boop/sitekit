'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { money } from '@/lib/util';

const Ctx = createContext(null);
export const useOrdering = () => useContext(Ctx) || {};

// Same maths as the server (backend/src/services/orders.js computeTotals); the server is the source of truth.
// itemsTotal is AFTER any promo discount.
export function computeTotals(itemsTotal, ordering = {}, deliveryFee = 0) {
  const pct = Number(ordering.taxPercent) || 0;
  const inclusive = ordering.taxInclusive !== false;
  const tax = !pct ? 0 : inclusive ? Math.round(itemsTotal - itemsTotal / (1 + pct / 100)) : Math.round((itemsTotal * pct) / 100);
  return { itemsTotal, tax, net: inclusive ? itemsTotal - tax : itemsTotal, deliveryFee, total: (inclusive ? itemsTotal : itemsTotal + tax) + deliveryFee };
}
// Promo maths, mirrored on the server.
export function promoDiscount(promo, itemsTotal) {
  if (!promo || itemsTotal <= 0 || itemsTotal < (promo.minOrder || 0)) return 0;
  let d = promo.type === 'percent' ? Math.floor((itemsTotal * promo.value) / 100) : promo.value;
  if (promo.maxDiscount > 0) d = Math.min(d, promo.maxDiscount);
  return Math.max(0, Math.min(d, itemsTotal));
}

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const lineKey = (id, options = []) => `${id}|${options.map((o) => o.optionId).sort().join(',')}`;

// Holds the customer's delivery location, cart, promo code and sign-in for one store, and renders the location picker + cart drawer.
export function OrderingProvider({ slug, menuSlug = 'menu', menu, features = {}, ordering = {}, locations = [], preview = false, children }) {
  const locOn = !!features.locations && locations.length > 0;
  const [loc, setLocState] = useState(null);
  const [cart, setCart] = useState({});
  const [promo, setPromoState] = useState(null);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [orderType, setOrderType] = useState('delivery');
  const [customer, setCustomer] = useState(null);
  const [ctoken, setCtoken] = useState(null);
  const onCheckout = /\/checkout\/?$/.test(usePathname() || '');

  useEffect(() => {
    const saved = read(`loc:${slug}`, null);
    // Forget a saved area that the store has since removed.
    const valid = saved && locations.some((c) => c.areas.some((a) => a.id === saved.areaId));
    setLocState(valid ? saved : null);
    const raw = read(`cart3:${slug}`, null) || {};
    setCart(raw);
    setPromoState(read(`promo:${slug}`, null));
    setReady(true);
    if (locOn && !valid && !preview && features.cart) setPickerOpen(true);
    const t = read(`ctoken:${slug}`, null);
    if (t) {
      setCtoken(t);
      fetch(`/api/customer/me`, { headers: { Authorization: `Bearer ${t}`, 'X-Store': slug } })
        .then(async (r) => { if (r.ok) setCustomer((await r.json()).customer); else { write(`ctoken:${slug}`, null); setCtoken(null); } })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  useEffect(() => { if (ready) write(`cart3:${slug}`, cart); }, [cart, ready, slug]);

  const setLoc = useCallback((l) => { setLocState(l); write(`loc:${slug}`, l); }, [slug]);
  const setPromo = useCallback((p) => { setPromoState(p); write(`promo:${slug}`, p); }, [slug]);
  const signIn = useCallback((token, c) => { write(`ctoken:${slug}`, token); setCtoken(token); setCustomer(c); }, [slug]);
  const signOut = useCallback(() => { write(`ctoken:${slug}`, null); setCtoken(null); setCustomer(null); }, [slug]);
  const area = useMemo(() => (loc ? locations.flatMap((c) => c.areas.map((a) => ({ ...a, city: c.city }))).find((a) => a.id === loc.areaId) || null : null), [loc, locations]);

  const items = useMemo(() => Object.fromEntries(menu.flatMap((c) => c.items.map((i) => [i.id, { ...i, category: c.name }]))), [menu]);
  // A cart line = item + chosen options. Prices are re-read from the live menu every time.
  const lines = Object.entries(cart).map(([key, l]) => {
    const it = items[l.id];
    if (!it || !it.isAvailable) return null;
    const chosen = (l.options || []).map((sel) => {
      const g = it.optionGroups?.find((x) => x.id === sel.groupId);
      const opt = g?.options.find((x) => x.id === sel.optionId);
      return g && opt ? { groupId: g.id, optionId: opt.id, group: g.name, name: opt.name, price: opt.price || 0 } : null;
    }).filter(Boolean);
    const extra = chosen.reduce((s, c) => s + c.price, 0);
    return { ...it, key, qty: l.qty, note: l.note || '', chosen, unit: it.salePrice + extra, listUnit: it.price + extra };
  }).filter(Boolean);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit, 0);
  const saved = lines.reduce((s, l) => s + l.qty * (l.listUnit - l.unit), 0);
  const promoOff = promoDiscount(promo, subtotal);
  const itemsTotal = subtotal - promoOff;
  const fee = orderType === 'delivery' && area ? area.deliveryFee : 0;
  const totals = computeTotals(itemsTotal, ordering, fee);
  const minOrder = orderType === 'delivery' ? Math.max(area?.minOrder || 0, ordering.minOrder || 0) : 0;

  const add = (id, qty = 1, note, options = []) => setCart((c) => {
    const key = lineKey(id, options);
    const cur = c[key] || { id, qty: 0, options };
    const q = cur.qty + qty;
    if (q <= 0) { const n = { ...c }; delete n[key]; return n; }
    return { ...c, [key]: { ...cur, qty: Math.min(q, 99), note: note !== undefined && note !== '' ? note : cur.note } };
  });
  const addToLine = (id, delta) => setCart((c) => {
    const key = Object.keys(c).find((k) => c[k].id === id);
    if (!key) return c;
    const q = c[key].qty + delta;
    if (q <= 0) { const n = { ...c }; delete n[key]; return n; }
    return { ...c, [key]: { ...c[key], qty: Math.min(q, 99) } };
  });
  const changeQty = (key, delta) => setCart((c) => {
    if (!c[key]) return c;
    const q = c[key].qty + delta;
    if (q <= 0) { const n = { ...c }; delete n[key]; return n; }
    return { ...c, [key]: { ...c[key], qty: Math.min(q, 99) } };
  });
  const setNote = (key, note) => setCart((c) => (c[key] ? { ...c, [key]: { ...c[key], note } } : c));
  // Re-fill the cart from a past order (Reorder).
  const reorder = (orderLines) => {
    const next = {};
    for (const l of orderLines) {
      if (!items[l.itemId]) continue;
      const options = (l.options || []).filter((o) => items[l.itemId].optionGroups?.some((g) => g.id === o.groupId && g.options.some((x) => x.id === o.optionId)));
      next[lineKey(l.itemId, options)] = { id: l.itemId, qty: l.qty, note: l.note || '', options };
    }
    setCart(next); setDrawer(true);
  };
  const clear = () => { setCart({}); setPromo(null); };

  const value = {
    slug, menuSlug, features, ordering, locations, preview, locOn, loc, area, setLoc, openLocation: () => setPickerOpen(true), ready,
    cart, lines, count, subtotal, itemsTotal, saved, promo, setPromo, promoOff, totals, minOrder, add, addToLine, changeQty, setNote, clear, reorder,
    orderType, setOrderType, customer, ctoken, signIn, signOut, setCustomer,
    openCart: () => setDrawer(true), closeCart: () => setDrawer(false), cartOn: !!features.cart,
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {pickerOpen && locOn && <LocationModal onClose={loc ? () => setPickerOpen(false) : undefined} onPick={(l) => { setLoc(l); setPickerOpen(false); }} locations={locations} current={loc} />}
      {features.cart && <CartDrawer open={drawer} onClose={() => setDrawer(false)} />}
      {features.cart && count > 0 && !drawer && !preview && !onCheckout && (
        <button className="cart-fab" onClick={() => setDrawer(true)}>🛒 View cart ({count}) · {money(subtotal)}</button>
      )}
    </Ctx.Provider>
  );
}

const CITY_ICON = { karachi: '🕌', lahore: '🏰', islamabad: '⛰️', hyderabad: '🗼', multan: '🕌', rawalpindi: '🏙️', faisalabad: '🏭', sialkot: '⚽' };

export function LocationModal({ locations, current, onPick, onClose }) {
  // Start on the saved city, otherwise on the city with the most areas (usually the main market).
  const biggest = [...locations].sort((a, b) => b.areas.length - a.areas.length)[0]?.city;
  const [city, setCity] = useState(current ? locations.find((c) => c.areas.some((a) => a.id === current.areaId))?.city : biggest);
  const [areaId, setAreaId] = useState(current?.areaId || '');
  const [q, setQ] = useState('');
  const areas = (locations.find((c) => c.city === city)?.areas || []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = areas.find((a) => a.id === areaId);
  return (
    <div className="loc-bg" role="dialog" aria-modal="true" aria-label="Select your location">
      <div className="loc-modal">
        <div className="loc-head">
          <span>📍 Where should we deliver?</span>
          {onClose && <button className="loc-x" onClick={onClose} aria-label="Close">✕</button>}
        </div>
        <div className="loc-body">
          <p className="loc-label">Please select your city</p>
          <div className="city-grid">
            {locations.map((c) => (
              <button key={c.city} className={`city ${city === c.city ? 'on' : ''}`} onClick={() => { setCity(c.city); setAreaId(''); setQ(''); }}>
                <span className="ico">{CITY_ICON[c.city.toLowerCase()] || '🏙️'}</span>{c.city}
              </button>
            ))}
          </div>
          <p className="loc-label">Please select your location</p>
          <input className="loc-search" placeholder="Search your area…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search area" />
          <div className="area-list" role="listbox" aria-label="Areas">
            {areas.length === 0 && <div className="muted" style={{ padding: 12 }}>No areas found.</div>}
            {areas.map((a) => (
              <button key={a.id} role="option" aria-selected={areaId === a.id} className={`area ${areaId === a.id ? 'on' : ''}`} onClick={() => setAreaId(a.id)}>
                <span>{a.name}</span><small>{a.deliveryFee ? `Delivery ${money(a.deliveryFee)}` : 'Free delivery'}</small>
              </button>
            ))}
          </div>
          <button className="cta loc-go" disabled={!chosen} onClick={() => onPick({ city, areaId, areaName: chosen.name })}>Select</button>
        </div>
      </div>
    </div>
  );
}

export function CartDrawer({ open, onClose }) {
  const o = useOrdering();
  if (!open) return null;
  const { lines, changeQty, totals, ordering, saved, minOrder, subtotal, slug, area, loc, locOn, preview, promoOff, promo } = o;
  const tax = ordering.taxPercent > 0;
  const short = minOrder > o.itemsTotal;
  return (
    <div className="drawer-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label="Your cart">
        <div className="drawer-head"><strong>🛒 Your cart</strong><button onClick={onClose} aria-label="Close cart">✕</button></div>
        <div className="drawer-body">
          {locOn && <button className="loc-chip" onClick={() => { onClose(); o.openLocation(); }}>📍 {loc ? `${loc.areaName}, ${loc.city}` : 'Select your location'} <u>Change</u></button>}
          {lines.length === 0 && <p className="muted center" style={{ margin: '40px 0' }}>Your cart is empty.</p>}
          {lines.map((l) => (
            <div className="cart-line2" key={l.key}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">{l.name}</div>
                {l.chosen.length > 0 && <div className="muted sm">{l.chosen.map((c) => c.name).join(' · ')}</div>}
                <div className="muted sm">{money(l.unit)}{l.listUnit > l.unit && <> <s>{money(l.listUnit)}</s></>}</div>
                <input className="note" placeholder="Special instructions" maxLength={500} value={l.note} onChange={(e) => o.setNote(l.key, e.target.value)} aria-label={`Instructions for ${l.name}`} />
              </div>
              <div className="qty2"><button onClick={() => changeQty(l.key, -1)} aria-label="Less">−</button><b>{l.qty}</b><button onClick={() => changeQty(l.key, 1)} aria-label="More">+</button></div>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div className="drawer-foot">
            {promoOff > 0 && <div className="sum save"><span>Promo {promo?.code}</span><span>− {money(promoOff)}</span></div>}
            <div className="sum"><span>Total</span><span>{money(totals.net)}</span></div>
            {tax && <div className="sum"><span>{ordering.taxLabel || 'Tax'} ({ordering.taxPercent}%)</span><span>{money(totals.tax)}</span></div>}
            <div className="sum"><span>Delivery fee</span><span>{area ? (totals.deliveryFee ? money(totals.deliveryFee) : 'Free') : '—'}</span></div>
            {saved > 0 && <div className="sum save"><span>You save</span><span>{money(saved)}</span></div>}
            <div className="sum grand"><span>Grand total</span><span>{money(totals.total)}</span></div>
            {short && <div className="alert error" style={{ marginTop: 8 }}>Minimum order is {money(minOrder)} — add {money(minOrder - o.itemsTotal)} more.</div>}
            {preview ? <div className="alert info" style={{ marginTop: 8 }}>Preview mode</div>
              : <Link className={`cta co-btn ${short ? 'off' : ''}`} href={short ? '#' : `/${slug}/checkout`} onClick={(e) => { if (short) e.preventDefault(); else onClose(); }}>Checkout →</Link>}
          </div>
        )}
      </aside>
    </div>
  );
}
