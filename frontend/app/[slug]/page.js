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
  return {
    title: t.seo?.title || t.name,
    description: t.seo?.description || t.branding?.tagline || `Welcome to ${t.name}`,
    icons: t.branding?.favicon ? { icon: t.branding.favicon } : undefined,
    openGraph: { title: t.seo?.title || t.name, description: t.seo?.description, images: t.seo?.ogImage || t.hero?.image ? [t.seo?.ogImage || t.hero.image] : undefined },
  };
}

export default async function TenantHome({ params }) {
  const { site, error, message } = await getSite(params.slug);
  if (error === 'MOVED') permanentRedirect(`/${message}`);
  if (error === 'NOT_FOUND') notFound();
  if (!site) return <Unavailable code={error} />;
  return <><SiteView site={site} /><VisitBeacon slug={params.slug} path="/" /></>;
}
