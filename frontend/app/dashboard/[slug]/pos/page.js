'use client';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { money } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Loading, useLoad } from '@/components/ui';

// Point of sale (cashier screen): tap products, take cash/card, the sale is recorded as a paid order and stock is reduced.
export default function PosPage() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/pos/items', { tenant: slug }), [slug]);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({});
  const [method, setMethod] = useState('cash');
  const [cust, setCust] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [receipt, setReceipt] = useState(null);

  const items = data?.items || [];
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const shown = items.filter((i) => (cat === 'all' || i.categoryId === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const lines = Object.entries(cart).filter(([id]) => byId[id]).map(([id, qty]) => ({ ...byId[id], qty }));
  const total = lines.reduce((s, l) => s + l.salePrice * l.qty, 0);
  const saved = lines.reduce((s, l) => s + (l.price - l.salePrice) * l.qty, 0);

  const add = (id, d = 1) => setCart((c) => {
    const it = byId[id]; const next = (c[id] || 0) + d;
    const n = { ...c };
    if (next <= 0) delete n[id]; else n[id] = it?.stock != null ? Math.min(next, it.stock) : next;
    return n;
  });

  async function charge() {
    setBusy(true); setErr(''); setReceipt(null);
    try {
      const d = await api('/tenant/pos/orders', { method: 'POST', tenant: slug, body: { items: lines.map((l) => ({ itemId: l.id, qty: l.qty })), paymentMethod: method, customer: cust } });
      setReceipt(d.order); setCart({}); setCust({ name: '', phone: '' }); await reload();
    } catch (e) { setErr(e.message); await reload(); }
    setBusy(false);
  }

  if (loading && !data) return <Loading />;
  return (
    <Protected area="tenant" slug={slug} perm="pos.use">
      <div className="page-head"><h1>Point of sale</h1><button className="btn" onClick={reload}>Refresh stock</button></div>
      <Alert>{error || err}</Alert>
      {receipt && <Alert type="success">Sale recorded: order #{receipt.number} — {money(receipt.total)} ({receipt.paymentMethod}). Thank you!</Alert>}
      <div className="pos">
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <input className="select-sm" style={{ flex: 1, minWidth: 160 }} placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`tab ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
            {data?.categories.map((c) => <button key={c.id} className={`tab ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
          {!shown.length && <div className="card center muted">No products to sell.</div>}
          <div className="pos-grid">
            {shown.map((i) => (
              <button key={i.id} className="pos-item" onClick={() => add(i.id)} disabled={i.stock != null && (cart[i.id] || 0) >= i.stock}>
                {i.image ? <img src={i.image} alt="" /> : <div className="ph">🛒</div>}
                <strong>{i.name}</strong>
                <span>{i.discountPercent > 0 && <s className="muted" style={{ marginRight: 6 }}>{money(i.price)}</s>}{money(i.salePrice)}</span>
                {i.discountPercent > 0 && <em className="off">{i.discountPercent}% off</em>}
                {i.stock != null && <small className={i.stock <= 5 ? 'low' : 'muted'}>{i.stock} in stock</small>}
              </button>
            ))}
          </div>
        </div>
        <div className="card pos-cart">
          <h3>Current sale</h3>
          {!lines.length && <p className="muted">Tap a product to add it.</p>}
          {lines.map((l) => (
            <div className="row between" key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{l.name}</div><div className="muted" style={{ fontSize: 12 }}>{money(l.salePrice)} each</div></div>
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <button className="btn sm" onClick={() => add(l.id, -1)} aria-label="Less">−</button><strong style={{ minWidth: 22, textAlign: 'center' }}>{l.qty}</strong><button className="btn sm" onClick={() => add(l.id, 1)} aria-label="More">+</button>
              </div>
              <strong style={{ minWidth: 80, textAlign: 'right' }}>{money(l.salePrice * l.qty)}</strong>
            </div>
          ))}
          {lines.length > 0 && (
            <>
              {saved > 0 && <div className="row between muted" style={{ marginTop: 8 }}><span>Discounts applied</span><span>− {money(saved)}</span></div>}
              <div className="row between" style={{ margin: '10px 0', fontSize: 20 }}><strong>Total</strong><strong>{money(total)}</strong></div>
              <div className="row" style={{ marginBottom: 10 }}>
                {['cash', 'card'].map((m) => <button key={m} className={`tab ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)}>{m}</button>)}
              </div>
              <div className="field"><input placeholder="Customer name (optional)" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></div>
              <div className="field"><input placeholder="Customer phone (optional)" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></div>
              <button className="btn primary" style={{ width: '100%', padding: 14, fontSize: 16 }} disabled={busy} onClick={charge}>{busy ? 'Processing…' : `Charge ${money(total)}`}</button>
              <button className="btn ghost sm" style={{ width: '100%', marginTop: 6 }} onClick={() => setCart({})}>Clear sale</button>
            </>
          )}
        </div>
      </div>
    </Protected>
  );
}
