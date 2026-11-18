// Branches, orders, POS and inventory for one store. Mounted inside routes/tenant.js, so authenticate + tenantContext
// have already run: req.tenant / req.tenantId come from the logged-in user (never from the request body).
const router = require('express').Router();
const { z } = require('zod');
const { Branch, Order, MenuItem, MenuCategory, User } = require('../models');
const { requirePerm } = require('../middleware/auth');
const { R } = require('../config/permissions');
const { FEATURES } = require('../config/features');
const { HttpError, wrap, pageParams } = require('../utils/helpers');
const { audit } = require('../services/audit');
const { featuresFor, unitPrice } = require('../services/features');
const { placeOrder, restoreStock } = require('../services/orders');

// Cashiers and vendors with a branch only work inside that branch.
const lockedBranch = (req) => ([R.TC, R.TV].includes(req.user.role) ? req.user.branchId || null : null);

// Rejects the request when the store has the feature switched off (globally or for this store).
const feature = (key) => wrap(async (req, _res, next) => {
  const f = await featuresFor(req.tenant);
  if (!f[key]) throw new HttpError(403, `${FEATURES[key].label} is turned off for this store`, 'FEATURE_OFF');
  req.features = f;
  next();
});

// ---------- Branches ----------
router.get('/branches', wrap(async (req, res) => {
  const own = lockedBranch(req);
  const q = { tenantId: req.tenantId, ...(own ? { _id: own } : {}) };
  res.json({ branches: await Branch.find(q).sort({ name: 1 }).lean() });
}));

const branchSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80), address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(), isActive: z.boolean().optional(),
});
const branches = requirePerm('branches.manage');
router.post('/branches', branches, wrap(async (req, res) => {
  const d = branchSchema.parse(req.body);
  const branch = await Branch.create({ ...d, tenantId: req.tenantId });
  await audit(req, 'branch.create', { details: { name: d.name } });
  res.status(201).json({ branch });
}));
router.put('/branches/:id', branches, wrap(async (req, res) => {
  const d = branchSchema.partial().parse(req.body);
  const branch = await Branch.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: d }, { returnDocument: 'after' });
  if (!branch) throw new HttpError(404, 'Branch not found');
  res.json({ branch });
}));
router.delete('/branches/:id', branches, wrap(async (req, res) => {
  const b = await Branch.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!b) throw new HttpError(404, 'Branch not found');
  // Items go back to "all branches"; staff become unassigned.
  await MenuItem.updateMany({ tenantId: req.tenantId, branchId: b._id }, { $set: { branchId: null } });
  await User.updateMany({ tenantId: req.tenantId, branchId: b._id }, { $set: { branchId: null } });
  await audit(req, 'branch.delete', { details: { name: b.name } });
  res.json({ ok: true });
}));

// ---------- Orders (transactions) ----------
const STATUSES = ['new', 'confirmed', 'preparing', 'completed', 'cancelled'];
function orderScope(req) {
  const own = lockedBranch(req);
  return { tenantId: req.tenantId, ...(own ? { $or: [{ branchId: own }, { branchId: null }] } : {}) };
}

router.get('/orders', requirePerm('orders.view'), wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const base = orderScope(req);
  const q = { ...base };
  if (STATUSES.includes(req.query.status)) q.status = req.query.status;
  if (['online', 'pos'].includes(req.query.source)) q.source = req.query.source;
  const [items, total, counts] = await Promise.all([
    Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('branchId', 'name').lean(),
    Order.countDocuments(q),
    Order.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
}));

router.get('/orders/summary', requirePerm('orders.view'), wrap(async (req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const base = orderScope(req);
  const [today, open] = await Promise.all([
    Order.aggregate([{ $match: { ...base, createdAt: { $gte: start }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$source', n: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
    Order.countDocuments({ ...base, status: { $in: ['new', 'confirmed', 'preparing'] } }),
  ]);
  const by = Object.fromEntries(today.map((t) => [t._id, t]));
  res.json({
    open, ordersToday: today.reduce((s, t) => s + t.n, 0), salesToday: today.reduce((s, t) => s + t.revenue, 0),
    posToday: by.pos?.n || 0, onlineToday: by.online?.n || 0,
  });
}));

const patchSchema = z.object({
  status: z.enum(STATUSES), paymentStatus: z.enum(['unpaid', 'paid']), paymentMethod: z.enum(['cash', 'card', 'online', 'cod']),
}).partial();
router.patch('/orders/:id', requirePerm('orders.manage'), wrap(async (req, res) => {
  const d = patchSchema.parse(req.body);
  const order = await Order.findOne({ _id: req.params.id, ...orderScope(req) });
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.status === 'cancelled') throw new HttpError(409, 'A cancelled order cannot be changed');
  if (d.status === 'cancelled') {
    const f = await featuresFor(req.tenant);
    if (f.inventory) await restoreStock(req.tenantId, order.items.map((i) => ({ itemId: i.itemId, qty: i.qty })));
  }
  Object.assign(order, d);
  await order.save();
  await audit(req, 'order.update', { details: { number: order.number, ...d } });
  res.json({ order });
}));

// ---------- Point of sale ----------
const pos = [requirePerm('pos.use'), feature('pos')];
router.get('/pos/items', ...pos, wrap(async (req, res) => {
  const own = lockedBranch(req);
  const itemQ = { tenantId: req.tenantId, isAvailable: true, ...(own ? { $or: [{ branchId: own }, { branchId: null }] } : {}) };
  const [categories, items] = await Promise.all([
    MenuCategory.find({ tenantId: req.tenantId, isActive: true }).sort({ order: 1 }).lean(),
    MenuItem.find(itemQ).sort({ order: 1, createdAt: 1 }).lean(),
  ]);
  const f = req.features;
  res.json({
    features: f, categories: categories.map((c) => ({ id: c._id, name: c.name })),
    items: items
      .filter((i) => !(f.inventory && i.stock !== null && i.stock !== undefined && i.stock <= 0))
      .map((i) => ({
        id: i._id, categoryId: i.categoryId, name: i.name, image: i.image, price: i.price,
        discountPercent: f.discounts ? i.discountPercent || 0 : 0, salePrice: unitPrice(i.price, i.discountPercent, f.discounts),
        stock: f.inventory ? i.stock ?? null : null,
      })),
  });
}));

router.post('/pos/orders', ...pos, wrap(async (req, res) => {
  const d = z.object({
    items: z.array(z.object({ itemId: z.string(), qty: z.coerce.number() })).min(1, 'Add at least one item').max(60),
    paymentMethod: z.enum(['cash', 'card']).default('cash'),
    customer: z.object({ name: z.string().trim().max(100).optional(), phone: z.string().trim().max(40).optional() }).optional(),
  }).parse(req.body);
  const order = await placeOrder(d.items, {
    tenant: req.tenant, features: req.features, source: 'pos', customer: d.customer || {}, paymentMethod: d.paymentMethod,
    paymentStatus: 'paid', status: 'completed', branchId: lockedBranch(req), userId: req.user._id,
  });
  await audit(req, 'pos.sale', { details: { number: order.number, total: order.total } });
  res.status(201).json({ order });
}));

// ---------- Inventory ----------
const inv = [requirePerm('inventory.manage'), feature('inventory')];
function inventoryScope(req) {
  const q = { tenantId: req.tenantId };
  if (req.user.role === R.TV) {
    if (!req.user.branchId) throw new HttpError(403, 'Your account is not assigned to a branch yet');
    q.branchId = req.user.branchId;
  }
  return q;
}
router.get('/inventory', ...inv, wrap(async (req, res) => {
  const [categories, items] = await Promise.all([
    MenuCategory.find({ tenantId: req.tenantId }).select('name').lean(),
    MenuItem.find(inventoryScope(req)).sort({ order: 1, createdAt: 1 }).lean(),
  ]);
  const cat = new Map(categories.map((c) => [String(c._id), c.name]));
  res.json({ items: items.map((i) => ({ _id: i._id, name: i.name, image: i.image, category: cat.get(String(i.categoryId)) || '', stock: i.stock ?? null, isAvailable: i.isAvailable, branchId: i.branchId })) });
}));
router.patch('/inventory/:id', ...inv, wrap(async (req, res) => {
  const d = z.object({ stock: z.number().int().min(0).nullable().optional(), adjust: z.number().int().min(-100000).max(100000).optional() })
    .refine((v) => v.stock !== undefined || v.adjust !== undefined, 'Provide stock or adjust').parse(req.body);
  const filter = { _id: req.params.id, ...inventoryScope(req) };
  let item;
  if (d.adjust !== undefined) {
    // Atomic: never goes below zero, and only works on items that are tracked.
    item = await MenuItem.findOneAndUpdate({ ...filter, stock: { $ne: null, $gte: d.adjust < 0 ? -d.adjust : 0 } }, { $inc: { stock: d.adjust } }, { returnDocument: 'after' });
    if (!item) throw new HttpError(409, 'Cannot adjust: item is not tracked or the stock would go below zero');
  } else {
    item = await MenuItem.findOneAndUpdate(filter, { $set: { stock: d.stock } }, { returnDocument: 'after' });
    if (!item) throw new HttpError(404, 'Item not found');
  }
  await audit(req, 'inventory.update', { details: { item: item.name, stock: item.stock } });
  res.json({ item: { _id: item._id, stock: item.stock } });
}));

module.exports = router;
module.exports.lockedBranch = lockedBranch;
