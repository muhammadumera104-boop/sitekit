'use client';
import { api } from '@/lib/api';
import { useTenant } from '@/components/TenantCtx';
import { Protected } from '@/components/Shell';
import { Alert, Loading, useLoad } from '@/components/ui';
import SiteView from '@/components/site/SiteView';

export default function Preview() {
  const { slug } = useTenant();
  const { data, error, loading } = useLoad(() => api('/tenant/preview', { tenant: slug }), [slug]);
  return (
    <Protected area="tenant" slug={slug} perm="content.manage">
      <div className="page-head"><h1>Preview</h1></div>
      <p className="muted">This shows your latest changes, including drafts and unpublished pages. Publish from the Overview page when you are happy.</p>
      <Alert>{error}</Alert>
      {loading ? <Loading /> : data && <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ maxHeight: '75vh', overflow: 'auto' }}><SiteView site={data} preview /></div></div>}
    </Protected>
  );
}
