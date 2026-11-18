// Branches, orders, POS and inventory for one store. Mounted inside routes/tenant.js, so authenticate + tenantContext
// have already run: req.tenant / req.tenantId come from the logged-in user (never from the request body).
const router = require('express').Router();
const { z } = require('zod');
const { Branch, ServiceArea, Order, MenuItem, MenuCategory, User, Promo } = require('../models');
const { notifyOrder } = require('../services/notify');
const { requirePerm } = require('../middleware/auth');
const { R, can } = require('../config/permissions');
const { FEATURES } = require('../config/features');
const { HttpError, wrap, pageParams } = require('../utils/helpers');
const { audit } = require('../services/audit');
const { featuresFor, unitPrice } = require('../services/features');
const { placeOrder, restoreStock, pushStatus, STATUSES, TERMINAL } = require('../services/orders');

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
    Order.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('branchId', 'name').populate('riderId', 'name phone').lean(),
    Order.countDocuments(q),
    Order.aggregate([{ $match: base }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit), counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
}));

router.get('/orders/summary', requirePerm('orders.view'), wrap(async (req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const base = orderScope(req);
  const [today, open, newOrders, pendingPayments, latestNew] = await Promise.all([
    Order.aggregate([{ $match: { ...base, createdAt: { $gte: start }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$source', n: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
    Order.countDocuments({ ...base, status: { $in: ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] } }),
    Order.countDocuments({ ...base, status: 'new' }),
    Order.countDocuments({ ...base, paymentStatus: 'pending', status: { $ne: 'cancelled' } }),
    Order.findOne({ ...base, status: 'new' }).sort({ createdAt: -1 }).select('createdAt number').lean(),
  ]);
  const by = Object.fromEntries(today.map((t) => [t._id, t]));
  res.json({
    open, newOrders, pendingPayments, latestNew: latestNew ? { number: latestNew.number, at: latestNew.createdAt } : null, ordersToday: today.reduce((s, t) => s + t.n, 0), salesToday: today.reduce((s, t) => s + t.revenue, 0),
    posToday: by.pos?.n || 0, onlineToday: by.online?.n || 0,
  });
}));

const patchSchema = z.object({
  status: z.enum(STATUSES), paymentStatus: z.enum(['unpaid', 'pending', 'paid', 'failed']), paymentMethod: z.enum(['cash', 'card', 'online', 'cod', 'jazzcash', 'easypaisa', 'bank']),
  riderId: z.string().nullable(),
}).partial();
const markPaidIfCod = (order) => { if (order.paymentMethod === 'cod' && order.paymentStatus === 'unpaid') order.paymentStatus = 'paid'; };

router.patch('/orders/:id', requirePerm('orders.manage'), wrap(async (req, res) => {
  const d = patchSchema.parse(req.body);
  const order = await Order.findOne({ _id: req.params.id, ...orderScope(req) });
  if (!order) throw new HttpError(404, 'Order not found');
  let statusChanged = null;
  if (order.status === 'cancelled') throw new HttpError(409, 'A cancelled order cannot be changed');
  // Finished orders stay finished; the one exception is voiding a completed POS sale (a cashier's mistake).
  const voidingPosSale = order.source === 'pos' && order.status === 'completed' && d.status === 'cancelled';
  if (d.status && d.status !== order.status && TERMINAL.includes(order.status) && !voidingPosSale) throw new HttpError(409, 'This order is already finished');

  if (d.riderId !== undefined) {
    if (!can(req.user.role, 'orders.assign')) throw new HttpError(403, 'You cannot assign riders');
    if (d.riderId) {
      if (order.orderType !== 'delivery') throw new HttpError(400, 'Only delivery orders need a rider');
      if (!(await User.exists({ _id: d.riderId, tenantId: req.tenantId, role: R.TR, status: 'active' }))) throw new HttpError(400, 'Rider not found');
    }
    order.riderId = d.riderId || null;
  }
  if (d.status && d.status !== order.status) {
    if (d.status === 'out_for_delivery' && order.orderType === 'delivery' && !order.riderId) throw new HttpError(400, 'Assign a rider before sending the order out');
    if (d.status === 'cancelled') {
      const f = await featuresFor(req.tenant);
      if (f.inventory) await restoreStock(req.tenantId, order.items.map((i) => ({ itemId: i.itemId, qty: i.qty })));
      if (order.promoCode) await Promo.updateOne({ tenantId: req.tenantId, code: order.promoCode, used: { $gt: 0 } }, { $inc: { used: -1 } });
    }
    pushStatus(order, d.status, req.user.name);
    if (['delivered', 'completed'].includes(d.status)) markPaidIfCod(order);
    statusChanged = d.status;
  }
  if (d.paymentStatus) order.paymentStatus = d.paymentStatus;
  if (d.paymentMethod) order.paymentMethod = d.paymentMethod;
  await order.save();
  await audit(req, 'order.update', { details: { number: order.number, ...d } });
  if (statusChanged) await notifyOrder(req.tenant, order, statusChanged);
  res.json({ order });
}));

// ---------- Delivery riders ----------
router.get('/riders', requirePerm('orders.assign'), wrap(async (req, res) => {
  res.json({ riders: await User.find({ tenantId: req.tenantId, role: R.TR, status: 'active' }).select('name phone').sort({ name: 1 }).lean() });
}));

// A rider only ever sees orders assigned to them.
router.get('/deliveries', requirePerm('deliveries.use'), wrap(async (req, res) => {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const items = await Order.find({
    tenantId: req.tenantId, riderId: req.user._id,
    $or: [{ status: { $in: ['confirmed', 'preparing', 'ready', 'out_for_delivery'] } }, { status: 'delivered', updatedAt: { $gte: since } }],
  }).sort({ createdAt: 1 }).populate('branchId', 'name address phone').lean();
  res.json({ items });
}));
router.patch('/deliveries/:id', requirePerm('deliveries.use'), wrap(async (req, res) => {
  const { status } = z.object({ status: z.enum(['out_for_delivery', 'delivered']) }).parse(req.body);
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.tenantId, riderId: req.user._id });
  if (!order) throw new HttpError(404, 'Delivery not found');
  if (status === 'out_for_delivery' && !['confirmed', 'preparing', 'ready'].includes(order.status)) throw new HttpError(409, 'This order cannot be picked up now');
  if (status === 'delivered' && order.status !== 'out_for_delivery') throw new HttpError(409, 'Pick the order up first');
  pushStatus(order, status, `${req.user.name} (rider)`);
  if (status === 'delivered') markPaidIfCod(order);
  await order.save();
  await audit(req, 'delivery.update', { details: { number: order.number, status } });
  await notifyOrder(req.tenant, order, status);
  res.json({ order });
}));
// Live location: the rider's phone sends its position while the order is out for delivery (customer sees it on the tracking map).
router.patch('/deliveries/:id/location', requirePerm('deliveries.use'), wrap(async (req, res) => {
  const d = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(req.body);
  const r = await Order.updateOne({ _id: req.params.id, tenantId: req.tenantId, riderId: req.user._id, status: 'out_for_delivery' }, { $set: { riderLocation: { ...d, at: new Date() } } });
  if (!r.matchedCount) throw new HttpError(404, 'Delivery not found or not on the way');
  res.json({ ok: true });
}));

// ---------- Delivery areas and ordering settings ----------
router.get('/areas', wrap(async (req, res) => {
  res.json({ areas: await ServiceArea.find({ tenantId: req.tenantId }).sort({ city: 1, name: 1 }).populate('branchId', 'name').lean() });
}));
const areaSchema = z.object({
  city: z.string().trim().min(2).max(60), name: z.string().trim().min(1).max(100), branchId: z.string().nullable().optional(),
  deliveryFee: z.coerce.number().min(0).max(100000).optional(), minOrder: z.coerce.number().min(0).max(1000000).optional(), isActive: z.boolean().optional(),
});
const areas = requirePerm('areas.manage');
async function assertAreaBranch(req, branchId) {
  if (branchId && !(await Branch.exists({ _id: branchId, tenantId: req.tenantId }))) throw new HttpError(400, 'Branch not found');
}
router.post('/areas', areas, wrap(async (req, res) => {
  const d = areaSchema.parse(req.body);
  await assertAreaBranch(req, d.branchId);
  res.status(201).json({ area: await ServiceArea.create({ ...d, tenantId: req.tenantId }) });
}));
// Add many areas of one city at once.
router.post('/areas/bulk', areas, wrap(async (req, res) => {
  const d = z.object({
    city: z.string().trim().min(2).max(60), names: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
    branchId: z.string().nullable().optional(), deliveryFee: z.coerce.number().min(0).optional(), minOrder: z.coerce.number().min(0).optional(),
  }).parse(req.body);
  await assertAreaBranch(req, d.branchId);
  const have = new Set((await ServiceArea.find({ tenantId: req.tenantId, city: d.city }).select('name').lean()).map((a) => a.name.toLowerCase()));
  const fresh = [...new Set(d.names)].filter((n) => !have.has(n.toLowerCase()));
  if (fresh.length) {
    await ServiceArea.insertMany(fresh.map((name) => ({ tenantId: req.tenantId, city: d.city, name, branchId: d.branchId || null, deliveryFee: d.deliveryFee || 0, minOrder: d.minOrder || 0 })));
  }
  await audit(req, 'areas.bulk', { details: { city: d.city, added: fresh.length } });
  res.status(201).json({ added: fresh.length, skipped: d.names.length - fresh.length });
}));
router.put('/areas/:id', areas, wrap(async (req, res) => {
  const d = areaSchema.partial().parse(req.body);
  await assertAreaBranch(req, d.branchId);
  const a = await ServiceArea.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: d }, { returnDocument: 'after' });
  if (!a) throw new HttpError(404, 'Area not found');
  res.json({ area: a });
}));
router.delete('/areas/:id', areas, wrap(async (req, res) => {
  if (!(await ServiceArea.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId }))) throw new HttpError(404, 'Area not found');
  res.json({ ok: true });
}));
// Remove a whole city.
router.delete('/areas', areas, wrap(async (req, res) => {
  const city = String(req.query.city || '');
  if (!city) throw new HttpError(400, 'city is required');
  const r = await ServiceArea.deleteMany({ tenantId: req.tenantId, city });
  res.json({ removed: r.deletedCount });
}));

router.get('/ordering', wrap(async (req, res) => res.json({ ordering: req.tenant.ordering || {} })));
router.put('/ordering', areas, wrap(async (req, res) => {
  const d = z.object({
    taxPercent: z.coerce.number().min(0).max(50), taxInclusive: z.boolean(), taxLabel: z.string().trim().max(20),
    minOrder: z.coerce.number().min(0), etaMinutes: z.coerce.number().int().min(5).max(240),
    paymentAccounts: z.array(z.object({ method: z.enum(['jazzcash', 'easypaisa', 'bank']), accountName: z.string().trim().max(80).optional(), accountNumber: z.string().trim().max(60).optional(), instructions: z.string().trim().max(300).optional(), enabled: z.boolean().optional() })).max(6),
  }).partial().parse(req.body);
  for (const [k, v] of Object.entries(d)) req.tenant.set(`ordering.${k}`, v);
  await req.tenant.save();
  await audit(req, 'ordering.update', { details: d });
  res.json({ ordering: req.tenant.ordering });
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
