'use client';
import { useEffect, useState } from 'react';

// Writes to the same localStorage cart the Store catalog reads (cart:<slug>).
export default function AddToCart({ slug, id, disabled, backHref, label = 'Add to cart' }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(0);
  const key = `cart:${slug}`;
  useEffect(() => {
    try { setAdded(Object.values(JSON.parse(localStorage.getItem(key)) || {}).reduce((a, b) => a + b, 0)); } catch { /* ignore */ }
  }, [key]);
  function add() {
    try {
      const cart = JSON.parse(localStorage.getItem(key)) || {};
      cart[id] = (cart[id] || 0) + qty;
      localStorage.setItem(key, JSON.stringify(cart));
      setAdded(Object.values(cart).reduce((a, b) => a + b, 0));
    } catch { /* ignore */ }
  }
  if (disabled) return <p className="sold">This item is currently unavailable.</p>;
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="qty"><button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">−</button><strong>{qty}</strong><button type="button" onClick={() => setQty(qty + 1)} aria-label="Increase">+</button></div>
        <button className="cta" onClick={add}>{label}</button>
      </div>
      {added > 0 && <div className="alert success">{added} item(s) in your cart. <a href={backHref} style={{ textDecoration: 'underline', fontWeight: 700 }}>Continue shopping to check out →</a></div>}
    </div>
  );
}
