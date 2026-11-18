import { notFound, permanentRedirect } from 'next/navigation';
import { getSite } from '@/lib/server';
import SiteView from '@/components/site/SiteView';
import Unavailable from '@/components/site/Unavailable';
import VisitBeacon from '@/components/site/VisitBeacon';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { site } = await getSite(params.slug);
  if (!site) return { title: 'Website unavailable' };
  const t = site.tenant;
  const pg = site.pages.find((p) => p.slug === params.page);
  const name = pg?.title || params.page.charAt(0).toUpperCase() + params.page.slice(1);
  return { title: `${name} | ${t.seo?.title || t.name}`, description: t.seo?.description || t.branding?.tagline, icons: t.branding?.favicon ? { icon: t.branding.favicon } : undefined };
}

export default async function TenantPage({ params }) {
  const { site, error, message } = await getSite(params.slug);
  if (error === 'MOVED') permanentRedirect(`/${message}/${params.page}`);
  if (error === 'NOT_FOUND') notFound();
  if (!site) return <Unavailable code={error} />;
  const builtin = ['menu', 'products', 'about', 'gallery', 'contact', 'checkout', 'track', 'complaint', 'locations'];
  if (!builtin.includes(params.page) && !site.pages.some((p) => p.slug === params.page)) notFound();
  return <><SiteView site={site} page={params.page} /><VisitBeacon slug={params.slug} path={`/${params.page}`} /></>;
}
