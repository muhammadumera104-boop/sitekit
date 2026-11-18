const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { z } = require('zod');
const { Tenant, User, Branch, MenuCategory, MenuItem, Page, Media, Message, AuditLog, Visit, Session, Promo, Review, Customer, Order } = require('../models');
const { authenticate, requirePerm, tenantContext } = require('../middleware/auth');
const { can, R, TENANT_ROLES, PLATFORM_ROLES, permissionsFor } = require('../config/permissions');
const { HttpError, wrap, slugify, pageParams, sha256, randomToken } = require('../utils/helpers');
const { audit } = require('../services/audit');
const { sendMail } = require('../services/email');
const { saveImage, deleteImage } = require('../services/storage');
const { buildSite } = require('../services/site');
const { tenantInput, makeInviteLink } = require('../services/tenants');
const { featuresFor } = require('../services/features');

// Every query below MUST include tenantId: req.tenantId (resolved by tenantContext, never from the client body).
router.use(authenticate, tenantContext);

const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype) ? cb(null, true) : cb(new HttpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'))),
});

// ---------- Session context ----------
router.get('/me', wrap(async (req, res) => {
  if (PLATFORM_ROLES.includes(req.user.role)) await audit(req, 'impersonate.access', { details: { slug: req.tenant.slug } });
  const t = req.tenant;
  res.json({
    tenant: { id: t._id, name: t.name, slug: t.slug, status: t.status, templateKey: t.templateKey, logo: t.branding?.logo, primary: t.theme?.primary },
    impersonating: PLATFORM_ROLES.includes(req.user.role),
    permissions: permissionsFor(req.user.role),
    features: await featuresFor(t),
    branchId: req.user.branchId || null,
  });
}));

// Which features are switched on for this store (global kill switch + per-store override + template default).
router.get('/features', wrap(async (req, res) => res.json({ features: await featuresFor(req.tenant) })));

// ---------- Settings (FR-D2) ----------
router.get('/settings', wrap(async (req, res) => {
  const t = req.tenant.toObject();
  delete t.createdBy; delete t.suspendReason;
  res.json({ tenant: t });
}));

const settingsSchema = tenantInput.omit({ owner: true, categories: true, pages: true, status: true, slug: true, templateKey: true, businessType: true }).partial();
router.put('/settings', requirePerm('settings.edit'), wrap(async (req, res) => {
  const data = settingsSchema.parse(req.body);
  const t = req.tenant;
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object') Object.assign(t[k], v);
    else t.set(k, v);
  }
  await t.save();
  await audit(req, 'settings.update', { details: { fields: Object.keys(data) } });
  res.json({ tenant: t });
}));

// Publish / unpublish (FR-D8)
router.post('/publish', requirePerm('site.publish'), wrap(async (req, res) => {
  const { publish } = z.object({ publish: z.boolean() }).parse(req.body);
  req.tenant.status = publish ? 'active' : 'draft';
  await req.tenant.save();
  await audit(req, publish ? 'site.publish' : 'site.unpublish');
  res.json({ status: req.tenant.status });
}));

router.get('/preview', wrap(async (req, res) => res.json(await buildSite(req.tenant, { preview: true }))));

// Owners can only REQUEST a template change; platform staff perform it.
router.post('/template-request', requirePerm('tenant.requestTemplate'), wrap(async (req, res) => {
  const { templateKey, note } = z.object({ templateKey: z.string(), note: z.string().max(500).optional() }).parse(req.body);
  await audit(req, 'template.request', { details: { templateKey, note } });
  res.json({ message: 'Request sent to the platform team.' });
}));

// ---------- Menu / products (FR-D3) ----------
// Pages, media etc. need content.manage. Products need products.manage, which also covers the Vendor role;
// a Vendor only ever sees and edits products of their own branch.
const content = requirePerm('content.manage');
const products = requirePerm('products.manage');
async function assertCategory(req, categoryId) {
  if (!categoryId || !(await MenuCategory.exists({ _id: categoryId, tenantId: req.tenantId }))) throw new HttpError(400, 'Category not found');
}
async function assertBranch(req, branchId) {
  if (branchId && !(await Branch.exists({ _id: branchId, tenantId: req.tenantId }))) throw new HttpError(400, 'Branch not found');
}
function itemScope(req) {
  const q = { tenantId: req.tenantId };
  if (req.user.role === R.TV) {
    if (!req.user.branchId) throw new HttpError(403, 'Your account is not assigned to a branch yet. Ask the store owner to assign one.');
    q.branchId = req.user.branchId;
  }
  return q;
}

router.get('/menu', products, wrap(async (req, res) => {
  const [categories, items] = await Promise.all([
    MenuCategory.find({ tenantId: req.tenantId }).sort({ order: 1 }).lean(),
    MenuItem.find(itemScope(req)).sort({ order: 1, createdAt: 1 }).lean(),
  ]);
  res.json({ categories, items });
}));

router.post('/menu/categories', content, wrap(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1).max(80), isActive: z.boolean().optional() }).parse(req.body);
  const order = await MenuCategory.countDocuments({ tenantId: req.tenantId });
  res.status(201).json({ category: await MenuCategory.create({ ...d, tenantId: req.tenantId, order }) });
}));
router.put('/menu/categories/:id', content, wrap(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1).max(80), isActive: z.boolean(), order: z.number() }).partial().parse(req.body);
  const c = await MenuCategory.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: d }, { returnDocument: 'after' });
  if (!c) throw new HttpError(404, 'Category not found');
  res.json({ category: c });
}));
router.delete('/menu/categories/:id', content, wrap(async (req, res) => {
  const c = await MenuCategory.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!c) throw new HttpError(404, 'Category not found');
  await MenuItem.deleteMany({ tenantId: req.tenantId, categoryId: c._id });
  res.json({ ok: true });
}));

const itemSchema = z.object({
  categoryId: z.string(), name: z.string().trim().min(1, 'Name is required').max(120), description: z.string().max(1000).optional(),
  price: z.coerce.number().min(0, 'Price must be 0 or more'), image: z.string().max(500).optional(), isAvailable: z.boolean().optional(),
  discountPercent: z.coerce.number().min(0, 'Discount must be 0 or more').max(90, 'Discount can be at most 90%').optional(),
  stock: z.number().int('Stock must be a whole number').min(0, 'Stock cannot be negative').nullable().optional(), // null = not tracked
  branchId: z.string().nullable().optional(), // null = sold at all branches
  optionGroups: z.array(z.object({
    _id: z.string().optional(), name: z.string().trim().min(1, 'Option group name is required').max(60), required: z.boolean().optional(), multiple: z.boolean().optional(),
    min: z.coerce.number().int().min(0).max(30).optional(), max: z.coerce.number().int().min(0).max(30).optional(),
    options: z.array(z.object({ _id: z.string().optional(), name: z.string().trim().min(1, 'Option name is required').max(60), price: z.coerce.number().min(0).max(1000000).optional() })).min(1, 'Add at least one option').max(40),
  })).max(10).optional(), // sizes, add-ons...
});
router.post('/menu/items', products, wrap(async (req, res) => {
  const d = itemSchema.parse(req.body);
  const scope = itemScope(req);
  await assertCategory(req, d.categoryId);
  if (req.user.role === R.TV) d.branchId = scope.branchId; else await assertBranch(req, d.branchId);
  const item = await MenuItem.create({ ...d, tenantId: req.tenantId });
  await audit(req, 'menu.item.create', { details: { name: d.name } });
  res.status(201).json({ item });
}));
router.put('/menu/items/:id', products, wrap(async (req, res) => {
  const d = itemSchema.partial().parse(req.body);
  const scope = itemScope(req);
  if (d.categoryId) await assertCategory(req, d.categoryId);
  if (req.user.role === R.TV) delete d.branchId; else if (d.branchId !== undefined) await assertBranch(req, d.branchId);
  const item = await MenuItem.findOneAndUpdate({ _id: req.params.id, ...scope }, { $set: d }, { returnDocument: 'after' });
  if (!item) throw new HttpError(404, 'Item not found');
  res.json({ item });
}));
router.delete('/menu/items/:id', products, wrap(async (req, res) => {
  const r = await MenuItem.deleteOne({ _id: req.params.id, ...itemScope(req) });
  if (!r.deletedCount) throw new HttpError(404, 'Item not found');
  res.json({ ok: true });
}));

// Bulk import (FR-T11): [{category, name, description, price, image, isAvailable}]
router.post('/menu/import', content, wrap(async (req, res) => {
  const rows = z.array(z.object({
    category: z.string().trim().min(1), name: z.string().trim().min(1), description: z.string().optional(),
    price: z.coerce.number().min(0).optional(), image: z.string().optional(), isAvailable: z.coerce.boolean().optional(),
  })).min(1).max(1000).parse(req.body.rows);
  const cats = new Map((await MenuCategory.find({ tenantId: req.tenantId })).map((c) => [c.name.toLowerCase(), c]));
  let order = cats.size;
  const docs = [];
  for (const r of rows) {
    let c = cats.get(r.category.toLowerCase());
    if (!c) { c = await MenuCategory.create({ tenantId: req.tenantId, name: r.category, order: order++ }); cats.set(r.category.toLowerCase(), c); }
    docs.push({ tenantId: req.tenantId, categoryId: c._id, name: r.name, description: r.description, price: r.price || 0, image: r.image, isAvailable: r.isAvailable !== false });
  }
  await MenuItem.insertMany(docs);
  await audit(req, 'menu.import', { details: { count: docs.length } });
  res.status(201).json({ imported: docs.length });
}));

// ---------- Pages (FR-D4) ----------
const pageSchema = z.object({
  title: z.string().trim().min(1).max(100), slug: z.string().optional(), isPublished: z.boolean().optional(), showInNav: z.boolean().optional(), order: z.number().optional(),
  sections: z.array(z.object({ type: z.string().optional(), heading: z.string().max(200).optional(), body: z.string().max(20000).optional(), image: z.string().max(500).optional() })).max(30).optional(),
});
const RESERVED_PAGES = ['menu', 'products', 'about', 'contact', 'gallery', 'login'];
router.get('/pages', content, wrap(async (req, res) => res.json({ pages: await Page.find({ tenantId: req.tenantId }).sort({ order: 1 }).lean() })));
router.post('/pages', content, wrap(async (req, res) => {
  const d = pageSchema.parse(req.body);
  const slug = slugify(d.slug || d.title);
  if (!slug || RESERVED_PAGES.includes(slug)) throw new HttpError(400, 'That page slug is reserved or invalid');
  const order = await Page.countDocuments({ tenantId: req.tenantId });
  res.status(201).json({ page: await Page.create({ ...d, slug, tenantId: req.tenantId, order }) });
}));
router.put('/pages/:id', content, wrap(async (req, res) => {
  const d = pageSchema.partial().parse(req.body);
  if (d.slug) { d.slug = slugify(d.slug); if (!d.slug || RESERVED_PAGES.includes(d.slug)) throw new HttpError(400, 'That page slug is reserved or invalid'); }
  const p = await Page.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: d }, { returnDocument: 'after' });
  if (!p) throw new HttpError(404, 'Page not found');
  res.json({ page: p });
}));
router.delete('/pages/:id', content, wrap(async (req, res) => {
  const r = await Page.deleteOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!r.deletedCount) throw new HttpError(404, 'Page not found');
  res.json({ ok: true });
}));

// ---------- Media (FR-D5) ----------
router.get('/media', content, wrap(async (req, res) => res.json({ media: await Media.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).limit(200).lean() })));
// Vendors may upload product photos, but only content managers can add to the public gallery.
router.post('/media', products, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  const saved = await saveImage(req.file, req.tenant.slug);
  const media = await Media.create({
    tenantId: req.tenantId, url: saved.url, publicId: saved.publicId, type: req.file.mimetype, size: saved.size,
    isGallery: req.body.isGallery === 'true' && can(req.user.role, 'content.manage'), uploadedBy: req.user._id,
  });
  res.status(201).json({ media });
}));
router.patch('/media/:id', content, wrap(async (req, res) => {
  const d = z.object({ isGallery: z.boolean(), caption: z.string().max(200) }).partial().parse(req.body);
  const m = await Media.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: d }, { returnDocument: 'after' });
  if (!m) throw new HttpError(404, 'Media not found');
  res.json({ media: m });
}));
router.delete('/media/:id', content, wrap(async (req, res) => {
  const m = await Media.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!m) throw new HttpError(404, 'Media not found');
  await deleteImage(m.publicId);
  res.json({ ok: true });
}));

// ---------- Messages (FR-D6) ----------
const msgPerm = requirePerm('messages.manage');
router.get('/messages', msgPerm, wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = { tenantId: req.tenantId, ...(req.query.status ? { status: String(req.query.status) } : { status: { $ne: 'archived' } }) };
  const [items, total, unread] = await Promise.all([
    Message.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Message.countDocuments(q),
    Message.countDocuments({ tenantId: req.tenantId, status: 'new' }),
  ]);
  res.json({ items, total, unread, page, pages: Math.ceil(total / limit) });
}));
router.patch('/messages/:id', msgPerm, wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['new', 'read', 'archived']) }).parse(req.body);
  const m = await Message.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: { status } }, { returnDocument: 'after' });
  if (!m) throw new HttpError(404, 'Message not found');
  res.json({ message: m });
}));

// ---------- Tenant users (FR-D7) ----------
const usersPerm = requirePerm('tenantUsers.manage');
router.get('/users', usersPerm, wrap(async (req, res) => res.json({
  users: await User.find({ tenantId: req.tenantId }).select('name email phone role status branchId lastLogin createdAt').sort({ createdAt: 1 }).lean(),
})));
const tUserSchema = z.object({
  name: z.string().trim().min(2), email: z.string().email(), role: z.enum(TENANT_ROLES), status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(8).optional(), branchId: z.string().nullable().optional(), phone: z.string().trim().max(30).optional(),
});
// Cashiers and vendors work inside one branch (vendors must have one); other roles are not branch-bound.
async function resolveBranch(req, role, branchId, current) {
  const usesBranch = [R.TC, R.TV].includes(role);
  const id = !usesBranch ? null : branchId === undefined ? current || null : branchId;
  if (role === R.TV && !id) throw new HttpError(400, 'A vendor must be assigned to a branch', 'BRANCH_REQUIRED');
  if (id && !(await Branch.exists({ _id: id, tenantId: req.tenantId }))) throw new HttpError(400, 'Branch not found');
  return id;
}
router.post('/users', usersPerm, wrap(async (req, res) => {
  const d = tUserSchema.parse(req.body);
  const user = new User({ name: d.name, email: d.email.toLowerCase(), role: d.role, tenantId: req.tenantId, status: d.password ? 'active' : 'invited', phone: d.phone, branchId: await resolveBranch(req, d.role, d.branchId) });
  let inviteLink = null;
  if (d.password) user.passwordHash = await bcrypt.hash(d.password, 12);
  else {
    const token = randomToken(); user.resetTokenHash = sha256(token); user.resetExpires = new Date(Date.now() + 7 * 864e5);
    inviteLink = makeInviteLink(token);
    await sendMail({ to: user.email, subject: `You were invited to manage ${req.tenant.name}`, text: `Set your password: ${inviteLink}` });
  }
  await user.save();
  await audit(req, 'user.create', { details: { email: user.email, role: user.role } });
  res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role }, ...(process.env.NODE_ENV !== 'production' ? { inviteLink } : {}) });
}));
router.put('/users/:id', usersPerm, wrap(async (req, res) => {
  const d = tUserSchema.partial().parse(req.body);
  const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!user) throw new HttpError(404, 'User not found');
  const self = String(user._id) === String(req.user._id);
  if (self && (d.status === 'disabled' || (d.role && d.role !== user.role))) throw new HttpError(400, 'You cannot change your own role or disable yourself');
  if (d.role && d.role !== user.role) await audit(req, 'role.change', { details: { user: user.email, from: user.role, to: d.role } });
  user.branchId = await resolveBranch(req, d.role || user.role, d.branchId, user.branchId);
  if (d.name) user.name = d.name;
  if (d.phone !== undefined) user.phone = d.phone;
  if (d.role) user.role = d.role;
  if (d.status) user.status = d.status;
  if (d.password) user.passwordHash = await bcrypt.hash(d.password, 12);
  await user.save();
  if (d.status === 'disabled') await Session.deleteMany({ userId: user._id });
  res.json({ ok: true });
}));
router.delete('/users/:id', usersPerm, wrap(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!user) throw new HttpError(404, 'User not found');
  if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot delete yourself');
  await user.deleteOne(); await Session.deleteMany({ userId: user._id });
  await audit(req, 'user.delete', { details: { email: user.email } });
  res.json({ ok: true });
}));

// ---------- Audit (own tenant) & analytics (FR-D9) ----------
router.get('/audit', requirePerm('audit.view'), wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = { tenantId: req.tenantId };
  const [items, total] = await Promise.all([
    AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'name email').lean(), AuditLog.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

router.get('/analytics', requirePerm('analytics.view'), wrap(async (req, res) => {
  const since = new Date(Date.now() - 30 * 864e5); const sinceDay = since.toISOString().slice(0, 10);
  const [total, perDay, popular, messages, unread] = await Promise.all([
    Visit.countDocuments({ tenantId: req.tenantId, day: { $gte: sinceDay } }),
    Visit.aggregate([{ $match: { tenantId: req.tenantId, day: { $gte: sinceDay } } }, { $group: { _id: '$day', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Visit.aggregate([{ $match: { tenantId: req.tenantId, day: { $gte: sinceDay } } }, { $group: { _id: '$path', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    Message.countDocuments({ tenantId: req.tenantId, createdAt: { $gte: since } }),
    Message.countDocuments({ tenantId: req.tenantId, status: 'new' }),
  ]);
  res.json({ visits: total, perDay: perDay.map((d) => ({ day: d._id, visits: d.n })), popular: popular.map((p) => ({ path: p._id, visits: p.n })), messages, unread });
}));

// ---------- Promo codes ----------
const promoSchema = z.object({
  code: z.string().trim().min(3, 'Code must be at least 3 characters').max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _'), description: z.string().trim().max(120).optional(),
  type: z.enum(['percent', 'flat']), value: z.coerce.number().min(1, 'Value must be at least 1'), minOrder: z.coerce.number().min(0).optional(), maxDiscount: z.coerce.number().min(0).optional(),
  validFrom: z.string().nullable().optional(), validTo: z.string().nullable().optional(), usageLimit: z.coerce.number().int().min(0).optional(), isActive: z.boolean().optional(),
}).refine((v) => v.type !== 'percent' || v.value <= 100, { message: 'A percent discount cannot be over 100', path: ['value'] });
const promosPerm = requirePerm('promos.manage');
const dateOrNull = (v) => (v ? new Date(v) : null);
router.get('/promos', promosPerm, wrap(async (req, res) => res.json({ promos: await Promo.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).lean() })));
router.post('/promos', promosPerm, wrap(async (req, res) => {
  const d = promoSchema.parse(req.body);
  const promo = await Promo.create({ ...d, validFrom: dateOrNull(d.validFrom), validTo: dateOrNull(d.validTo), tenantId: req.tenantId });
  await audit(req, 'promo.create', { details: { code: promo.code } });
  res.status(201).json({ promo });
}));
router.put('/promos/:id', promosPerm, wrap(async (req, res) => {
  const d = promoSchema.partial().parse(req.body);
  const set = { ...d };
  if ('validFrom' in d) set.validFrom = dateOrNull(d.validFrom);
  if ('validTo' in d) set.validTo = dateOrNull(d.validTo);
  const promo = await Promo.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: set }, { returnDocument: 'after' });
  if (!promo) throw new HttpError(404, 'Promo not found');
  res.json({ promo });
}));
router.delete('/promos/:id', promosPerm, wrap(async (req, res) => {
  if (!(await Promo.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId }))) throw new HttpError(404, 'Promo not found');
  res.json({ ok: true });
}));

// ---------- Reviews (moderate + reply) ----------
const reviewsPerm = requirePerm('reviews.manage');
router.get('/reviews', reviewsPerm, wrap(async (req, res) => {
  const [items, agg] = await Promise.all([
    Review.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).limit(200).lean(),
    Review.aggregate([{ $match: { tenantId: req.tenantId } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]),
  ]);
  res.json({ items, avg: agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0, count: agg[0]?.n || 0 });
}));
router.patch('/reviews/:id', reviewsPerm, wrap(async (req, res) => {
  const d = z.object({ isPublished: z.boolean(), reply: z.string().trim().max(500) }).partial().parse(req.body);
  const r = await Review.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: d }, { returnDocument: 'after' });
  if (!r) throw new HttpError(404, 'Review not found');
  res.json({ review: r });
}));

// ---------- Customers (accounts that signed up on the website) ----------
router.get('/customers', requirePerm('customers.view'), wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const [items, total, counts] = await Promise.all([
    Customer.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('name phone email createdAt lastLogin addresses').lean(),
    Customer.countDocuments({ tenantId: req.tenantId }),
    Order.aggregate([{ $match: { tenantId: req.tenantId, customerId: { $ne: null }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$customerId', orders: { $sum: 1 }, spent: { $sum: '$total' } } }]),
  ]);
  const by = new Map(counts.map((c) => [String(c._id), c]));
  res.json({ items: items.map((c) => ({ ...c, addresses: c.addresses?.length || 0, orders: by.get(String(c._id))?.orders || 0, spent: by.get(String(c._id))?.spent || 0 })), total, page, pages: Math.ceil(total / limit) });
}));

// Branches, orders, POS and inventory.
router.use(require('./commerce'));

module.exports = router;
