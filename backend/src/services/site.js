// Builds the data a template needs to render a tenant website.
const { Page, MenuCategory, MenuItem, Media, Template, ServiceArea, Branch, Review } = require('../models');
const { featuresFor, unitPrice } = require('./features');

const publicTenant = (t) => ({
  id: t._id, name: t.name, slug: t.slug, businessType: t.businessType, status: t.status,
  templateKey: t.templateKey, theme: t.theme, branding: t.branding, hero: t.hero, about: t.about,
  contact: t.contact, socials: t.socials, openingHours: t.openingHours, sections: t.sections, seo: t.seo,
  announcement: t.announcement?.enabled !== false && t.announcement?.text ? { text: t.announcement.text } : null,
  slides: (t.slides || []).filter((s) => s.title || s.image).map((s) => ({ eyebrow: s.eyebrow, title: s.title, subtitle: s.subtitle, image: s.image, cta: s.cta, link: s.link })),
  flashSale: t.flashSale?.enabled && t.flashSale.endsAt && new Date(t.flashSale.endsAt) > new Date() ? { title: t.flashSale.title || 'Flash sale', endsAt: t.flashSale.endsAt } : null,
});

// Public view of an item. Honors the discounts / inventory feature toggles.
const publicItem = (i, f) => {
  const tracked = f.inventory && i.stock !== null && i.stock !== undefined;
  const pct = f.discounts ? i.discountPercent || 0 : 0;
  return {
    id: i._id, name: i.name, description: i.description, price: i.price, image: i.image, tags: i.tags || [],
    discountPercent: pct, salePrice: unitPrice(i.price, pct, f.discounts),
    isAvailable: i.isAvailable && (!tracked || i.stock > 0),
    lowStock: tracked && i.stock > 0 && i.stock <= 5 ? i.stock : null,
    optionGroups: (i.optionGroups || []).map((g) => ({
      id: String(g._id), name: g.name, required: g.required, multiple: g.multiple, min: g.min, max: g.max,
      options: g.options.map((o) => ({ id: String(o._id), name: o.name, price: o.price || 0, color: o.color || undefined })),
    })),
  };
};

exports.publicTenant = publicTenant;
exports.publicItem = publicItem;

exports.buildSite = async (tenant, { preview = false } = {}) => {
  const tenantId = tenant._id;
  const pageFilter = { tenantId, ...(preview ? {} : { isPublished: true }) };
  const features = await featuresFor(tenant);
  const [template, pages, gallery, categories, items, areaDocs, branchDocs, reviewAgg, reviewDocs] = await Promise.all([
    Template.findOne({ key: tenant.templateKey }).lean(),
    Page.find(pageFilter).sort({ order: 1 }).lean(),
    features.gallery ? Media.find({ tenantId, isGallery: true }).sort({ createdAt: -1 }).limit(60).lean() : [],
    MenuCategory.find({ tenantId, isActive: true }).sort({ order: 1 }).lean(),
    MenuItem.find({ tenantId }).sort({ order: 1, createdAt: 1 }).lean(),
    ServiceArea.find({ tenantId, isActive: true }).sort({ city: 1, name: 1 }).lean(),
    Branch.find({ tenantId, isActive: true }).sort({ name: 1 }).select('name address phone').lean(),
    features.reviews ? Review.aggregate([{ $match: { tenantId, isPublished: true } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]) : [],
    features.reviews ? Review.find({ tenantId, isPublished: true, comment: { $nin: [null, ''] } }).sort({ createdAt: -1 }).limit(6).select('name rating comment reply createdAt').lean() : [],
  ]);
  const cities = new Map();
  for (const a of areaDocs) {
    if (!cities.has(a.city)) cities.set(a.city, []);
    cities.get(a.city).push({ id: a._id, name: a.name, deliveryFee: a.deliveryFee, minOrder: a.minOrder });
  }
  const site = publicTenant(tenant);
  if (!features.gallery) site.sections = { ...site.sections, gallery: false };
  if (!features.contactForm) site.sections = { ...site.sections, contact: site.sections?.contact !== false };
  if (!features.whatsappButton) site.socials = { ...(site.socials || {}), whatsapp: '' };
  return {
    tenant: site,
    features,
    ordering: {
      taxPercent: tenant.ordering?.taxPercent || 0, taxInclusive: tenant.ordering?.taxInclusive !== false, taxLabel: tenant.ordering?.taxLabel || 'Tax',
      minOrder: tenant.ordering?.minOrder || 0, etaMinutes: tenant.ordering?.etaMinutes || 45, etaLabel: tenant.ordering?.etaLabel || '', freeDeliveryOver: tenant.ordering?.freeDeliveryOver || 0, pickup: !!features.pickup,
      paymentAccounts: features.onlinePayments ? (tenant.ordering?.paymentAccounts || []).filter((a) => a.enabled !== false && a.accountNumber).map((a) => ({ method: a.method, accountName: a.accountName, accountNumber: a.accountNumber, instructions: a.instructions })) : [],
    },
    reviews: reviewAgg[0] ? { avg: Math.round(reviewAgg[0].avg * 10) / 10, count: reviewAgg[0].n, items: reviewDocs.map((r) => ({ name: r.name, rating: r.rating, comment: r.comment, reply: r.reply })) } : null,
    locations: features.locations ? [...cities].map(([city, areas]) => ({ city, areas })) : [],
    branches: branchDocs.map((b) => ({ id: b._id, name: b.name, address: b.address, phone: b.phone })),
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
