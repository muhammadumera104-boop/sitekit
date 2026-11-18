'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fmtDate, money } from '@/lib/util';

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
          {order.rider && <div className="alert info" style={{ marginTop: 14 }}>🛵 {order.rider.name} is on the way{order.rider.phone ? <> · <a href={`tel:${order.rider.phone}`}>{order.rider.phone}</a></> : null}</div>}
          {!['delivered', 'completed', 'cancelled'].includes(order.status) && order.orderType === 'delivery' && <p className="muted sm">Estimated delivery: about {order.etaMinutes} minutes from when you ordered.</p>}
          <div className="co-line head"><span>Items</span><span /></div>
          {order.items.map((i, k) => <div className="co-line" key={k}><span>{i.qty} × {i.name}</span><span>{money(i.unitPrice * i.qty)}</span></div>)}
          {order.tax > 0 && <div className="co-line"><span>Tax</span><span>{money(order.tax)}</span></div>}
          {order.deliveryFee > 0 && <div className="co-line"><span>Delivery fee</span><span>{money(order.deliveryFee)}</span></div>}
          <div className="co-line total"><span>Total ({order.paymentMethod === 'cod' ? 'cash on delivery' : order.paymentMethod}, {order.paymentStatus})</span><span>{money(order.total)}</span></div>
        </div>
      )}
    </div>
  );
}
