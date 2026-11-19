'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate, money } from '@/lib/util';
import { useAuth } from '@/lib/auth';
import { Alert, Badge, Field, Loading, Modal, useLoad } from '@/components/ui';
import { StoreCell } from '@/components/admin/bits';

const METHODS = [['bank', 'Bank transfer'], ['jazzcash', 'JazzCash'], ['easypaisa', 'Easypaisa'], ['cash', 'Cash'], ['other', 'Other']];

// What each website has earned (delivered + paid orders), the platform commission from its plan, and what you have paid out.
export default function Payouts() {
  const { user } = useAuth();
  const can = user.permissions.includes('payouts.manage');
  const { data, error, loading, reload } = useLoad(() => api('/admin/payouts'));
  const [pay, setPay] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  async function act(fn, ok) { setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); reload(); } catch (e) { setErr(e.message); } }
  if (loading && !data) return <Loading />;
  const t = data?.totals || {};
  return (
    <>
      <div className="page-head"><div><h1>Payouts</h1><p className="muted" style={{ margin: '4px 0 0' }}>Earnings = delivered and paid orders. Commission comes from each website&apos;s plan.</p></div></div>
      <Alert>{error || err}</Alert><Alert type="success">{msg}</Alert>
      <div className="sum-cards">
        <div className="stat"><div className="n">{money(t.gross)}</div><div className="l">Gross sales</div></div>
        <div className="stat"><div className="n">{money(t.commission)}</div><div className="l">Platform commission</div></div>
        <div className="stat"><div className="n">{money(t.paidOut)}</div><div className="l">Paid out</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--warn)' }}>{money(t.balance)}</div><div className="l">Owed to websites</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Balance per website</h3>
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Website</th><th>Plan</th><th>Orders</th><th>Gross</th><th>Commission</th><th>Net earnings</th><th>Paid out</th><th>Balance</th><th /></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.store.id}>
              <td><StoreCell s={r.store} /></td>
              <td>{r.plan ? `${r.plan.name} · ${r.plan.commissionPercent}%` : <span className="muted">No plan</span>}</td>
              <td>{r.orders}</td><td>{money(r.gross)}</td><td className="muted">− {money(r.commission)}</td><td>{money(r.net)}</td><td>{money(r.paidOut)}</td>
              <td><strong style={{ color: r.balance > 0 ? 'var(--warn)' : undefined }}>{money(r.balance)}</strong></td>
              <td>{can && <button className="btn sm primary" disabled={r.balance <= 0} onClick={() => setPay(r)}>Pay out</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h3>Payout history</h3>
        {!data.items.length ? <p className="muted">No payouts recorded yet.</p> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Website</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Date</th><th /></tr></thead>
            <tbody>{data.items.map((p) => (
              <tr key={p._id}>
                <td><StoreCell s={p.store} /></td><td><strong>{money(p.amount)}</strong></td><td>{(METHODS.find((m) => m[0] === p.method) || [])[1] || p.method}</td>
                <td>{p.reference || '—'}<div className="muted" style={{ fontSize: 12 }}>{p.note}</div></td><td><Badge>{p.status}</Badge></td><td className="muted">{fmtDate(p.paidAt || p.createdAt)}</td>
                <td>{can && <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn sm" onClick={() => act(() => api(`/admin/payouts/${p._id}`, { method: 'PATCH', body: { status: p.status === 'paid' ? 'pending' : 'paid' } }))}>{p.status === 'paid' ? 'Mark pending' : 'Mark paid'}</button>
                  <button className="btn sm danger" onClick={() => confirm('Delete this payout record?') && act(() => api(`/admin/payouts/${p._id}`, { method: 'DELETE' }), 'Payout deleted.')}>Delete</button>
                </div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {pay && <PayModal row={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); setMsg('Payout recorded.'); reload(); }} />}
    </>
  );
}

function PayModal({ row, onClose, onDone }) {
  const [f, setF] = useState({ amount: row.balance, method: 'bank', reference: '', note: '', status: 'paid' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault(); setErr('');
    try { await api('/admin/payouts', { method: 'POST', body: { ...f, tenantId: String(row.store.id), amount: Number(f.amount) } }); onDone(); } catch (x) { setErr(x.message); }
  }
  return (
    <Modal title={`Pay out ${row.store.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <Alert>{err}</Alert>
        <p className="muted" style={{ marginTop: 0 }}>Current balance: <strong>{money(row.balance)}</strong></p>
        <Field label="Amount (Rs.)" type="number" min="1" value={f.amount} onChange={set('amount')} required autoFocus />
        <div className="grid2">
          <Field label="Method"><select value={f.method} onChange={set('method')}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Status"><select value={f.status} onChange={set('status')}><option value="paid">Paid now</option><option value="pending">Pending (scheduled)</option></select></Field>
        </div>
        <Field label="Reference / transaction ID" value={f.reference} onChange={set('reference')} />
        <Field label="Note" value={f.note} onChange={set('note')} />
        <div className="row"><button className="btn primary">Record payout</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
