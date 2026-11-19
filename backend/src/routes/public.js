const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { Tenant, Message, Visit, Page, User, MenuItem, MenuCategory, ServiceArea, Order, Branch, Customer, Review } = require('../models');
const { HttpError, wrap } = require('../utils/helpers');
const { buildSite, publicItem } = require('../services/site');
const { featuresFor } = require('../services/features');
const { placeOrder } = require('../services/orders');
const { findUsablePromo, promoAmount } = require('../services/promos');
const { notifyOrder } = require('../services/notify');
const { unitPrice } = require('../services/features');
const trackLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: Number(process.env.ORDER_RATE_LIMIT || 60), standardHeaders: true, legacyHeaders: false, message: { message: 'Too many lookups, please try later' } });
const { sendMail } = require('../services/email');

const orderLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: Number(process.env.ORDER_RATE_LIMIT || 20), standardHeaders: true, legacyHeaders: false, message: { message: 'Too many orders, please try later' } });
const contactLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many messages, please try later' } });

// Platform maintenance switch (Admin -> Platform settings). Cached for a few seconds so it costs almost nothing.
let maint = { at: 0, v: null };
async function maintenanceNotice() {
  if (Date.now() - maint.at > 5000) {
    const doc = await require('../models').PlatformSetting.findOne({ key: 'settings' }).lean();
    maint = { at: Date.now(), v: doc?.value?.maintenanceMode ? (doc.value.maintenanceMessage || 'We are doing some quick maintenance and will be back shortly.') : null };
  }
  return maint.v;
}

// Resolver kept as its own function so path-based lookup can later become subdomain/custom-domain lookup.
async function resolveTenant(slug) {
  const notice = await maintenanceNotice();
  if (notice) throw new HttpError(503, notice, 'MAINTENANCE');
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

// Platform name / support / maintenance notice (no secrets).
router.get('/platform', wrap(async (_req, res) => {
  const doc = await require('../models').PlatformSetting.findOne({ key: 'settings' }).lean();
  const v = doc?.value || {};
  res.json({ name: v.platformName || 'SiteForge', supportEmail: v.supportEmail || '', supportPhone: v.supportPhone || '', maintenance: v.maintenanceMode ? (v.maintenanceMessage || 'Maintenance in progress') : null });
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

// Optional customer sign-in: if the request carries a valid customer token for THIS store, the order is linked to that customer.
async function customerFrom(req, tenant) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(h.slice(7), env.accessSecret);
    if (p.typ !== 'customer' || String(p.tid) !== String(tenant._id)) return null;
    return await Customer.findOne({ _id: p.sub, tenantId: tenant._id });
  } catch { return null; }
}
const phoneDigits = (p) => String(p || '').replace(/\D/g, '');

// Promo code check for the cart (the real discount is re-checked when the order is placed).
router.post('/tenants/:slug/promo/validate', orderLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const features = await featuresFor(tenant);
  if (!features.promos) throw new HttpError(403, 'Promo codes are not available', 'FEATURE_OFF');
  const d = z.object({ code: z.string().trim().min(1).max(40), subtotal: z.coerce.number().min(0).optional() }).parse(req.body);
  const promo = await findUsablePromo(tenant._id, d.code, d.subtotal);
  res.json({ promo: { code: promo.code, type: promo.type, value: promo.value, minOrder: promo.minOrder, maxDiscount: promo.maxDiscount, description: promo.description, discount: d.subtotal !== undefined ? promoAmount(promo, d.subtotal) : undefined } });
}));

// Online checkout: needs the "cart" and "online orders" features. Prices, options, promo, tax, delivery fee and stock are checked on the server.
router.post('/tenants/:slug/orders', orderLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const features = await featuresFor(tenant);
  if (!features.cart || !features.onlineOrders) throw new HttpError(403, 'Online ordering is not available for this store', 'FEATURE_OFF');
  const str = (max) => z.string().trim().max(max).optional().or(z.literal(''));
  const d = z.object({
    items: z.array(z.object({
      id: z.string(), qty: z.coerce.number(), note: str(500),
      options: z.array(z.object({ groupId: z.string(), optionId: z.string() })).max(30).optional(),
    })).min(1, 'Your cart is empty').max(80),
    orderType: z.enum(['delivery', 'pickup']).default('delivery'),
    areaId: z.string().nullable().optional(),
    customer: z.object({
      title: str(10), name: z.string().trim().min(1, 'Name is required').max(100), phone: z.string().trim().min(7, 'Mobile number is required').max(40),
      altPhone: str(40), address: str(300), landmark: str(150), email: str(120),
      location: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).optional(),
    }),
    instructions: str(500), changeFor: z.coerce.number().min(0).max(1000000).optional(),
    gift: z.object({ isGift: z.boolean().optional(), recipientName: str(100), recipientPhone: str(40), message: str(300) }).optional(),
    promoCode: str(40),
    paymentMethod: z.enum(['cod', 'jazzcash', 'easypaisa', 'bank']).default('cod'),
    paymentRef: str(80), paymentSender: str(60),
  }).parse(req.body);

  if (d.orderType === 'pickup' && !features.pickup) throw new HttpError(400, 'Pickup is not available', 'FEATURE_OFF');
  // When the store has delivery areas, the customer must pick one (it decides the branch, fee and minimum order).
  let area = null;
  const areaCount = features.locations ? await ServiceArea.countDocuments({ tenantId: tenant._id, isActive: true }) : 0;
  if (areaCount) {
    if (!d.areaId || !/^[a-f0-9]{24}$/i.test(d.areaId)) throw new HttpError(400, 'Please select your delivery location', 'AREA_REQUIRED');
    area = await ServiceArea.findOne({ _id: d.areaId, tenantId: tenant._id, isActive: true }).lean();
    if (!area) throw new HttpError(400, 'That location is not available', 'AREA_REQUIRED');
  }
  if (d.orderType === 'delivery' && !(d.customer.address || '').trim()) throw new HttpError(400, 'Delivery address is required', 'ADDRESS_REQUIRED');

  // Payment: cash on delivery / at pickup, or a manual transfer (JazzCash, Easypaisa, bank) that staff verify.
  let paymentStatus = 'unpaid';
  if (d.paymentMethod !== 'cod') {
    const acct = features.onlinePayments && (tenant.ordering?.paymentAccounts || []).find((a) => a.method === d.paymentMethod && a.enabled !== false && a.accountNumber);
    if (!acct) throw new HttpError(400, 'That payment method is not available', 'PAYMENT_UNAVAILABLE');
    if (!d.paymentRef || d.paymentRef.length < 4) throw new HttpError(400, 'Enter the transaction ID of your payment', 'PAYMENT_REF');
    paymentStatus = 'pending';
  }

  // Promo: look up the cart value first so the right code and minimum order are checked.
  let promo = null;
  if (d.promoCode) {
    if (!features.promos) throw new HttpError(400, 'Promo codes are not available', 'PROMO_INVALID');
    const ids = d.items.map((i) => i.id).filter((id) => /^[a-f0-9]{24}$/i.test(id));
    const docs = await MenuItem.find({ _id: { $in: ids }, tenantId: tenant._id }).lean();
    const byId = new Map(docs.map((i) => [String(i._id), i]));
    const approx = d.items.reduce((s, l) => {
      const it = byId.get(l.id);
      if (!it) return s;
      const extra = (l.options || []).reduce((a, sel) => a + (it.optionGroups?.find((g) => String(g._id) === sel.groupId)?.options.find((o) => String(o._id) === sel.optionId)?.price || 0), 0);
      return s + (unitPrice(it.price, it.discountPercent, features.discounts) + extra) * (Number(l.qty) || 0);
    }, 0);
    promo = await findUsablePromo(tenant._id, d.promoCode, approx);
  }

  const customerDoc = await customerFrom(req, tenant);
  const order = await placeOrder(d.items.map((i) => ({ itemId: i.id, qty: i.qty, note: i.note, options: i.options })), {
    tenant, features, source: 'online', orderType: d.orderType, area, customerId: customerDoc?._id || null,
    customer: { ...d.customer, address: d.orderType === 'delivery' ? d.customer.address : '' },
    instructions: d.instructions, changeFor: d.changeFor, gift: d.gift?.isGift ? d.gift : undefined, promo,
    paymentMethod: d.paymentMethod, paymentStatus, paymentRef: d.paymentRef || undefined, paymentSender: d.paymentSender || undefined, status: 'new',
  });
  await notifyOrder(tenant, order, 'placed');
  res.status(201).json({ order: { number: order.number, total: order.total, tax: order.tax, deliveryFee: order.deliveryFee, discount: order.discount, promoDiscount: order.promoDiscount, orderType: order.orderType, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus } });
}));

// Order tracking: the customer needs BOTH the order number and the phone used at checkout.
router.get('/tenants/:slug/orders/track', trackLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const features = await featuresFor(tenant);
  if (!features.orderTracking) throw new HttpError(403, 'Order tracking is not available', 'FEATURE_OFF');
  const number = String(req.query.number || '').trim().toUpperCase().replace(/^#/, '');
  const phone = phoneDigits(req.query.phone);
  if (!number || phone.length < 7) throw new HttpError(400, 'Enter your order number and phone number');
  const order = await Order.findOne({ tenantId: tenant._id, number, source: 'online' }).populate('riderId', 'name phone').lean();
  const same = order && phoneDigits(order.customer?.phone).slice(-7) === phone.slice(-7);
  if (!same) throw new HttpError(404, 'We could not find an order with those details', 'NOT_FOUND');
  const out = order.status === 'out_for_delivery' && order.riderId;
  const live = features.liveTracking && out && order.riderLocation?.lat != null;
  res.json({
    order: {
      number: order.number, status: order.status, orderType: order.orderType, createdAt: order.createdAt, history: (order.history || []).map((h) => ({ status: h.status, at: h.at })),
      items: order.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, options: (i.options || []).map((o) => o.name) })), tax: order.tax, deliveryFee: order.deliveryFee, discount: order.discount, promoDiscount: order.promoDiscount, promoCode: order.promoCode, total: order.total,
      area: order.area, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, etaMinutes: tenant.ordering?.etaMinutes || 45,
      rider: out ? { name: order.riderId.name, phone: order.riderId.phone } : null,
      riderLocation: live ? { lat: order.riderLocation.lat, lng: order.riderLocation.lng, at: order.riderLocation.at } : null,
      destination: live && order.customer?.location?.lat != null ? order.customer.location : null,
      canReview: features.reviews && ['delivered', 'completed'].includes(order.status) && !order.reviewed,
    },
  });
}));

// Reviews: only the person who placed a delivered order (order number + phone) can rate it, once.
router.post('/tenants/:slug/reviews', trackLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const features = await featuresFor(tenant);
  if (!features.reviews) throw new HttpError(403, 'Reviews are not available', 'FEATURE_OFF');
  const d = z.object({
    number: z.string().trim().min(3).max(30), phone: z.string().trim().min(7).max(40),
    rating: z.coerce.number().int().min(1, 'Choose a rating').max(5), comment: z.string().trim().max(1000).optional(),
  }).parse(req.body);
  const order = await Order.findOne({ tenantId: tenant._id, number: d.number.toUpperCase().replace(/^#/, ''), source: 'online' });
  if (!order || phoneDigits(order.customer?.phone).slice(-7) !== phoneDigits(d.phone).slice(-7)) throw new HttpError(404, 'We could not find that order', 'NOT_FOUND');
  if (!['delivered', 'completed'].includes(order.status)) throw new HttpError(409, 'You can rate an order once it is delivered');
  if (order.reviewed) throw new HttpError(409, 'You have already rated this order');
  await Review.create({ tenantId: tenant._id, orderId: order._id, orderNumber: order.number, name: order.customer?.name, rating: d.rating, comment: d.comment });
  order.reviewed = true; await order.save();
  res.status(201).json({ message: 'Thank you for your feedback!' });
}));

// Newsletter sign-up (stored with the other messages as type "newsletter"; one entry per email).
router.post('/tenants/:slug/subscribe', contactLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const { email } = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') }).parse(req.body);
  if (!(await Message.exists({ tenantId: tenant._id, type: 'newsletter', email }))) {
    await Message.create({ tenantId: tenant._id, type: 'newsletter', name: email, email, message: 'Newsletter subscriber' });
  }
  res.status(201).json({ message: 'Thank you for subscribing!' });
}));

// Complaints (stored with the other messages, flagged as a complaint).
router.post('/tenants/:slug/complaints', contactLimiter, wrap(async (req, res) => {
  const tenant = await resolveTenant(req.params.slug);
  const features = await featuresFor(tenant);
  if (!features.complaints) throw new HttpError(403, 'Complaints are not available', 'FEATURE_OFF');
  const d = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100), phone: z.string().trim().min(7, 'Phone is required').max(40),
    email: z.string().email('Valid email required').optional().or(z.literal('')), orderNumber: z.string().trim().max(30).optional(),
    message: z.string().trim().min(5, 'Please describe the problem').max(3000),
  }).parse(req.body);
  await Message.create({ tenantId: tenant._id, type: 'complaint', ...d });
  const owners = await User.find({ tenantId: tenant._id, role: 'tenant_owner', status: 'active' }).select('email');
  await sendMail({ to: tenant.contact?.email || owners[0]?.email, subject: `Complaint on ${tenant.name}`, text: `From: ${d.name} ${d.phone} ${d.email || ''}\nOrder: ${d.orderNumber || '-'}\n\n${d.message}` });
  res.status(201).json({ message: 'Thank you. Your complaint has been received and we will contact you soon.' });
}));

router.post('/tenants/:slug/visit', wrap(async (req, res) => {
  const tenant = await Tenant.findOne({ slug: String(req.params.slug).toLowerCase(), status: 'active' }).select('_id');
  if (tenant) {
    await Visit.create({ tenantId: tenant._id, path: String(req.body?.path || '/').slice(0, 100), day: new Date().toISOString().slice(0, 10) });
  }
  res.json({ ok: true });
}));

module.exports = router;
