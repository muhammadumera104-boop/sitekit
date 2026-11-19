'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, qs } from '@/lib/api';
import { money } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Loading, Pager, useLoad } from '@/components/ui';
import { StoreCell, useSearch, useStores } from '@/components/admin/bits';

// Pick a website and see the products it has listed. Opens on the first website that has products.
function Products() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const canModerate = user.permissions.includes('catalog.moderate');
  const stores = useStores();
  const [store, setStore] = useState(params.get('store') || null); // null = not decided yet, '' = all websites
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ, dq] = useSearch();
  const [err, setErr] = useState('');

  const { data, error, loading, reload } = useLoad(
    () => (store === null ? Promise.resolve(null) : api(`/admin/products${qs({ tenantId: store, state, q: dq, page, limit: 20 })}`)),
    [store, state, dq, page],
  );
  // First load: counts come with any product request, so ask once without a store to learn which website to open.
  const counts = useLoad(() => api('/admin/products?limit=1'), []);
  useEffect(() => {
    if (store !== null || !stores.data || !counts.data) return;
    const best = [...stores.data.stores].sort((a, b) => (counts.data.counts[String(b.id)] || 0) - (counts.data.counts[String(a.id)] || 0))[0];
    setStore(best && (counts.data.counts[String(best.id)] || 0) > 0 ? String(best.id) : '');
  }, [store, stores.data, counts.data]);

  const countOf = (id) => counts.data?.counts?.[String(id)] || 0;
  const total = useMemo(() => Object.values(counts.data?.counts || {}).reduce((a, b) => a + b, 0), [counts.data]);
  const current = stores.data?.stores.find((s) => String(s.id) === store);
  const choose = (id) => { setStore(id); setPage(1); setQ(''); router.replace(id ? `/admin/products?store=${id}` : '/admin/products', { scroll: false }); };

  async function toggle(p) {
    setErr('');
    try { await api(`/admin/products/${p._id}`, { method: 'PATCH', body: { isAvailable: !p.isAvailable } }); reload(); counts.reload?.(); } catch (e) { setErr(e.message); }
  }
  async function openDashboard() {
    try { await api(`/admin/tenants/${current.id}/impersonate`, { method: 'POST' }); router.push(`/dashboard/${current.slug}/menu`); } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Products</h1><p className="muted" style={{ margin: '4px 0 0' }}>{current ? `Everything listed on ${current.name}.` : 'Products listed on every website.'} {data ? `${data.total} item${data.total === 1 ? '' : 's'}` : ''}</p></div>
        {current && <div className="row">
          {current.status === 'active' && <a className="btn" href={`/${current.slug}`} target="_blank" rel="noopener noreferrer">Open website ↗</a>}
          <button className="btn primary" onClick={openDashboard}>Manage in store dashboard</button>
        </div>}
      </div>
      <Alert>{error || err || stores.error}</Alert>

      <div className="store-chips" role="tablist" aria-label="Choose a website">
        <button className={`store-chip ${store === '' ? 'on' : ''}`} onClick={() => choose('')} role="tab" aria-selected={store === ''}><span className="dot-logo">∗</span><span><strong>All websites</strong><small>{total} products</small></span></button>
        {stores.data?.stores.map((s) => (
          <button key={s.id} className={`store-chip ${store === String(s.id) ? 'on' : ''}`} onClick={() => choose(String(s.id))} role="tab" aria-selected={store === String(s.id)}>
            {s.logo ? <img src={s.logo} alt="" /> : <span className="dot-logo">{s.name.charAt(0)}</span>}
            <span><strong>{s.name}</strong><small>{countOf(s.id)} products</small></span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search products…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search products" />
        <div className="pill-tabs">{[['', 'All'], ['sale', 'On sale'], ['unavailable', 'Hidden']].map(([v, l]) => <button key={v} className={state === v ? 'on' : ''} onClick={() => { setState(v); setPage(1); }}>{l}</button>)}</div>
      </div>

      <div className="card">
        {(loading && !data) || store === null ? <Loading /> : !data?.items.length ? <p className="muted center">No products found.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th /><th>Product</th>{store === '' && <th>Website</th>}<th>Price</th><th>Stock</th><th>Tags</th><th>Status</th><th /></tr></thead>
            <tbody>{data.items.map((p) => {
              const sale = Math.round(p.price * (1 - p.discountPercent / 100));
              return (
                <tr key={p._id}>
                  <td style={{ width: 70 }}>{p.image ? <img className="prod-thumb" src={p.image} alt="" loading="lazy" /> : <div className="prod-thumb" />}</td>
                  <td><strong>{p.name}</strong><div className="muted" style={{ fontSize: 12 }}>{p.category}{p.options > 0 ? ` · ${p.options} option group${p.options > 1 ? 's' : ''}` : ''}</div></td>
                  {store === '' && <td><StoreCell s={p.store} /></td>}
                  <td>{p.discountPercent > 0 ? <><s className="muted">{money(p.price)}</s> <strong>{money(sale)}</strong> <Badge>{p.discountPercent}% off</Badge></> : money(p.price)}</td>
                  <td>{p.stock === null ? <span className="muted">not tracked</span> : p.stock === 0 ? <span className="sold">sold out</span> : p.stock}</td>
                  <td>{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</td>
                  <td><Badge>{p.isAvailable ? 'active' : 'hidden'}</Badge></td>
                  <td>{canModerate && <button className="btn sm" onClick={() => toggle(p)}>{p.isAvailable ? 'Hide' : 'Show'}</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </>
  );
}

export default function ProductsPage() { return <Suspense fallback={<Loading />}><Products /></Suspense>; }
