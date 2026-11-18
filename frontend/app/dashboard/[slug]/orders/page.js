'use client';
import { Fragment, useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { printOrder } from '@/lib/print';
import { alertsOn, disableAlerts, enableAlerts } from '@/lib/useOrderAlerts';
import { useAuth } from '@/lib/auth';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';

const TABS = ['all', 'new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
const label = (s) => s.replace(/_/g, ' ');
// The next step of an order, so staff move it along with one click. Delivery orders end with a rider.
function nextStep(o) {
  const delivery = o.orderType === 'delivery' && o.source === 'online';
  const flow = { new: ['confirmed', 'Confirm'], confirmed: ['preparing', 'Start preparing'], preparing: ['ready', delivery ? 'Mark ready' : 'Ready for pickup'] };
  if (flow[o.status]) return flow[o.status];
  if (o.status === 'ready') return delivery ? ['out_for_delivery', 'Send out for delivery'] : ['completed', 'Mark picked up'];
  if (o.status === 'out_for_delivery') return ['delivered', 'Mark delivered'];
  return null;
}

export default function OrdersPage() {
  const { slug, tenant } = useTenant();
  const { user } = useAuth();
  const can = (p) => user.permissions.includes(p);
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');
  const [bell, setBell] = useState(false);
  useEffect(() => setBell(alertsOn()), []);
  const { data, error, loading, reload } = useLoad(() => api(`/tenant/orders${qs({ status: status === 'all' ? '' : status, source, page })}`, { tenant: slug }), [slug, status, source, page]);
  useEffect(() => { const t = setInterval(reload, 15000); return () => clearInterval(t); }, [reload]); // new orders appear by themselves
  const riders = useLoad(() => (can('orders.assign') ? api('/tenant/riders', { tenant: slug }) : Promise.resolve({ riders: [] })), [slug]);

  async function patch(o, body) {
    setErr('');
    try { await api(`/tenant/orders/${o._id}`, { method: 'PATCH', body, tenant: slug }); await reload(); } catch (e) { setErr(e.message); }
  }
  const counts = data?.counts || {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Protected area="tenant" slug={slug} perm="orders.view">
      <div className="page-head"><h1>Orders</h1>
        <div className="row">
          <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} aria-label="Order source" className="select-sm">
            <option value="">All sources</option><option value="online">Online</option><option value="pos">Point of sale</option>
          </select>
          <button className={`btn ${bell ? 'primary' : ''}`} onClick={async () => { if (bell) { disableAlerts(); setBell(false); } else { await enableAlerts(); setBell(true); } }} title="Play a sound and show a notification when a new order arrives">{bell ? '🔔 Alerts on' : '🔕 Enable alerts'}</button>
          <button className="btn" onClick={reload}>Refresh</button>
        </div>
      </div>
      <Alert>{error || err}</Alert>
      <div className="row" style={{ marginBottom: 14 }}>
        {TABS.map((t) => <button key={t} className={`tab ${status === t ? 'on' : ''}`} onClick={() => { setStatus(t); setPage(1); }}>{t === 'all' ? 'All' : label(t)} <span className="muted">({t === 'all' ? all : counts[t] || 0})</span></button>)}
      </div>
      <div className="card">
        {loading && !data ? <Loading /> : !data?.items.length ? <p className="muted center">No orders yet.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Order</th><th>When</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th /></tr></thead>
            <tbody>{data.items.map((o) => {
              const nx = nextStep(o);
              const needsRider = o.orderType === 'delivery' && o.source === 'online';
              return (
                <Fragment key={o._id}>
                  <tr>
                    <td><strong>#{o.number}</strong><div className="muted" style={{ fontSize: 12 }}>{o.source === 'pos' ? `POS${o.branchId?.name ? ` · ${o.branchId.name}` : ''}` : o.orderType === 'pickup' ? 'Online · Pickup' : 'Online · Delivery'}</div></td>
                    <td className="muted">{fmtDate(o.createdAt)}</td>
                    <td>{o.customer?.name || <span className="muted">Walk-in</span>}<div className="muted" style={{ fontSize: 12 }}>{o.customer?.phone}{o.area ? ` · ${o.area}` : ''}</div></td>
                    <td><strong>{money(o.total)}</strong>{o.discount > 0 && <div className="muted" style={{ fontSize: 12 }}>saved {money(o.discount)}</div>}</td>
                    <td><Badge>{o.paymentStatus === 'pending' ? 'verify' : o.paymentStatus}</Badge><div className="muted" style={{ fontSize: 12 }}>{o.paymentMethod}{o.paymentRef ? ` · ${o.paymentRef}` : ''}</div></td>
                    <td><Badge>{label(o.status)}</Badge>{o.riderId && <div className="muted" style={{ fontSize: 12 }}>🛵 {o.riderId.name}</div>}</td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setOpen(open === o._id ? null : o._id)}>{open === o._id ? 'Hide' : 'Details'}</button>
                      {can('orders.manage') && nx && <button className="btn sm primary" onClick={() => patch(o, { status: nx[0] })}>{nx[1]}</button>}
                      {can('orders.manage') && o.paymentStatus === 'pending' && o.status !== 'cancelled' && <><button className="btn sm primary" onClick={() => patch(o, { paymentStatus: 'paid' })}>✓ Payment received</button><button className="btn sm danger" onClick={() => confirm(`Reject the payment for #${o.number}?`) && patch(o, { paymentStatus: 'failed' })}>Reject</button></>}
                      {can('orders.manage') && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' && <button className="btn sm" onClick={() => patch(o, { paymentStatus: 'paid' })}>Mark paid</button>}
                      {can('orders.manage') && !['delivered', 'completed', 'cancelled'].includes(o.status) && <button className="btn sm danger" onClick={() => confirm(`Cancel order #${o.number}? Stock will be returned.`) && patch(o, { status: 'cancelled' })}>Cancel</button>}
                    </div></td>
                  </tr>
                  {open === o._id && (
                    <tr><td colSpan={7} style={{ background: 'color-mix(in srgb, var(--line) 35%, transparent)' }}>
                      {o.items.map((i, k) => <div key={k}><div className="row between"><span>{i.qty} × {i.name}{i.options?.length > 0 && <span className="muted"> ({i.options.map((x) => x.name).join(', ')})</span>}{i.discountPercent > 0 && <span className="muted"> ({i.discountPercent}% off)</span>}</span><span>{money(i.unitPrice * i.qty)}</span></div>{i.note && <div className="muted" style={{ fontSize: 12, marginLeft: 14 }}>“{i.note}”</div>}</div>)}
                      {(o.tax > 0 || o.deliveryFee > 0) && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{o.tax > 0 && `Tax ${money(o.tax)} `}{o.deliveryFee > 0 && `· Delivery fee ${money(o.deliveryFee)}`}</div>}
                      {o.customer?.address && <p style={{ margin: '8px 0 0' }}><strong>Deliver to:</strong> {o.customer.title} {o.customer.name} — {o.customer.address}{o.customer.landmark ? ` (near ${o.customer.landmark})` : ''}{o.area ? `, ${o.area}${o.city ? `, ${o.city}` : ''}` : ''}</p>}
                      {o.customer?.altPhone && <p style={{ margin: '4px 0 0' }}><strong>Alt. phone:</strong> {o.customer.altPhone}</p>}
                      {o.instructions && <p style={{ margin: '4px 0 0' }}><strong>Instructions:</strong> {o.instructions}</p>}
                      {o.changeFor > 0 && <p style={{ margin: '4px 0 0' }}><strong>Customer will pay with:</strong> {money(o.changeFor)} (bring {money(Math.max(0, o.changeFor - o.total))} change)</p>}
                      {o.gift?.isGift && <p style={{ margin: '4px 0 0' }}>🎁 <strong>Gift for</strong> {o.gift.recipientName} {o.gift.recipientPhone}{o.gift.message ? ` — “${o.gift.message}”` : ''}</p>}
                      {needsRider && can('orders.assign') && !['delivered', 'completed', 'cancelled'].includes(o.status) && (
                        <div className="row" style={{ marginTop: 10 }}>
                          <strong>Rider:</strong>
                          <select className="select-sm" value={o.riderId?._id || ''} onChange={(e) => patch(o, { riderId: e.target.value || null })} aria-label="Assign rider">
                            <option value="">— not assigned —</option>
                            {riders.data?.riders.map((r) => <option key={r._id} value={r._id}>{r.name}{r.phone ? ` · ${r.phone}` : ''}</option>)}
                          </select>
                          {!riders.data?.riders.length && <span className="muted">No riders yet — add one in Team.</span>}
                        </div>
                      )}
                      {o.paymentRef && <p style={{ margin: '4px 0 0' }}><strong>Payment:</strong> {o.paymentMethod} · transaction {o.paymentRef}{o.paymentSender ? ` · from ${o.paymentSender}` : ''}</p>}
                      {o.customer?.location?.lat != null && <p style={{ margin: '4px 0 0' }}><strong>GPS pin:</strong> <a href={`https://www.google.com/maps/search/?api=1&query=${o.customer.location.lat},${o.customer.location.lng}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>open on map</a></p>}
                      {o.promoCode && <p style={{ margin: '4px 0 0' }}><strong>Promo:</strong> {o.promoCode} (− {money(o.promoDiscount)})</p>}
                      <div className="row" style={{ marginTop: 10 }}><button className="btn sm" onClick={() => printOrder(o, { name: tenant.name })}>🖨️ Print receipt</button><button className="btn sm" onClick={() => printOrder(o, { name: tenant.name }, { kitchen: true })}>🍳 Kitchen ticket</button></div>
                      {o.history?.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{o.history.map((h) => `${label(h.status)} ${fmtDate(h.at)}${h.by ? ` (${h.by})` : ''}`).join('  →  ')}</div>}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table></div>
        )}
        <Pager page={data?.page} pages={data?.pages} onPage={setPage} />
      </div>
    </Protected>
  );
}
