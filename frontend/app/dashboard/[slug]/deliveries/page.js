'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Badge, Loading, useLoad } from '@/components/ui';

// Delivery rider screen: only the orders assigned to this rider, big buttons, phone-friendly.
export default function Deliveries() {
  const { slug } = useTenant();
  const { data, error, loading, reload } = useLoad(() => api('/tenant/deliveries', { tenant: slug }), [slug]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { const t = setInterval(reload, 20000); return () => clearInterval(t); }, [reload]);

  async function go(o, status) {
    setErr(''); setBusy(o._id);
    try { await api(`/tenant/deliveries/${o._id}`, { method: 'PATCH', body: { status }, tenant: slug }); await reload(); } catch (e) { setErr(e.message); }
    setBusy('');
  }
  const active = (data?.items || []).filter((o) => o.status !== 'delivered');
  const done = (data?.items || []).filter((o) => o.status === 'delivered');

  return (
    <Protected area="tenant" slug={slug} perm="deliveries.use">
      <div className="page-head"><h1>My deliveries</h1><button className="btn" onClick={reload}>Refresh</button></div>
      <Alert>{error || err}</Alert>
      {loading && !data ? <Loading /> : (
        <>
          {!active.length && <div className="card center muted">No deliveries assigned to you right now. New ones appear here automatically.</div>}
          <div className="rider-list">
            {active.map((o) => {
              const addr = [o.customer?.address, o.customer?.landmark && `near ${o.customer.landmark}`, o.area, o.city].filter(Boolean).join(', ');
              return (
                <div className="card rider-card" key={o._id}>
                  <div className="row between"><strong style={{ fontSize: 18 }}>#{o.number}</strong><Badge>{o.status.replace(/_/g, ' ')}</Badge></div>
                  <div className="muted" style={{ fontSize: 13 }}>{fmtDate(o.createdAt)}{o.branchId?.name ? ` · Pick up from ${o.branchId.name}` : ''}</div>
                  <div style={{ margin: '10px 0' }}>
                    <div><strong>{o.customer?.title} {o.customer?.name}</strong></div>
                    <div>📍 {addr}</div>
                    {o.instructions && <div className="muted">📝 {o.instructions}</div>}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>
                  <div className="row between" style={{ margin: '10px 0' }}>
                    <span><strong style={{ fontSize: 18 }}>{money(o.total)}</strong> <span className="muted">· {o.paymentStatus === 'paid' ? 'Already paid' : 'Collect cash'}</span></span>
                    {o.changeFor > 0 && o.paymentStatus !== 'paid' && <span className="muted">Change for {money(o.changeFor)}: {money(Math.max(0, o.changeFor - o.total))}</span>}
                  </div>
                  <div className="row">
                    {o.customer?.phone && <a className="btn" href={`tel:${o.customer.phone}`}>📞 Call customer</a>}
                    <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}>🗺️ Open map</a>
                    {o.status !== 'out_for_delivery'
                      ? <button className="btn primary" disabled={busy === o._id} onClick={() => go(o, 'out_for_delivery')}>Picked up</button>
                      : <button className="btn primary" disabled={busy === o._id} onClick={() => go(o, 'delivered')}>✓ Delivered</button>}
                  </div>
                </div>
              );
            })}
          </div>
          {done.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Delivered in the last 24 hours</h3>
              <table className="tbl"><tbody>{done.map((o) => <tr key={o._id}><td>#{o.number}</td><td>{o.customer?.name}</td><td>{money(o.total)}</td><td className="muted">{fmtDate(o.updatedAt)}</td></tr>)}</tbody></table>
            </div>
          )}
        </>
      )}
    </Protected>
  );
}
