'use client';
import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/util';
import { useOrdering } from './Ordering';

// Guest checkout (no account needed): details, delivery or pickup, payment, gift option and a live order summary.
export default function Checkout() {
  const o = useOrdering();
  const { slug, lines, totals, ordering, features, area, loc, locOn, orderType, setOrderType, minOrder, itemsTotal, saved } = o;
  const [f, setF] = useState({ title: 'Mr.', name: '', phone: '', altPhone: '', address: '', landmark: '', email: '', instructions: '', changeFor: '' });
  const [gift, setGift] = useState({ on: false, recipientName: '', recipientPhone: '', message: '' });
  const [st, setSt] = useState({ busy: false, error: '', errors: {} });
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pickup = orderType === 'pickup';
  const taxOn = ordering.taxPercent > 0;

  if (done) {
    return (
      <div className="co-done">
        <div className="tick">✓</div>
        <h2>Thank you! Your order is placed</h2>
        <p>Order number <strong className="code">#{done.number}</strong></p>
        <p className="muted">Total {money(done.total)} · {done.orderType === 'pickup' ? 'Pay at pickup' : 'Cash on delivery'}. We have sent your order to the kitchen.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {features.orderTracking && <Link className="cta" href={`/${slug}/track?number=${done.number}&phone=${encodeURIComponent(f.phone)}`}>Track my order</Link>}
          <Link className="cta alt dark" href={`/${slug}`}>Back to home</Link>
        </div>
      </div>
    );
  }
  if (!o.ready) return null;
  if (!lines.length) {
    return <div className="center"><h2>Your cart is empty</h2><p className="muted">Add something tasty first.</p><Link className="cta" href={`/${slug}`}>Browse the menu</Link></div>;
  }

  async function place(e) {
    e.preventDefault();
    if (locOn && !area) { o.openLocation(); return setSt({ busy: false, error: 'Please select your delivery location first.', errors: {} }); }
    if (minOrder > itemsTotal) return setSt({ busy: false, error: `Minimum order is ${money(minOrder)}.`, errors: {} });
    setSt({ busy: true, error: '', errors: {} });
    try {
      const body = {
        items: lines.map((l) => ({ id: l.id, qty: l.qty, note: l.note })), orderType, areaId: area?.id || null,
        customer: { title: f.title, name: f.name, phone: f.phone, altPhone: f.altPhone, address: pickup ? '' : f.address, landmark: f.landmark, email: f.email },
        instructions: f.instructions, ...(f.changeFor ? { changeFor: Number(f.changeFor) } : {}),
        ...(gift.on ? { gift: { isGift: true, recipientName: gift.recipientName, recipientPhone: gift.recipientPhone, message: gift.message } } : {}),
      };
      const r = await fetch(`/api/public/tenants/${slug}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) {
        if (d.code === 'AREA_REQUIRED') o.openLocation();
        return setSt({ busy: false, error: d.errors ? 'Please check the highlighted fields.' : d.message, errors: d.errors || {} });
      }
      o.clear(); setDone(d.order); window.scrollTo?.({ top: 0 });
    } catch { setSt({ busy: false, error: 'Could not place the order. Please try again.', errors: {} }); }
  }
  const E = ({ k }) => (st.errors[k] ? <span className="err">{st.errors[k]}</span> : null);

  return (
    <form className="co" onSubmit={place} noValidate>
      <div className="co-form">
        <h2 style={{ textAlign: 'left' }}>Checkout</h2>
        <div className="co-type">
          <button type="button" className={!pickup ? 'on' : ''} onClick={() => setOrderType('delivery')}>🛵 Delivery</button>
          {features.pickup && <button type="button" className={pickup ? 'on' : ''} onClick={() => setOrderType('pickup')}>🏪 Pickup</button>}
        </div>
        {locOn && (
          <button type="button" className="loc-chip" onClick={o.openLocation}>📍 {loc ? `${loc.areaName}, ${loc.city}` : 'Select your location'} <u>Change</u></button>
        )}
        <p className="muted" style={{ marginTop: 0 }}>{pickup ? 'Tell us who is collecting the order.' : 'Just a last step, please enter your details:'}</p>
        {st.error && <div className="alert error">{st.error}</div>}

        <div className="co-grid">
          <div className="field sm"><label>Title</label><select value={f.title} onChange={set('title')}><option>Mr.</option><option>Ms.</option><option>Mrs.</option></select></div>
          <div className="field"><label>Full name *</label><input value={f.name} onChange={set('name')} placeholder="Full name" autoComplete="name" required /><E k="customer.name" /></div>
          <div className="field"><label>Mobile number *</label><input value={f.phone} onChange={set('phone')} placeholder="03xx-xxxxxxx" inputMode="tel" autoComplete="tel" required /><E k="customer.phone" /></div>
          <div className="field"><label>Alternate mobile number</label><input value={f.altPhone} onChange={set('altPhone')} placeholder="03xx-xxxxxxx" inputMode="tel" /></div>
        </div>
        {!pickup && (
          <>
            <div className="field"><label>Delivery address *</label>
              <div className="addr"><input value={f.address} onChange={set('address')} placeholder="Enter your complete address" autoComplete="street-address" required />{area && <span className="tag">{area.name}</span>}</div>
              {st.error && !f.address && <span className="err">Delivery address is required</span>}
            </div>
            <div className="co-grid two">
              <div className="field"><label>Nearest landmark</label><input value={f.landmark} onChange={set('landmark')} placeholder="Any famous place nearby" /></div>
              <div className="field"><label>Email address</label><input type="email" value={f.email} onChange={set('email')} placeholder="Enter your email" /><E k="customer.email" /></div>
            </div>
          </>
        )}
        <div className="field"><label>{pickup ? 'Notes for the kitchen' : 'Delivery instructions'}</label><textarea rows={2} maxLength={500} value={f.instructions} onChange={set('instructions')} placeholder={pickup ? 'Anything we should know?' : 'e.g. ring the bell twice, leave at the gate'} /></div>

        <label className="gift-toggle"><input type="checkbox" checked={gift.on} onChange={(e) => setGift({ ...gift, on: e.target.checked })} /> 🎁 Send as a gift</label>
        {gift.on && (
          <div className="co-grid two">
            <div className="field"><label>Recipient name</label><input value={gift.recipientName} onChange={(e) => setGift({ ...gift, recipientName: e.target.value })} /></div>
            <div className="field"><label>Recipient phone</label><input value={gift.recipientPhone} onChange={(e) => setGift({ ...gift, recipientPhone: e.target.value })} inputMode="tel" /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Gift message</label><input maxLength={300} value={gift.message} onChange={(e) => setGift({ ...gift, message: e.target.value })} /></div>
          </div>
        )}

        <h3 style={{ textAlign: 'left', marginTop: 18 }}>Payment information</h3>
        <div className="pay">
          <label className="on"><input type="radio" checked readOnly /> {pickup ? 'Pay at pickup' : 'Cash on delivery'}</label>
          <label className="off" title="Online payment is not available yet"><input type="radio" disabled /> Online payment <small>(coming soon)</small></label>
        </div>
        {!pickup && <div className="field" style={{ maxWidth: 260 }}><label>Change request</label><input type="number" min="0" value={f.changeFor} onChange={set('changeFor')} placeholder={`Rs. — bring change for`} /><small>Amount you will pay with, so the rider brings change.</small></div>}
      </div>

      <aside className="co-sum">
        <h3>Your order</h3>
        {lines.map((l) => (
          <div className="co-line" key={l.id}><span>{l.qty} × {l.name}{l.note && <small> — {l.note}</small>}</span><span>{money(l.salePrice * l.qty)}</span></div>
        ))}
        <div className="sum"><span>Total</span><span>{money(totals.net)}</span></div>
        {taxOn && <div className="sum"><span>{ordering.taxLabel || 'Tax'} ({ordering.taxPercent}%)</span><span>{money(totals.tax)}</span></div>}
        {!pickup && <div className="sum"><span>Delivery fee</span><span>{area ? (totals.deliveryFee ? money(totals.deliveryFee) : 'Free') : '—'}</span></div>}
        {saved > 0 && <div className="sum save"><span>You save</span><span>{money(saved)}</span></div>}
        <div className="sum grand"><span>Grand total</span><span>{money(pickup ? totals.total - totals.deliveryFee : totals.total)}</span></div>
        {!pickup && minOrder > itemsTotal && <div className="alert error">Minimum order is {money(minOrder)}.</div>}
        <button className="cta" style={{ width: '100%' }} disabled={st.busy}>{st.busy ? 'Placing order…' : 'Place order'}</button>
        <Link className="back" href={`/${slug}/${o.menuSlug}`}>← continue to add more items</Link>
        {ordering.etaMinutes && !pickup && <p className="muted sm center">Estimated delivery: about {ordering.etaMinutes} minutes.</p>}
      </aside>
    </form>
  );
}
