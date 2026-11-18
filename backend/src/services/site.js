// Builds the data a template needs to render a tenant website.
const { Page, MenuCategory, MenuItem, Media, Template } = require('../models');
const { featuresFor, unitPrice } = require('./features');

const publicTenant = (t) => ({
  id: t._id, name: t.name, slug: t.slug, businessType: t.businessType, status: t.status,
  templateKey: t.templateKey, theme: t.theme, branding: t.branding, hero: t.hero, about: t.about,
  contact: t.contact, socials: t.socials, openingHours: t.openingHours, sections: t.sections, seo: t.seo,
});

// Public view of an item. Honors the discounts / inventory feature toggles.
const publicItem = (i, f) => {
  const tracked = f.inventory && i.stock !== null && i.stock !== undefined;
  const pct = f.discounts ? i.discountPercent || 0 : 0;
  return {
    id: i._id, name: i.name, description: i.description, price: i.price, image: i.image,
    discountPercent: pct, salePrice: unitPrice(i.price, pct, f.discounts),
    isAvailable: i.isAvailable && (!tracked || i.stock > 0),
    lowStock: tracked && i.stock > 0 && i.stock <= 5 ? i.stock : null,
  };
};

exports.publicTenant = publicTenant;
exports.publicItem = publicItem;

exports.buildSite = async (tenant, { preview = false } = {}) => {
  const tenantId = tenant._id;
  const pageFilter = { tenantId, ...(preview ? {} : { isPublished: true }) };
  const features = await featuresFor(tenant);
  const [template, pages, gallery, categories, items] = await Promise.all([
    Template.findOne({ key: tenant.templateKey }).lean(),
    Page.find(pageFilter).sort({ order: 1 }).lean(),
    features.gallery ? Media.find({ tenantId, isGallery: true }).sort({ createdAt: -1 }).limit(60).lean() : [],
    MenuCategory.find({ tenantId, isActive: true }).sort({ order: 1 }).lean(),
    MenuItem.find({ tenantId }).sort({ order: 1, createdAt: 1 }).lean(),
  ]);
  const site = publicTenant(tenant);
  if (!features.gallery) site.sections = { ...site.sections, gallery: false };
  if (!features.contactForm) site.sections = { ...site.sections, contact: site.sections?.contact !== false };
  if (!features.whatsappButton) site.socials = { ...(site.socials || {}), whatsapp: '' };
  return {
    tenant: site,
    features,
    template: template && { key: template.key, name: template.name, dataSchema: template.dataSchema, supportedSections: template.supportedSections },
    nav: pages.filter((p) => p.showInNav).map((p) => ({ title: p.title, slug: p.slug })),
    pages: pages.map((p) => ({ title: p.title, slug: p.slug, sections: p.sections })),
    gallery: gallery.map((g) => ({ id: g._id, url: g.url, caption: g.caption })),
    menu: categories.map((c) => ({
      id: c._id, name: c.name,
      items: items.filter((i) => String(i.categoryId) === String(c._id)).map((i) => publicItem(i, features)),
    })),
  };
};
