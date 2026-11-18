import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getSite, getItem } from '@/lib/server';
import SiteView, { Dish } from '@/components/site/SiteView';
import Unavailable from '@/components/site/Unavailable';
import AddToCart from '@/components/site/AddToCart';
import VisitBeacon from '@/components/site/VisitBeacon';
import { Price } from '@/components/site/StoreCatalog';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { site } = await getSite(params.slug);
  const data = site && (await getItem(params.slug, params.id));
  if (!data) return { title: 'Not found' };
  const { item } = data;
  return {
    title: `${item.name} | ${site.tenant.name}`,
    description: item.description || site.tenant.seo?.description,
    openGraph: { title: item.name, description: item.description, images: item.image ? [item.image] : undefined },
  };
}

export default async function ItemPage({ params }) {
  const { site, error, message } = await getSite(params.slug);
  if (error === 'MOVED') permanentRedirect(`/${message}/${params.page}/${params.id}`);
  if (error === 'NOT_FOUND') notFound();
  if (!site) return <Unavailable code={error} />;
  if (!['menu', 'products'].includes(params.page)) notFound();
  const data = await getItem(params.slug, params.id);
  if (!data) notFound();
  const { item, category, related } = data;
  const t = site.tenant;
  const isStore = t.templateKey === 'store';
  const listHref = `/${t.slug}/${isStore ? 'products' : 'menu'}`;
  const cartOn = !!site.features?.cart; // feature toggle, independent of the template

  const detail = (
    <div>
      <p className="crumbs"><Link href={`/${t.slug}`}>Home</Link> › <Link href={listHref}>{isStore ? 'Products' : 'Menu'}</Link>{category && <> › {category.name}</>}</p>
      <div className="detail">
        <div className="detail-img">{item.image ? <img src={item.image} alt={item.name} /> : <div className="ph big">🍽️</div>}</div>
        <div>
          {category && <span className="eyebrow">{category.name}</span>}
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>{item.name}</h1>
          <div style={{ fontSize: 28, margin: '4px 0 16px' }}><Price i={item} />{item.discountPercent > 0 && <span className="ribbon sale inline">{item.discountPercent}% OFF</span>}</div>
          {item.lowStock && <p className="low-stock">Only {item.lowStock} left in stock!</p>}
          <p className="lead left" style={{ marginBottom: 22 }}>{item.description || 'Freshly prepared for you.'}</p>
          {cartOn
            ? <AddToCart id={item.id} disabled={!item.isAvailable} label={item.discountPercent > 0 ? 'Add to cart with discount' : 'Add to cart'} />
            : <div className="row">{item.isAvailable ? <Link className="cta" href={`/${t.slug}/contact`}>Order or enquire</Link> : <span className="sold">Currently unavailable</span>}<Link className="cta alt dark" href={listHref}>Back to menu</Link></div>}
        </div>
      </div>
      {related.length > 0 && (
        <div style={{ marginTop: 56 }}>
          <h3 className="cat-title">You may also like</h3>
          <div className="dish-grid">{related.map((r) => <Dish key={r.id} i={r} href={`/${t.slug}/${params.page}/${r.id}`} />)}</div>
        </div>
      )}
    </div>
  );
  return <><SiteView site={site} page={params.page} detail={detail} /><VisitBeacon slug={params.slug} path={`/${params.page}/${item.name}`} /></>;
}
