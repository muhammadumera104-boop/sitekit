import { notFound, permanentRedirect } from 'next/navigation';
import { getSite } from '@/lib/server';
import { storeMeta, storeViewport } from '@/lib/meta';
import SiteView from '@/components/site/SiteView';
import Unavailable from '@/components/site/Unavailable';
import VisitBeacon from '@/components/site/VisitBeacon';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { site } = await getSite(params.slug);
  if (!site) return { title: 'Website unavailable' };
  return storeMeta(site);
}
export async function generateViewport({ params }) {
  const { site } = await getSite(params.slug);
  return storeViewport(site);
}

export default async function TenantHome({ params }) {
  const { site, error, message } = await getSite(params.slug);
  if (error === 'MOVED') permanentRedirect(`/${message}`);
  if (error === 'NOT_FOUND') notFound();
  if (!site) return <Unavailable code={error} />;
  return <><SiteView site={site} /><VisitBeacon slug={params.slug} path="/" /></>;
}
