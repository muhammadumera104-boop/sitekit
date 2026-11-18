'use client';
import { useEffect, useMemo, useState } from 'react';
import { money } from '@/lib/util';

// Price block: shows the sale price and a "% off" badge when the Discounts feature is on for this store.
export function Price({ i }) {
  if (!(i.discountPercent > 0)) return <span className="price">{money(i.price)}</span>;
  return <span className="price-wrap"><span className="price">{money(i.salePrice)}</span><s className="was">{money(i.price)}</s></span>;
}

// Product catalog, driven by the store's feature toggles:
//   features.search  -> search box        features.cart -> "Add" buttons + cart
//   features.onlineOrders -> checkout creates a real order (otherwise it is sent as a message to the owner)
export default function StoreCatalog({ slug, menu, features = {}, itemBase = 'products', preview }) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({});
  const [open, setOpen] = useState(false);
  const [cust, setCust] = useState({ name: '', phone: '', address: '' });
  const [status, setStatus] = useState({ busy: false, ok: '', error: '' });
  const key = `cart:${slug}`;
  const cartOn = !!features.cart;

  useEffect(() => { try { setCart(JSON.parse(localStorage.getItem(key)) || {}); } catch { /* ignore */ } }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(cart)); } catch { /* ignore */ } }, [cart, key]);

  const all = useMemo(() => menu.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name, cid: c.id }))), [menu]);
  const byId = Object.fromEntries(all.map((i) => [i.id, i]));
  const shown = all.filter((i) => (cat === 'all' || i.cid === cat) && (!q || `${i.name} ${i.description}`.toLowerCase().includes(q.toLowerCase())));
  const lines = cartOn ? Object.entries(cart).filter(([id]) => byId[id] && byId[id].isAvailable).map(([id, qty]) => ({ ...byId[id], qty })) : [];
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.salePrice, 0);
  const saved = lines.reduce((s, l) => s + l.qty * (l.price - l.salePrice), 0);
  const add = (id, d = 1) => setCart((c) => { const n = { ...c, [id]: (c[id] || 0) + d }; if (n[id] <= 0) delete n[id]; return n; });

  async function checkout(e) {
    e.preventDefault();
    if (preview) return setStatus({ busy: false, ok: 'Preview mode — orders are not sent.', error: '' });
    setStatus({ busy: true, ok: '', error: '' });
    try {
      let r; let okMsg;
      if (features.onlineOrders) {
        r = await fetch(`/api/public/tenants/${slug}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lines.map((l) => ({ id: l.id, qty: l.qty })), customer: cust }) });
      } else {
        const message = `ORDER REQUEST\n${lines.map((l) => `${l.qty} x ${l.name} (${money(l.salePrice)})`).join('\n')}\nTotal: ${money(total)}\nDelivery address: ${cust.address}`;
        r = await fetch(`/api/public/tenants/${slug}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cust.name, phone: cust.phone, message }) });
      }
      const d = await r.json();
      if (!r.ok) return setStatus({ busy: false, ok: '', error: d.errors ? Object.values(d.errors)[0] : d.message });
      okMsg = d.order ? `Order #${d.order.number} placed! Total ${money(d.order.total)} — pay on delivery. We will contact you shortly.` : 'Order request sent! We will contact you shortly.';
      setCart({}); setStatus({ busy: false, ok: okMsg, error: '' });
    } catch { setStatus({ busy: false, ok: '', error: 'Could not send order. Try again.' }); }
  }

  return (
    <>
      <div className="store-tools">
        {features.search && <input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />}
        <div className="row">
          <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
          {menu.map((c) => <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      </div>
      {shown.length === 0 && <p className="muted center">No products found.</p>}
      <div className="p-grid">
        {shown.map((i) => (
          <div key={i.id} className="p-card">
            <a href={preview ? undefined : `/${slug}/${itemBase}/${i.id}`} className="p-img">
              {i.image ? <img src={i.image} alt={i.name} loading="lazy" /> : <div className="ph" aria-hidden="true">🛒</div>}
              {!i.isAvailable ? <span className="ribbon">Sold out</span> : i.discountPercent > 0 && <span className="ribbon sale">{i.discountPercent}% OFF</span>}
            </a>
            <div className="b">
              <h4><a href={preview ? undefined : `/${slug}/${itemBase}/${i.id}`}>{i.name}</a></h4>
              <p>{i.description}</p>
              {i.lowStock && <small className="low-stock">Only {i.lowStock} left!</small>}
              <div className="row between"><Price i={i} />
                {!i.isAvailable ? <span className="sold">Sold out</span> : cartOn ? <button className="cta" style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => add(i.id)}>{i.discountPercent > 0 ? 'Add with discount' : 'Add'}</button> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
      {cartOn && count > 0 && !open && <button className="cart-fab" onClick={() => setOpen(true)}>🛒 Cart ({count}) · {money(total)}</button>}
      {cartOn && open && (
        <div className="cart-panel" role="dialog" aria-label="Shopping cart">
          <div className="hd row between"><strong>Your cart</strong><button className="btn ghost sm" onClick={() => setOpen(false)}>✕</button></div>
          <div className="ls">
            {status.ok && <div className="alert success">{status.ok}</div>}
            {lines.length === 0 && !status.ok && <p className="muted">Your cart is empty.</p>}
            {lines.map((l) => (
              <div className="cart-line" key={l.id}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{l.name}</div><div className="muted" style={{ fontSize: 13 }}>{money(l.salePrice)}{l.discountPercent > 0 && <> <s>{money(l.price)}</s></>}</div></div>
                <div className="qty"><button onClick={() => add(l.id, -1)}>−</button>{l.qty}<button onClick={() => add(l.id, 1)}>+</button></div>
              </div>
            ))}
          </div>
          {lines.length > 0 && (
            <form className="ft" onSubmit={checkout}>
              {saved > 0 && <div className="row between" style={{ marginBottom: 6 }}><span>You save</span><strong>{money(saved)}</strong></div>}
              <div className="row between" style={{ marginBottom: 10 }}><strong>Total</strong><strong className="price">{money(total)}</strong></div>
              {status.error && <div className="alert error">{status.error}</div>}
              <div className="field"><input placeholder="Your name" required value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></div>
              <div className="field"><input placeholder="Phone" required value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></div>
              <div className="field"><input placeholder="Delivery address" required value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} /></div>
              <button className="cta" style={{ width: '100%' }} disabled={status.busy}>{status.busy ? 'Sending…' : features.onlineOrders ? 'Place order (pay on delivery)' : 'Send order request'}</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
