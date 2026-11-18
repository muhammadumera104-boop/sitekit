'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fmtDate, money } from '@/lib/util';
import { Stars } from './StoreCatalog';

const ago = (d) => { const s = Math.max(0, Math.round((Date.now() - new Date(d)) / 1000)); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };
const PAY = { cod: 'cash on delivery', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank: 'bank transfer' };

// Live map (OpenStreetMap, no API key): the rider's position, and the delivery point when the customer shared it.
function RiderMap({ at, dest }) {
  const pad = 0.012;
  const pts = dest ? [at, dest] : [at];
  const lat = pts.map((p) => p.lat); const lng = pts.map((p) => p.lng);
  const bbox = `${Math.min(...lng) - pad},${Math.min(...lat) - pad},${Math.max(...lng) + pad},${Math.max(...lat) + pad}`;
  return (
    <div className="map-box">
      <iframe title="Rider location" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${at.lat},${at.lng}`} />
      <div className="muted sm">Rider updated {ago(at.at)} · <a href={`https://www.openstreetmap.org/?mlat=${at.lat}&mlon=${at.lng}#map=16/${at.lat}/${at.lng}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Open bigger map</a></div>
    </div>
  );
}

function ReviewForm({ slug, number, phone, onDone }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await fetch(`/api/public/tenants/${slug}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number, phone, rating, comment }) });
      const d = await r.json();
      if (!r.ok) return setErr(d.errors ? Object.values(d.errors)[0] : d.message);
      onDone(d.message);
    } catch { setErr('Could not send your review. Try again.'); } finally { setBusy(false); }
  }
  return (
    <form className="review-form" onSubmit={send}>
      <h4 style={{ margin: '0 0 6px' }}>How was your order?</h4>
      <div className="star-pick" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>★</button>)}</div>
      <textarea rows={3} maxLength={1000} placeholder="Tell others what you liked (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {err && <div className="err">{err}</div>}
      <button className="cta" disabled={busy || !rating} style={{ marginTop: 8 }}>{busy ? 'Sending…' : 'Submit review'}</button>
    </form>
  );
}

const STEPS_DELIVERY = [['new', 'Order placed'], ['confirmed', 'Confirmed'], ['preparing', 'Being prepared'], ['ready', 'Ready'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']];
const STEPS_PICKUP = [['new', 'Order placed'], ['confirmed', 'Confirmed'], ['preparing', 'Being prepared'], ['ready', 'Ready for pickup'], ['completed', 'Picked up']];

// Customers follow their order with the order number + the phone they used. Refreshes by itself.
export default function TrackOrder({ slug, preview }) {
  const sp = useSearchParams();
  const [number, setNumber] = useState(sp.get('number') || '');
  const [phone, setPhone] = useState(sp.get('phone') || '');
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState('');
  const timer = useRef();

  async function lookup(e, silent) {
    e?.preventDefault();
    if (preview) return setErr('Preview mode.');
    if (!silent) { setBusy(true); setErr(''); }
    try {
      const r = await fetch(`/api/public/tenants/${slug}/orders/track?number=${encodeURIComponent(number)}&phone=${encodeURIComponent(phone)}`);
      const d = await r.json();
      if (!r.ok) { if (!silent) { setOrder(null); setErr(d.message); } } else { setOrder(d.order); setErr(''); }
    } catch { if (!silent) setErr('Could not look up the order. Try again.'); }
    setBusy(false);
  }
  useEffect(() => { if (sp.get('number') && sp.get('phone')) lookup(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    clearInterval(timer.current);
    if (order && !['delivered', 'completed', 'cancelled'].includes(order.status)) timer.current = setInterval(() => lookup(null, true), 15000);
    return () => clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status, number, phone]);

  const steps = order?.orderType === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY;
  const idx = order ? steps.findIndex(([k]) => k === (order.status === 'completed' && order.orderType !== 'pickup' ? 'delivered' : order.status)) : -1;
  const at = (k) => order?.history.find((h) => h.status === k)?.at;

  return (
    <div className="track">
      <form className="track-form" onSubmit={lookup}>
        <div className="field"><label>Order number</label><input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 7K2X9411" required /></div>
        <div className="field"><label>Mobile number used at checkout</label><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" inputMode="tel" required /></div>
        <button className="cta" disabled={busy}>{busy ? 'Looking…' : 'Track order'}</button>
      </form>
      {err && <div className="alert error" style={{ marginTop: 16 }}>{err}</div>}
      {order && (
        <div className="track-card">
          <div className="row between"><h3 style={{ margin: 0, textAlign: 'left' }}>Order #{order.number}</h3><span className={`st-pill ${order.status}`}>{order.status.replace(/_/g, ' ')}</span></div>
          <p className="muted sm" style={{ margin: '4px 0 18px' }}>Placed {fmtDate(order.createdAt)}{order.area ? ` · ${order.area}` : ''}</p>
          {order.status === 'cancelled' ? <div className="alert error">This order was cancelled.</div> : (
            <ol className="steps2">
              {steps.map(([k, label], i) => (
                <li key={k} className={i < idx ? 'done' : i === idx ? 'now' : ''}><span className="dot">{i < idx ? '✓' : i + 1}</span><div><strong>{label}</strong>{at(k) && <small>{fmtDate(at(k))}</small>}</div></li>
              ))}
            </ol>
          )}
          {order.riderLocation && <RiderMap at={order.riderLocation} dest={order.destination} />}
          {order.rider && <div className="alert info" style={{ marginTop: 14 }}>🛵 {order.rider.name} is on the way{order.rider.phone ? <> · <a href={`tel:${order.rider.phone}`}>{order.rider.phone}</a></> : null}</div>}
          {!['delivered', 'completed', 'cancelled'].includes(order.status) && order.orderType === 'delivery' && <p className="muted sm">Estimated delivery: about {order.etaMinutes} minutes from when you ordered.</p>}
          <div className="co-line head"><span>Items</span><span /></div>
          {order.items.map((i, k) => <div className="co-line" key={k}><span>{i.qty} × {i.name}{i.options?.length > 0 && <small> ({i.options.join(', ')})</small>}</span><span>{money(i.unitPrice * i.qty)}</span></div>)}
          {order.promoDiscount > 0 && <div className="co-line"><span>Promo {order.promoCode}</span><span>− {money(order.promoDiscount)}</span></div>}
          {order.tax > 0 && <div className="co-line"><span>Tax</span><span>{money(order.tax)}</span></div>}
          {order.deliveryFee > 0 && <div className="co-line"><span>Delivery fee</span><span>{money(order.deliveryFee)}</span></div>}
          {thanks ? <div className="alert success" style={{ marginTop: 14 }}>{thanks}</div> : order.canReview && <ReviewForm slug={slug} number={order.number} phone={phone} onDone={(m) => { setThanks(m); setOrder({ ...order, canReview: false }); }} />}
          <div className="co-line total"><span>Total ({PAY[order.paymentMethod] || order.paymentMethod}, {order.paymentStatus === 'pending' ? 'payment being verified' : order.paymentStatus})</span><span>{money(order.total)}</span></div>
        </div>
      )}
    </div>
  );
}
