'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { money } from '@/lib/util';
import { useOrdering } from './Ordering';

const PAY_LABEL = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank: 'Bank transfer' };

// Guest checkout (an account is optional): details, delivery or pickup, promo code, payment, gift option and a live order summary.
export default function Checkout() {
  const o = useOrdering();
  const { slug, lines, totals, ordering, features, area, loc, locOn, orderType, setOrderType, minOrder, subtotal, saved, promo, promoOff, customer, ctoken } = o;
  const [f, setF] = useState({ title: 'Mr.', name: '', phone: '', altPhone: '', address: '', landmark: '', email: '', instructions: '', changeFor: '' });
  const [gift, setGift] = useState({ on: false, recipientName: '', recipientPhone: '', message: '' });
  const [pay, setPay] = useState({ method: 'cod', ref: '', sender: '' });
  const [gps, setGps] = useState(null);
  const [gpsMsg, setGpsMsg] = useState('');
  const [code, setCode] = useState('');
  const [promoMsg, setPromoMsg] = useState({ ok: '', error: '' });
  const [saveAddr, setSaveAddr] = useState(true);
  const [st, setSt] = useState({ busy: false, error: '', errors: {} });
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pickup = orderType === 'pickup';
  const taxOn = ordering.taxPercent > 0;
  const accounts = ordering.paymentAccounts || [];

  // Signed-in customers get their details filled in.
  useEffect(() => {
    if (customer) setF((p) => ({ ...p, name: p.name || customer.name || '', phone: p.phone || customer.phone || '', email: p.email || customer.email || '' }));
  }, [customer]);

  function useAddress(a) {
    setF((p) => ({ ...p, address: a.address || '', landmark: a.landmark || '' }));
    if (a.lat != null && a.lng != null) setGps({ lat: a.lat, lng: a.lng });
  }
  function locate() {
    if (!navigator.geolocation) return setGpsMsg('Your browser cannot share location.');
    setGpsMsg('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }); setGpsMsg(''); },
      () => setGpsMsg('Could not get your location. You can still type your address.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  async function applyPromo(e) {
    e?.preventDefault();
    setPromoMsg({ ok: '', error: '' });
    try {
      const r = await fetch(`/api/public/tenants/${slug}/promo/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, subtotal }) });
      const d = await r.json();
      if (!r.ok) return setPromoMsg({ ok: '', error: d.errors ? Object.values(d.errors)[0] : d.message });
      o.setPromo({ code: d.promo.code, type: d.promo.type, value: d.promo.value, minOrder: d.promo.minOrder, maxDiscount: d.promo.maxDiscount });
      setPromoMsg({ ok: `Code ${d.promo.code} applied${d.promo.description ? ` — ${d.promo.description}` : ''}`, error: '' }); setCode('');
    } catch { setPromoMsg({ ok: '', error: 'Could not check the code. Try again.' }); }
  }

  if (done) {
    return (
      <div className="co-done">
        <div className="tick">✓</div>
        <h2>Thank you! Your order is placed</h2>
        <p>Order number <strong className="code">#{done.number}</strong></p>
        <p className="muted">
          Total {money(done.total)} · {done.paymentMethod === 'cod' ? (done.orderType === 'pickup' ? 'Pay at pickup' : 'Cash on delivery') : `${PAY_LABEL[done.paymentMethod]} — we will verify your payment`}.
          {f.email ? ' We emailed you the details.' : ''}
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {features.orderTracking && <Link className="cta" href={`/${slug}/track?number=${done.number}&phone=${encodeURIComponent(f.phone)}`}>Track my order</Link>}
          {features.accounts && !ctoken && <Link className="cta alt dark" href={`/${slug}/account`}>Create an account</Link>}
          <Link className="cta alt dark" href={`/${slug}`}>Back to home</Link>
        </div>
      </div>
    );
  }
  if (!o.ready) return null;
  if (!lines.length) {
    return <div className="center"><h2>Your cart is empty</h2><p className="muted">Add something tasty first.</p><Link className="cta" href={`/${slug}/${o.menuSlug}`}>Browse the menu</Link></div>;
  }

  async function place(e) {
    e.preventDefault();
    if (locOn && !area) { o.openLocation(); return setSt({ busy: false, error: 'Please select your delivery location first.', errors: {} }); }
    if (minOrder > o.itemsTotal) return setSt({ busy: false, error: `Minimum order is ${money(minOrder)}.`, errors: {} });
    if (pay.method !== 'cod' && pay.ref.trim().length < 4) return setSt({ busy: false, error: 'Enter the transaction ID of your payment.', errors: {} });
    setSt({ busy: true, error: '', errors: {} });
    try {
      const body = {
        items: lines.map((l) => ({ id: l.id, qty: l.qty, note: l.note, options: l.chosen.map((c) => ({ groupId: c.groupId, optionId: c.optionId })) })), orderType, areaId: area?.id || null,
        customer: { title: f.title, name: f.name, phone: f.phone, altPhone: f.altPhone, address: pickup ? '' : f.address, landmark: f.landmark, email: f.email, ...(gps && !pickup ? { location: gps } : {}) },
        instructions: f.instructions, ...(f.changeFor ? { changeFor: Number(f.changeFor) } : {}),
        ...(gift.on ? { gift: { isGift: true, recipientName: gift.recipientName, recipientPhone: gift.recipientPhone, message: gift.message } } : {}),
        ...(promo ? { promoCode: promo.code } : {}),
        paymentMethod: pay.method, ...(pay.method !== 'cod' ? { paymentRef: pay.ref.trim(), paymentSender: pay.sender.trim() } : {}),
      };
      const r = await fetch(`/api/public/tenants/${slug}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ctoken ? { Authorization: `Bearer ${ctoken}` } : {}) }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) {
        if (d.code === 'AREA_REQUIRED') o.openLocation();
        if (d.code === 'PROMO_INVALID' || d.code === 'PROMO_MIN') o.setPromo(null);
        return setSt({ busy: false, error: d.errors ? 'Please check the highlighted fields.' : d.message, errors: d.errors || {} });
      }
      // Remember a new address for next time (signed-in customers only).
      if (ctoken && saveAddr && !pickup && f.address && !(customer?.addresses || []).some((a) => a.address === f.address)) {
        fetch('/api/customer/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctoken}`, 'X-Store': slug }, body: JSON.stringify({ label: area?.name || 'Address', city: loc?.city, areaId: loc?.areaId, areaName: loc?.areaName, address: f.address, landmark: f.landmark, ...(gps || {}) }) })
          .then((x) => x.json()).then((x) => x.customer && o.setCustomer(x.customer)).catch(() => {});
      }
      o.clear(); setDone(d.order); window.scrollTo?.({ top: 0 });
    } catch { setSt({ busy: false, error: 'Could not place the order. Please try again.', errors: {} }); }
  }
  const E = ({ k }) => (st.errors[k] ? <span className="err">{st.errors[k]}</span> : null);
  const acct = accounts.find((a) => a.method === pay.method);

  return (
    <form className="co" onSubmit={place} noValidate>
      <div className="co-form">
        <h2 style={{ textAlign: 'left' }}>Checkout</h2>
        {features.accounts && !ctoken && <div className="alert info" style={{ marginBottom: 12 }}>Have an account? <Link href={`/${slug}/account`} style={{ fontWeight: 700, textDecoration: 'underline' }}>Sign in</Link> to use saved addresses and see your order history. Guest checkout works too.</div>}
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
            {customer?.addresses?.length > 0 && (
              <div className="field"><label>Saved addresses</label>
                <div className="row">{customer.addresses.map((a) => <button type="button" key={a._id} className="chip" onClick={() => useAddress(a)}>📍 {a.label || a.areaName || 'Address'}</button>)}</div>
              </div>
            )}
            <div className="field"><label>Delivery address *</label>
              <div className="addr"><input value={f.address} onChange={set('address')} placeholder="Enter your complete address" autoComplete="street-address" required />{area && <span className="tag">{area.name}</span>}</div>
              {st.error && !f.address && <span className="err">Delivery address is required</span>}
            </div>
            <div className="gps-row">
              <button type="button" className="btn sm" onClick={locate}>🎯 {gps ? 'Update my location' : 'Use my current location'}</button>
              {gps ? <span className="ok-text">✓ Location attached — the rider can navigate straight to you.</span> : <span className="muted sm">{gpsMsg || 'Optional, but helps the rider find you.'}</span>}
              {gps && <button type="button" className="linkish sm" onClick={() => setGps(null)}>Remove</button>}
            </div>
            <div className="co-grid two">
              <div className="field"><label>Nearest landmark</label><input value={f.landmark} onChange={set('landmark')} placeholder="Any famous place nearby" /></div>
              <div className="field"><label>Email address</label><input type="email" value={f.email} onChange={set('email')} placeholder="For order updates" /><E k="customer.email" /></div>
            </div>
            {ctoken && <label className="gift-toggle"><input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} /> Save this address for next time</label>}
          </>
        )}
        {pickup && <div className="field"><label>Email address</label><input type="email" value={f.email} onChange={set('email')} placeholder="For order updates" /><E k="customer.email" /></div>}
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
          <label className={pay.method === 'cod' ? 'on' : ''}><input type="radio" name="pay" checked={pay.method === 'cod'} onChange={() => setPay({ ...pay, method: 'cod' })} /> {pickup ? 'Pay at pickup' : 'Cash on delivery'}</label>
          {accounts.map((a) => (
            <label key={a.method} className={pay.method === a.method ? 'on' : ''}><input type="radio" name="pay" checked={pay.method === a.method} onChange={() => setPay({ ...pay, method: a.method })} /> {PAY_LABEL[a.method]}<small>pay now, we verify it</small></label>
          ))}
        </div>
        {acct && (
          <div className="pay-box">
            <div className="pay-acct"><span>{PAY_LABEL[acct.method]} account</span><strong>{acct.accountNumber}</strong>{acct.accountName && <small>{acct.accountName}</small>}</div>
            <p className="muted sm" style={{ margin: '8px 0' }}>{acct.instructions || 'Send the total amount to this account, then enter the transaction ID below.'} Amount to send: <strong>{money(totals.total)}</strong></p>
            <div className="co-grid two">
              <div className="field"><label>Transaction ID *</label><input value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} placeholder="e.g. 4821937650" /></div>
              <div className="field"><label>Number you paid from</label><input value={pay.sender} onChange={(e) => setPay({ ...pay, sender: e.target.value })} inputMode="tel" placeholder="03xx-xxxxxxx" /></div>
            </div>
          </div>
        )}
        {!pickup && pay.method === 'cod' && <div className="field" style={{ maxWidth: 260 }}><label>Change request</label><input type="number" min="0" value={f.changeFor} onChange={set('changeFor')} placeholder="Rs. — bring change for" /><small>Amount you will pay with, so the rider brings change.</small></div>}
      </div>

      <aside className="co-sum">
        <h3>Your order</h3>
        {lines.map((l) => (
          <div className="co-line" key={l.key}><span>{l.qty} × {l.name}{l.chosen.length > 0 && <small> ({l.chosen.map((c) => c.name).join(', ')})</small>}{l.note && <small> — {l.note}</small>}</span><span>{money(l.unit * l.qty)}</span></div>
        ))}
        {features.promos && (
          promo ? (
            <div className="promo-on"><span>🏷️ <strong>{promo.code}</strong> applied</span><button type="button" className="linkish" onClick={() => { o.setPromo(null); setPromoMsg({ ok: '', error: '' }); }}>Remove</button></div>
          ) : (
            <div className="promo-form">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Promo code" aria-label="Promo code" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), code && applyPromo())} />
              <button type="button" className="btn sm" disabled={!code} onClick={applyPromo}>Apply</button>
            </div>
          )
        )}
        {promoMsg.error && <div className="err" style={{ marginTop: 4 }}>{promoMsg.error}</div>}
        {promoMsg.ok && <div className="ok-text" style={{ marginTop: 4 }}>{promoMsg.ok}</div>}
        {promoOff > 0 && <div className="sum save"><span>Promo discount</span><span>− {money(promoOff)}</span></div>}
        <div className="sum"><span>Total</span><span>{money(totals.net)}</span></div>
        {taxOn && <div className="sum"><span>{ordering.taxLabel || 'Tax'} ({ordering.taxPercent}%)</span><span>{money(totals.tax)}</span></div>}
        {!pickup && <div className="sum"><span>Delivery fee</span><span>{area ? (totals.deliveryFee ? money(totals.deliveryFee) : 'Free') : '—'}</span></div>}
        {saved > 0 && <div className="sum save"><span>You save</span><span>{money(saved)}</span></div>}
        <div className="sum grand"><span>Grand total</span><span>{money(pickup ? totals.total - totals.deliveryFee : totals.total)}</span></div>
        {!pickup && minOrder > o.itemsTotal && <div className="alert error">Minimum order is {money(minOrder)}.</div>}
        <button className="cta" style={{ width: '100%' }} disabled={st.busy}>{st.busy ? 'Placing order…' : 'Place order'}</button>
        <Link className="back" href={`/${slug}/${o.menuSlug}`}>← continue to add more items</Link>
        {ordering.etaMinutes && !pickup && <p className="muted sm center">Estimated delivery: about {ordering.etaMinutes} minutes.</p>}
      </aside>
    </form>
  );
}
