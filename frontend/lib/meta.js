// Page metadata for a store: its own tab icon (favicon, else logo), title, description and share image.
const onHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#4f46e5');

export function storeMeta(site, pageTitle) {
  const t = site.tenant;
  const icon = t.branding?.favicon || t.branding?.logo;
  const base = t.seo?.title || t.name;
  const title = pageTitle ? `${pageTitle} | ${base}` : base;
  const description = t.seo?.description || t.branding?.tagline || `Order online from ${t.name}`;
  const image = t.seo?.ogImage || t.hero?.image;
  return {
    title, description,
    applicationName: t.name,
    icons: icon ? { icon, shortcut: icon, apple: icon } : undefined,
    openGraph: { title, description, siteName: t.name, type: 'website', images: image ? [image] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : undefined },
  };
}
export const storeViewport = (site) => ({ themeColor: onHex(site?.tenant?.theme?.primary), width: 'device-width', initialScale: 1 });
