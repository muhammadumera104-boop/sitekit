// Super Admin portal: platform-wide views over every store (overview, products, orders, customers, reviews, coupons,
// payments, payouts, plans, announcements, platform settings). Mounted inside routes/admin.js (authenticate + requirePlatform already ran).
const router = require('express').Router();
const { z } = require('zod');
const { Tenant, User, MenuItem, MenuCategory, Order, Customer, Review, Promo, Plan, Payout, Announcement, PlatformSetting, AuditLog } = require('../models');
const { requirePerm } = require('../middleware/auth');
const { HttpError, wrap, pageParams, escapeRegex } = require('../utils/helpers');
const { audit } = require('../services/audit');

const view = requirePerm('tenant.view');
const oid = (s) => /^[a-f0-9]{24}$/i.test(String(s || ''));
const mongoose = require('mongoose');
const O = (s) => new mongoose.Types.ObjectId(String(s));
const storeFilter = (q) => (oid(q.tenantId) ? { tenantId: O(q.tenantId) } : {});

// Small lookup: id -> store card (name, slug, logo).
async function storeMap(ids) {
  const list = await Tenant.find({ _id: { $in: [...new Set(ids.map(String))] } }).select('name slug branding.logo status').lean();
  return new Map(list.map((t) => [String(t._id), { id: t._id, name: t.name, slug: t.slug, logo: t.branding?.logo, status: t.status }]));
}

// ---------- Store picker (used by every filter dropdown) ----------
router.get('/stores', view, wrap(async (_req, res) => {
  const stores = await Tenant.find({ status: { $ne: 'deleted' } }).sort({ name: 1 }).limit(300).select('name slug status branding.logo planId').lean();
  res.json({ stores: stores.map((t) => ({ id: t._id, name: t.name, slug: t.slug, status: t.status, logo: t.branding?.logo, planId: t.planId })) });
}));

// ---------- Overview ----------
router.get('/overview', view, wrap(async (_req, res) => {
  const since = new Date(Date.now() - 13 * 864e5); since.setHours(0, 0, 0, 0);
  const live = { status: { $ne: 'cancelled' } };
  const [stores, ordersAgg, perDay, customers, products, pendingPayments, ratings, topStores, recent] = await Promise.all([
    Tenant.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: live }, { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
    Order.aggregate([{ $match: { ...live, createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { _id: 1 } }]),
    Customer.countDocuments(),
    MenuItem.countDocuments(),
    Order.countDocuments({ paymentStatus: 'pending', status: { $ne: 'cancelled' } }),
    Review.aggregate([{ $match: { isPublished: true } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: live }, { $group: { _id: '$tenantId', orders: { $sum: 1 }, revenue: { $sum: '$total' } } }, { $sort: { revenue: -1 } }, { $limit: 5 }]),
    Order.find().sort({ createdAt: -1 }).limit(8).select('tenantId number total status source createdAt customer.name').lean(),
  ]);
  const by = Object.fromEntries(stores.map((s) => [s._id, s.n]));
  const sm = await storeMap([...topStores.map((t) => t._id), ...recent.map((r) => r.tenantId)]);
  // fill the last 14 days so the chart has no gaps
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const f = perDay.find((p) => p._id === d); days.push({ day: d, orders: f?.orders || 0, revenue: f?.revenue || 0 }); }
  res.json({
    stores: { total: (by.active || 0) + (by.draft || 0) + (by.suspended || 0), active: by.active || 0, draft: by.draft || 0, suspended: by.suspended || 0 },
    orders: ordersAgg[0]?.orders || 0, revenue: ordersAgg[0]?.revenue || 0, customers, products, pendingPayments,
    rating: ratings[0] ? { avg: Math.round(ratings[0].avg * 10) / 10, count: ratings[0].n } : null,
    days, topStores: topStores.map((t) => ({ ...t, store: sm.get(String(t._id)) })),
    recent: recent.map((r) => ({ ...r, store: sm.get(String(r.tenantId)) })),
  });
}));

// ---------- Products of any website ----------
router.get('/products', view, wrap(async (req, res) => {
  const { page, limit, skip } = pageParams({ ...req.query, limit: req.query.limit || 24 });
  const q = { ...storeFilter(req.query) };
  if (req.query.q) q.name = new RegExp(escapeRegex(String(req.query.q)), 'i');
  if (req.query.state === 'unavailable') q.isAvailable = false;
  if (req.query.state === 'sale') q.discountPercent = { $gt: 0 };
  const [items, total, counts] = await Promise.all([
    MenuItem.find(q).sort({ tenantId: 1, order: 1, createdAt: 1 }).skip(skip).limit(limit).lean(),
    MenuItem.countDocuments(q),
    MenuItem.aggregate([{ $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
  ]);
  const [sm, cats] = await Promise.all([storeMap(items.map((i) => i.tenantId)), MenuCategory.find({ _id: { $in: items.map((i) => i.categoryId) } }).select('name').lean()]);
  const cm = new Map(cats.map((c) => [String(c._id), c.name]));
  res.json({
    items: items.map((i) => ({ _id: i._id, store: sm.get(String(i.tenantId)), name: i.name, category: cm.get(String(i.categoryId)) || '', price: i.price, discountPercent: i.discountPercent || 0, stock: i.stock ?? null, isAvailable: i.isAvailable, image: i.image, tags: i.tags || [], options: (i.optionGroups || []).length })),
    total, page, pages: Math.ceil(total / limit), counts: Object.fromEntries(counts.map((c) => [String(c._id), c.n])),
  });
}));
router.patch('/products/:id', requirePerm('catalog.moderate'), wrap(async (req, res) => {
  const d = z.object({ isAvailable: z.boolean() }).parse(req.body);
  const it = await MenuItem.findByIdAndUpdate(req.params.id, { $set: d }, { returnDocument: 'after' });
  if (!it) throw new HttpError(404, 'Product not found');
  await audit(req, 'product.moderate', { tenantId: it.tenantId, details: { name: it.name, ...d } });
  res.json({ ok: true });
}));

// ---------- Orders of every store ----------
router.get('/orders', view, wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = { ...storeFilter(req.query) };
  if (req.query.status) q.status = String(req.query.status);
  if (req.query.source) q.source = String(req.query.source);
  if (req.query.q) { const rx = new RegExp(escapeRegex(String(req.query.q)), 'i'); q.$or = [{ number: rx }, { 'customer.name': rx }, { 'customer.phone': rx }]; }
  const [items, total, sum] = await Promise.all([
    Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(q),
    Order.aggregate([{ $match: { ...q, status: { $ne: 'cancelled' } } }, { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } }]),
  ]);
  const sm = await storeMap(items.map((o) => o.tenantId));
  res.json({ items: items.map((o) => ({ ...o, store: sm.get(String(o.tenantId)) })), total, page, pages: Math.ceil(total / limit), revenue: sum[0]?.revenue || 0 });
}));

// ---------- Customers ----------
router.get('/customers', view, wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = { ...storeFilter(req.query) };
  if (req.query.q) { const rx = new RegExp(escapeRegex(String(req.query.q)), 'i'); q.$or = [{ name: rx }, { phone: rx }, { email: rx }]; }
  const [items, total, agg] = await Promise.all([
    Customer.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).select('tenantId name phone email createdAt lastLogin').lean(),
    Customer.countDocuments(q),
    Order.aggregate([{ $match: { customerId: { $ne: null }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$customerId', orders: { $sum: 1 }, spent: { $sum: '$total' } } }]),
  ]);
  const sm = await storeMap(items.map((c) => c.tenantId));
  const by = new Map(agg.map((a) => [String(a._id), a]));
  res.json({ items: items.map((c) => ({ ...c, store: sm.get(String(c.tenantId)), orders: by.get(String(c._id))?.orders || 0, spent: by.get(String(c._id))?.spent || 0 })), total, page, pages: Math.ceil(total / limit) });
}));

// ---------- Reviews (moderation) ----------
router.get('/reviews', view, wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = { ...storeFilter(req.query) };
  if (req.query.rating) q.rating = Number(req.query.rating);
  const [items, total, agg] = await Promise.all([
    Review.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Review.countDocuments(q),
    Review.aggregate([{ $match: q }, { $group: { _id: null, avg: { $avg: '$rating' } } }]),
  ]);
  const sm = await storeMap(items.map((r) => r.tenantId));
  res.json({ items: items.map((r) => ({ ...r, store: sm.get(String(r.tenantId)) })), total, page, pages: Math.ceil(total / limit), avg: agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0 });
}));
router.patch('/reviews/:id', requirePerm('catalog.moderate'), wrap(async (req, res) => {
  const d = z.object({ isPublished: z.boolean() }).parse(req.body);
  const r = await Review.findByIdAndUpdate(req.params.id, { $set: d }, { returnDocument: 'after' });
  if (!r) throw new HttpError(404, 'Review not found');
  await audit(req, 'review.moderate', { tenantId: r.tenantId, details: { number: r.orderNumber, ...d } });
  res.json({ review: r });
}));

// ---------- Coupons / promo codes of any store ----------
const promoBody = z.object({
  tenantId: z.string(), code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _'), description: z.string().trim().max(120).optional(),
  type: z.enum(['percent', 'flat']), value: z.coerce.number().min(1), minOrder: z.coerce.number().min(0).optional(), maxDiscount: z.coerce.number().min(0).optional(),
  validTo: z.string().nullable().optional(), usageLimit: z.coerce.number().int().min(0).optional(), isActive: z.boolean().optional(),
}).refine((v) => v.type !== 'percent' || v.value <= 100, { message: 'A percent discount cannot be over 100', path: ['value'] });
router.get('/promos', view, wrap(async (req, res) => {
  const items = await Promo.find({ ...storeFilter(req.query) }).sort({ createdAt: -1 }).limit(300).lean();
  const sm = await storeMap(items.map((p) => p.tenantId));
  res.json({ items: items.map((p) => ({ ...p, store: sm.get(String(p.tenantId)) })) });
}));
router.post('/promos', requirePerm('platformPromos.manage'), wrap(async (req, res) => {
  const d = promoBody.parse(req.body);
  if (!oid(d.tenantId) || !(await Tenant.exists({ _id: d.tenantId }))) throw new HttpError(400, 'Choose a store');
  const p = await Promo.create({ ...d, validTo: d.validTo ? new Date(d.validTo) : null });
  await audit(req, 'promo.create', { tenantId: p.tenantId, details: { code: p.code } });
  res.status(201).json({ promo: p });
}));
router.patch('/promos/:id', requirePerm('platformPromos.manage'), wrap(async (req, res) => {
  const d = z.object({ isActive: z.boolean() }).parse(req.body);
  const p = await Promo.findByIdAndUpdate(req.params.id, { $set: d }, { returnDocument: 'after' });
  if (!p) throw new HttpError(404, 'Coupon not found');
  res.json({ promo: p });
}));
router.delete('/promos/:id', requirePerm('platformPromos.manage'), wrap(async (req, res) => {
  const p = await Promo.findByIdAndDelete(req.params.id);
  if (!p) throw new HttpError(404, 'Coupon not found');
  await audit(req, 'promo.delete', { tenantId: p.tenantId, details: { code: p.code } });
  res.json({ ok: true });
}));

// ---------- Payments (online / manual payments across stores) ----------
router.get('/payments', view, wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = { ...storeFilter(req.query), status: { $ne: 'cancelled' } };
  q.paymentMethod = req.query.method ? String(req.query.method) : { $ne: 'cod' }; // cash on delivery has nothing to verify
  if (req.query.status) q.paymentStatus = String(req.query.status);
  const base = { ...q }; delete base.paymentStatus;
  const [items, total, byStatus, byMethod] = await Promise.all([
    Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).select('tenantId number total paymentMethod paymentStatus paymentRef paymentSender customer.name customer.phone createdAt status').lean(),
    Order.countDocuments(q),
    Order.aggregate([{ $match: base }, { $group: { _id: '$paymentStatus', n: { $sum: 1 }, amount: { $sum: '$total' } } }]),
    Order.aggregate([{ $match: q }, { $group: { _id: '$paymentMethod', n: { $sum: 1 }, amount: { $sum: '$total' } } }]),
  ]);
  const sm = await storeMap(items.map((o) => o.tenantId));
  res.json({ items: items.map((o) => ({ ...o, store: sm.get(String(o.tenantId)) })), total, page, pages: Math.ceil(total / limit), byStatus, byMethod });
}));

// Verify (or reject) a manual online payment (JazzCash / Easypaisa / bank) for any store.
router.patch('/payments/:id', requirePerm('catalog.moderate'), wrap(async (req, res) => {
  const d = z.object({ paymentStatus: z.enum(['paid', 'failed', 'pending']) }).parse(req.body);
  const o = await Order.findOne({ _id: req.params.id });
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.paymentMethod === 'cod') throw new HttpError(400, 'Cash on delivery has no online payment to verify');
  o.paymentStatus = d.paymentStatus;
  await o.save();
  await audit(req, 'payment.verify', { tenantId: o.tenantId, details: { number: o.number, ...d } });
  res.json({ ok: true });
}));

// ---------- Payouts: what each store has earned, the platform commission, and what was paid out ----------
async function payoutRows() {
  const [stores, earned, paid, plans] = await Promise.all([
    Tenant.find({ status: { $ne: 'deleted' } }).select('name slug branding.logo planId').lean(),
    Order.aggregate([{ $match: { status: { $in: ['delivered', 'completed'] }, paymentStatus: 'paid' } }, { $group: { _id: '$tenantId', gross: { $sum: '$total' }, orders: { $sum: 1 } } }]),
    Payout.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: '$tenantId', paid: { $sum: '$amount' } } }]),
    Plan.find().lean(),
  ]);
  const pm = new Map(plans.map((p) => [String(p._id), p]));
  const em = new Map(earned.map((e) => [String(e._id), e]));
  const pa = new Map(paid.map((p) => [String(p._id), p.paid]));
  return stores.map((t) => {
    const plan = pm.get(String(t.planId));
    const gross = em.get(String(t._id))?.gross || 0;
    const commission = Math.round((gross * (plan?.commissionPercent || 0)) / 100);
    const net = gross - commission; const paidOut = pa.get(String(t._id)) || 0;
    return { store: { id: t._id, name: t.name, slug: t.slug, logo: t.branding?.logo }, plan: plan ? { name: plan.name, commissionPercent: plan.commissionPercent } : null, orders: em.get(String(t._id))?.orders || 0, gross, commission, net, paidOut, balance: net - paidOut };
  }).sort((a, b) => b.balance - a.balance);
}
router.get('/payouts', view, wrap(async (req, res) => {
  const [rows, items] = await Promise.all([payoutRows(), Payout.find({ ...storeFilter(req.query) }).sort({ createdAt: -1 }).limit(200).lean()]);
  const sm = await storeMap(items.map((p) => p.tenantId));
  res.json({ rows, items: items.map((p) => ({ ...p, store: sm.get(String(p.tenantId)) })), totals: { gross: rows.reduce((s, r) => s + r.gross, 0), commission: rows.reduce((s, r) => s + r.commission, 0), paidOut: rows.reduce((s, r) => s + r.paidOut, 0), balance: rows.reduce((s, r) => s + Math.max(0, r.balance), 0) } });
}));
router.post('/payouts', requirePerm('payouts.manage'), wrap(async (req, res) => {
  const d = z.object({ tenantId: z.string(), amount: z.coerce.number().min(1, 'Enter an amount'), method: z.enum(['bank', 'jazzcash', 'easypaisa', 'cash', 'other']).default('bank'), reference: z.string().trim().max(80).optional(), note: z.string().trim().max(300).optional(), status: z.enum(['pending', 'paid']).default('paid') }).parse(req.body);
  if (!oid(d.tenantId) || !(await Tenant.exists({ _id: d.tenantId }))) throw new HttpError(400, 'Choose a store');
  const p = await Payout.create({ ...d, paidAt: d.status === 'paid' ? new Date() : null, createdBy: req.user._id });
  await audit(req, 'payout.create', { tenantId: p.tenantId, details: { amount: p.amount, method: p.method, reference: p.reference } });
  res.status(201).json({ payout: p });
}));
router.patch('/payouts/:id', requirePerm('payouts.manage'), wrap(async (req, res) => {
  const d = z.object({ status: z.enum(['pending', 'paid']) }).parse(req.body);
  const p = await Payout.findByIdAndUpdate(req.params.id, { $set: { ...d, paidAt: d.status === 'paid' ? new Date() : null } }, { returnDocument: 'after' });
  if (!p) throw new HttpError(404, 'Payout not found');
  res.json({ payout: p });
}));
router.delete('/payouts/:id', requirePerm('payouts.manage'), wrap(async (req, res) => {
  const p = await Payout.findByIdAndDelete(req.params.id);
  if (!p) throw new HttpError(404, 'Payout not found');
  await audit(req, 'payout.delete', { tenantId: p.tenantId, details: { amount: p.amount } });
  res.json({ ok: true });
}));

// ---------- Plans (pricing tiers + limits) ----------
const planBody = z.object({
  name: z.string().trim().min(2).max(40), description: z.string().trim().max(160).optional(), price: z.coerce.number().min(0), interval: z.enum(['month', 'year']).optional(),
  maxProducts: z.coerce.number().int().min(0).optional(), maxStaff: z.coerce.number().int().min(0).optional(), commissionPercent: z.coerce.number().min(0).max(50).optional(),
  features: z.array(z.string().trim().min(1).max(80)).max(12).optional(), isPopular: z.boolean().optional(), isActive: z.boolean().optional(), order: z.coerce.number().optional(),
});
router.get('/plans', view, wrap(async (_req, res) => {
  const [plans, usage] = await Promise.all([Plan.find().sort({ order: 1, price: 1 }).lean(), Tenant.aggregate([{ $match: { status: { $ne: 'deleted' }, planId: { $ne: null } } }, { $group: { _id: '$planId', n: { $sum: 1 } } }])]);
  const u = new Map(usage.map((x) => [String(x._id), x.n]));
  res.json({ plans: plans.map((p) => ({ ...p, stores: u.get(String(p._id)) || 0 })) });
}));
router.post('/plans', requirePerm('plans.manage'), wrap(async (req, res) => {
  const p = await Plan.create(planBody.parse(req.body));
  await audit(req, 'plan.create', { tenantId: null, details: { name: p.name } });
  res.status(201).json({ plan: p });
}));
router.put('/plans/:id', requirePerm('plans.manage'), wrap(async (req, res) => {
  const p = await Plan.findByIdAndUpdate(req.params.id, { $set: planBody.partial().parse(req.body) }, { returnDocument: 'after' });
  if (!p) throw new HttpError(404, 'Plan not found');
  await audit(req, 'plan.update', { tenantId: null, details: { name: p.name } });
  res.json({ plan: p });
}));
router.delete('/plans/:id', requirePerm('plans.manage'), wrap(async (req, res) => {
  if (await Tenant.exists({ planId: req.params.id, status: { $ne: 'deleted' } })) throw new HttpError(409, 'Stores are using this plan. Move them to another plan first.');
  const p = await Plan.findByIdAndDelete(req.params.id);
  if (!p) throw new HttpError(404, 'Plan not found');
  res.json({ ok: true });
}));
router.put('/tenants/:id/plan', requirePerm('plans.manage'), wrap(async (req, res) => {
  const { planId } = z.object({ planId: z.string().nullable() }).parse(req.body);
  if (planId && !(await Plan.exists({ _id: planId }))) throw new HttpError(400, 'Plan not found');
  const t = await Tenant.findByIdAndUpdate(req.params.id, { $set: { planId: planId || null } }, { returnDocument: 'after' });
  if (!t) throw new HttpError(404, 'Store not found');
  await audit(req, 'tenant.plan', { tenantId: t._id, details: { planId } });
  res.json({ ok: true });
}));

// ---------- Announcements (banners store owners see in their dashboard) ----------
const annBody = z.object({
  title: z.string().trim().min(2).max(120), body: z.string().trim().max(1000).optional(), level: z.enum(['info', 'success', 'warning']).optional(),
  audience: z.enum(['all', 'owners']).optional(), startsAt: z.string().nullable().optional(), endsAt: z.string().nullable().optional(), isActive: z.boolean().optional(),
});
const when = (v) => (v ? new Date(v) : null);
router.get('/announcements', view, wrap(async (_req, res) => res.json({ items: await Announcement.find().sort({ createdAt: -1 }).limit(100).lean() })));
router.post('/announcements', requirePerm('announcements.manage'), wrap(async (req, res) => {
  const d = annBody.parse(req.body);
  const a = await Announcement.create({ ...d, startsAt: when(d.startsAt), endsAt: when(d.endsAt), createdBy: req.user._id });
  await audit(req, 'announcement.create', { tenantId: null, details: { title: a.title } });
  res.status(201).json({ announcement: a });
}));
router.put('/announcements/:id', requirePerm('announcements.manage'), wrap(async (req, res) => {
  const d = annBody.partial().parse(req.body);
  const set = { ...d }; if ('startsAt' in d) set.startsAt = when(d.startsAt); if ('endsAt' in d) set.endsAt = when(d.endsAt);
  const a = await Announcement.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: 'after' });
  if (!a) throw new HttpError(404, 'Announcement not found');
  res.json({ announcement: a });
}));
router.delete('/announcements/:id', requirePerm('announcements.manage'), wrap(async (req, res) => {
  if (!(await Announcement.findByIdAndDelete(req.params.id))) throw new HttpError(404, 'Announcement not found');
  res.json({ ok: true });
}));

// ---------- Platform settings ----------
const DEFAULTS = { platformName: 'SiteForge', supportEmail: '', supportPhone: '', currency: 'Rs.', defaultThemeMode: 'dark', maintenanceMode: false, maintenanceMessage: 'We are doing some quick maintenance and will be back shortly.', allowSignups: false, defaultPlanId: null };
async function getSettings() { const doc = await PlatformSetting.findOne({ key: 'settings' }).lean(); return { ...DEFAULTS, ...(doc?.value || {}) }; }
router.get('/settings', view, wrap(async (_req, res) => res.json({ settings: await getSettings() })));
router.put('/settings', requirePerm('platform.settings'), wrap(async (req, res) => {
  const d = z.object({
    platformName: z.string().trim().min(2).max(40), supportEmail: z.string().trim().email().optional().or(z.literal('')), supportPhone: z.string().trim().max(30), currency: z.string().trim().min(1).max(8),
    defaultThemeMode: z.enum(['dark', 'light']), maintenanceMode: z.boolean(), maintenanceMessage: z.string().trim().max(300), allowSignups: z.boolean(), defaultPlanId: z.string().nullable(),
  }).partial().parse(req.body);
  const next = { ...(await getSettings()), ...d };
  await PlatformSetting.updateOne({ key: 'settings' }, { $set: { value: next } }, { upsert: true });
  await audit(req, 'settings.platform', { tenantId: null, details: Object.keys(d) });
  res.json({ settings: next });
}));
router.getSettings = getSettings;

// ---------- Accounts: create a login with email + password and reset passwords ----------
router.post('/users/:id/password', requirePerm('platformUsers.manage'), wrap(async (req, res) => {
  const { password } = z.object({ password: z.string().min(8, 'Password must be at least 8 characters').max(100) }).parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  user.passwordHash = await require('bcryptjs').hash(password, 12);
  user.failedAttempts = 0; user.lockUntil = undefined; user.status = user.status === 'invited' ? 'active' : user.status;
  await user.save();
  await require('../models').Session.deleteMany({ userId: user._id });
  await audit(req, 'user.password-reset', { tenantId: user.tenantId, details: { email: user.email } });
  res.json({ ok: true });
}));

module.exports = router;
void AuditLog;
