'use client';
import { useState } from 'react';
import { useOrdering } from './Ordering';

// Item page: quantity + special instructions + add to the shared cart.
export default function AddToCart({ id, disabled, label = 'Add to cart' }) {
  const o = useOrdering();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  if (disabled) return <p className="sold">This item is currently unavailable.</p>;
  return (
    <div>
      <label className="im-label" htmlFor="ad-note">Special instructions</label>
      <textarea id="ad-note" rows={2} maxLength={500} placeholder="Please enter instructions about this item" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="qty2"><button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">−</button><b>{qty}</b><button type="button" onClick={() => setQty(Math.min(99, qty + 1))} aria-label="Increase">+</button></div>
        <button className="cta" onClick={() => { o.add(id, qty, note); setDone(true); }}>{label}</button>
      </div>
      {done && <div className="alert success">Added to your cart. <button className="linkish" style={{ textDecoration: 'underline', fontWeight: 700 }} onClick={o.openCart}>View cart →</button></div>}
    </div>
  );
}
