'use client';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { Alert, Badge, Loading, useLoad } from '@/components/ui';
import { StoreCell } from '@/components/admin/bits';

// Platform overview: money, orders, customers across every store, plus the last 14 days.
export default function AdminOverview() {
  const { data: s, error, loading } = useLoad(() => api('/admin/overview'));
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const max = Math.max(1, ...s.days.map((d) => d.revenue));
  const topMax = Math.max(1, ...s.topStores.map((t) => t.revenue));
  const cards = [
    ['Revenue (all stores)', money(s.revenue), '/admin/orders', '💰'],
    ['Orders', s.orders.toLocaleString(), '/admin/orders', '🧾'],
    ['Customers', s.customers.toLocaleString(), '/admin/customers', '🧑‍🤝‍🧑'],
    ['Products listed', s.products.toLocaleString(), '/admin/products', '🛍️'],
    ['Live websites', `${s.stores.active} / ${s.stores.total}`, '/admin/sites', '🌐'],
    ['Payments to verify', s.pendingPayments, '/admin/payments?status=pending', '💳'],
    ['Average rating', s.rating ? `${s.rating.avg} ★ (${s.rating.count})` : '—', '/admin/reviews', '⭐'],
  ];
  return (
    <>
      <div className="page-head">
        <div><h1>Overview</h1><p className="muted" style={{ margin: '4px 0 0' }}>Everything happening across all websites.</p></div>
        <div className="row"><Link className="btn" href="/admin/sites">🌐 All websites</Link><Link className="btn primary" href="/admin/tenants/new">＋ Add new tenant</Link></div>
      </div>
      <div className="stats">
        {cards.map(([l, n, href, ic]) => (
          <Link className="stat stat-link" href={href} key={l}><div className="ic">{ic}</div><div className="n" style={{ fontSize: String(n).length > 11 ? 21 : undefined }}>{n}</div><div className="l">{l}</div></Link>
        ))}
      </div>
      {s.pendingPayments > 0 && <Alert type="info">💳 {s.pendingPayments} online payment{s.pendingPayments > 1 ? 's' : ''} waiting for verification. <Link href="/admin/payments?status=pending" style={{ textDecoration: 'underline', fontWeight: 700 }}>Review now</Link></Alert>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between"><h3 style={{ margin: 0 }}>Revenue — last 14 days</h3><span className="muted">{money(s.days.reduce((a, d) => a + d.revenue, 0))} · {s.days.reduce((a, d) => a + d.orders, 0)} orders</span></div>
        <div className="bars" role="img" aria-label="Revenue per day">
          {s.days.map((d) => (
            <div className="bar-col" key={d.day} title={`${d.day}: ${money(d.revenue)} · ${d.orders} orders`}>
              <i style={{ height: `${Math.max(3, (d.revenue / max) * 100)}%` }} className={d.revenue ? '' : 'zero'} />
              <small>{d.day.slice(8)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Top websites</h3><Link href="/admin/payouts" className="muted">Payouts →</Link></div>
          {s.topStores.length === 0 && <p className="muted">No orders yet.</p>}
          {s.topStores.map((t) => (
            <div className="rank-row" key={String(t._id)}>
              <StoreCell s={t.store} />
              <div className="rank-bar"><i style={{ width: `${(t.revenue / topMax) * 100}%` }} /></div>
              <div className="right"><strong>{money(t.revenue)}</strong><small className="muted">{t.orders} orders</small></div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Latest orders</h3><Link href="/admin/orders" className="muted">All orders →</Link></div>
          <table className="tbl"><tbody>
            {s.recent.map((o) => (
              <tr key={o._id}><td><strong>#{o.number}</strong><div className="muted" style={{ fontSize: 12 }}>{o.store?.name} · {o.customer?.name || 'Walk-in'}</div></td><td>{money(o.total)}</td><td><Badge>{String(o.status).replace(/_/g, ' ')}</Badge></td><td className="muted" style={{ fontSize: 12 }}>{fmtDate(o.createdAt)}</td></tr>
            ))}
            {s.recent.length === 0 && <tr><td className="muted">No orders yet.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
