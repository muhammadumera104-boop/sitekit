const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { Tenant, Message, Visit, Page, User, MenuItem, MenuCategory } = require('../models');
const { HttpError, wrap } = require('../utils/helpers');
const { buildSite, publicItem } = require('../services/site');
const { featuresFor } = require('../services/features');
const { placeOrder } = require('../services/orders');
const { sendMail } = require('../services/email');

const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many orders, please try later' } });
const contactLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many messages, please try later' } });

// Resolver kept as its own function so path-based lookup can later become subdomain/custom-domain lookup.
async function resolveTenant(slug) {
  const tenant = await Tenant.findOne({ slug: String(slug).toLowerCase() });
  if (!tenant) {
    const moved = await Tenant.findOne({ previousSlugs: String(slug).toLowerCase(), status: { $nin: ['deleted'] } }).select('slug');
    if (moved) throw new HttpError(404, moved.slug, 'MOVED'); // message carries the new slug; frontend redirects
  }
  if (!tenant || tenant.status === 'deleted') throw new HttpError(404, 'Website not found', 'NOT_FOUND');
  if (tenant.status === 'suspended') throw new HttpError(403, 'This website is currently unavailable', 'SUSPENDED');
  if (tenant.status === 'draft') throw new HttpError(403, 'This website has not been published yet', 'DRAFT');
  return tenant;
}

// Branding for a business's own staff login page. Works for draft sites (owners must log in to publish),
// but not for suspended/deleted/unknown ones. There is deliberately NO endpoint that lists tenants.
router.get('/tenants/:slug/brand', wrap(async (req, res) => {
  const t = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase() }).select('name slug status branding theme');
  if (!t || t.status === 'deleted') throw new HttpError(404, 'Website not found', 'NOT_FOUND');
  if (t.status === 'suspended') throw new HttpError(403, 'This website is currently unavailable', 'SUSPENDED');
  res.json({ name: t.name, slug: t.slug, logo: t.branding?.logo, tagline: t.branding?.tagline, primary: t.theme?.primary, secondary: t.theme?.secondary });
}));

router.get('/tenants/:slug', wrap(async (req, res) => {
  res.json(await buildSite(await resolveTenant(req.params.slug)));
}));

router.get('/tenants/:slug/menu', wrap(async (req, res) => {
  const site = await buildSite(await resolveTenant(req.params.slug));
  res.json({ menu: site.menu });
}));

// Single product / menu item (product detail page)
router.get('/tenants/:slug/items/:id', wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw new HttpError(404, 'Item not found', 'NOT_FOUND');
  const item = await MenuItem.findOne({ _id: req.params.id, tenantId: tenant._id }).lean();
  if (!item) throw new HttpError(404, 'Item not found', 'NOT_FOUND');
  const category = await MenuCategory.findOne({ _id: item.categoryId, tenantId: tenant._id }).lean();
  const related = await MenuItem.find({ tenantId: tenant._id, categoryId: item.categoryId, _id: { $ne: item._id } }).limit(4).lean();
  const features = await featuresFor(tenant);
  // publicItem honours the discounts / inventory toggles (sale price, sold out, low stock).
  res.json({ item: publicItem(item, features), category: category && { id: category._id, name: category.name }, related: related.map((i) => publicItem(i, features)), features });
}));

router.get('/tenants/:slug/pages/:page', wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const page = await Page.findOne({ tenantId: tenant._id, slug: req.params.page, isPublished: true }).lean();
  if (!page) throw new HttpError(404, 'Page not found', 'NOT_FOUND');
  res.json({ page });
}));

router.post('/tenants/:slug/contact', contactLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const data = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    email: z.string().email('Valid email required').optional().or(z.literal('')),
    phone: z.string().trim().max(30).optional(),
    message: z.string().trim().min(2, 'Message is required').max(3000),
  }).parse(req.body);
  await Message.create({ tenantId: tenant._id, ...data }); // tenantId derived from slug, never from the body
  const owners = await User.find({ tenantId: tenant._id, role: 'tenant_owner', status: 'active' }).select('email');
  const to = tenant.contact?.email || owners[0]?.email;
  await sendMail({ to, subject: `New message on ${tenant.name}`, text: `From: ${data.name} ${data.email || ''} ${data.phone || ''}\n\n${data.message}` });
  res.status(201).json({ message: 'Thanks! Your message has been sent.' });
}));

// Online checkout: needs the "cart" and "online orders" features. Prices and stock are checked on the server.
router.post('/tenants/:slug/orders', orderLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const features = await featuresFor(tenant);
  if (!features.cart || !features.onlineOrders) throw new HttpError(403, 'Online ordering is not available for this store', 'FEATURE_OFF');
  const d = z.object({
    items: z.array(z.object({ id: z.string(), qty: z.coerce.number() })).min(1, 'Your cart is empty').max(60),
    customer: z.object({
      name: z.string().trim().min(1, 'Name is required').max(100), phone: z.string().trim().min(5, 'Phone is required').max(40),
      address: z.string().trim().min(3, 'Delivery address is required').max(300), note: z.string().trim().max(500).optional(),
    }),
  }).parse(req.body);
  const order = await placeOrder(d.items.map((i) => ({ itemId: i.id, qty: i.qty })), {
    tenant, features, source: 'online', customer: d.customer, paymentMethod: 'cod', paymentStatus: 'unpaid', status: 'new',
  });
  res.status(201).json({ order: { number: order.number, total: order.total, discount: order.discount } });
}));

router.post('/tenants/:slug/visit', wrap(async (req, res) => {
  const tenant = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase(), status: 'active' }).select('_id');
  if (tenant) {
    await Visit.create({ tenantId: tenant._id, path: String(req.body?.path || '/').slice(0, 100), day: new Date().toISOString().slice(0, 10) });
  }
  res.json({ ok: true });
}));

module.exports = router;
