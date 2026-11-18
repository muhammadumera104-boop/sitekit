'use client';
import { api } from '@/lib/api';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Loading, useLoad } from '@/components/ui';

export default function Analytics() {
  const { slug } = useTenant();
  const { data, error, loading } = useLoad(() => api('/tenant/analytics', { tenant: slug }), [slug]);
  const max = Math.max(1, ...(data?.perDay.map((d) => d.visits) || [1]));
  return (
    <Protected area="tenant" slug={slug} perm="analytics.view">
      <div className="page-head"><h1>Analytics</h1><span className="muted">Last 30 days</span></div>
      <Alert>{error}</Alert>
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="stats">
            <div className="stat"><div className="n">{data.visits}</div><div className="l">Page visits</div></div>
            <div className="stat"><div className="n">{data.messages}</div><div className="l">Messages received</div></div>
            <div className="stat"><div className="n">{data.unread}</div><div className="l">Unread</div></div>
          </div>
          <div className="grid2" style={{ alignItems: 'start' }}>
            <div className="card">
              <h3>Visits per day</h3>
              {data.perDay.length === 0 ? <p className="muted">No visits recorded yet.</p> : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 160, overflowX: 'auto' }} role="img" aria-label="Visits per day bar chart">
                  {data.perDay.map((d) => <div key={d.day} title={`${d.day}: ${d.visits}`} style={{ flex: '1 0 14px', height: `${(d.visits / max) * 100}%`, minHeight: 3, background: 'var(--brand)', borderRadius: '4px 4px 0 0' }} />)}
                </div>
              )}
            </div>
            <div className="card">
              <h3>Popular pages</h3>
              <table className="tbl"><tbody>
                {data.popular.map((p) => <tr key={p.path}><td>/{slug}{p.path === '/' ? '' : p.path}</td><td style={{ textAlign: 'right' }}><strong>{p.visits}</strong></td></tr>)}
                {!data.popular.length && <tr><td className="muted">No data yet.</td></tr>}
              </tbody></table>
            </div>
          </div>
        </>
      )}
    </Protected>
  );
}
