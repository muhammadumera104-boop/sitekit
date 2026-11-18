// Order placement shared by the public checkout and the cashier POS.
// Prices, tax and delivery fees are ALWAYS computed here from the database, never trusted from the client.
const { MenuItem, Order } = require('../models');
const { HttpError } = require('../utils/helpers');
const { unitPrice } = require('./features');

const STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
const TERMINAL = ['delivered', 'completed', 'cancelled'];
const orderNumber = () => `${Date.now().toString(36).toUpperCase().slice(-5)}${Math.floor(100 + Math.random() * 900)}`;

// Put reserved stock back (used when an order fails half way, or is cancelled).
async function restoreStock(tenantId, lines) {
  for (const l of lines) {
    await MenuItem.updateOne({ _id: l.itemId, tenantId, stock: { $ne: null } }, { $inc: { stock: l.qty } });
  }
}

// itemsTotal = sum of (sale price x qty). ordering = tenant.ordering. Prices are tax-inclusive unless taxInclusive is false.
function computeTotals(itemsTotal, ordering = {}, deliveryFee = 0) {
  const pct = Number(ordering.taxPercent) || 0;
  const inclusive = ordering.taxInclusive !== false;
  const tax = !pct ? 0 : inclusive ? Math.round(itemsTotal - itemsTotal / (1 + pct / 100)) : Math.round((itemsTotal * pct) / 100);
  const payable = inclusive ? itemsTotal : itemsTotal + tax;
  return { itemsTotal, tax, net: inclusive ? itemsTotal - tax : itemsTotal, deliveryFee, total: payable + deliveryFee };
}

function pushStatus(order, status, by) {
  order.status = status;
  order.history.push({ status, at: new Date(), by });
}

/**
 * lines: [{ itemId, qty, note }]
 * opts: { tenant, features, source, orderType, area, customer, instructions, changeFor, gift,
 *         paymentMethod, paymentStatus, status, branchId, userId, by }
 */
async function placeOrder(lines, opts) {
  const { tenant, features, source, orderType = 'delivery', area = null, customer = {}, instructions, changeFor, gift,
    paymentMethod, paymentStatus, status, branchId = null, userId, by = 'customer' } = opts;
  const merged = new Map();
  const notes = new Map();
  for (const l of lines) {
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Quantity must be between 1 and 99');
    merged.set(String(l.itemId), (merged.get(String(l.itemId)) || 0) + qty);
    if (l.note) notes.set(String(l.itemId), String(l.note).slice(0, 500));
  }
  if (!merged.size) throw new HttpError(400, 'Your cart is empty');
  if (merged.size > 60) throw new HttpError(400, 'Too many different items in one order');
  const ids = [...merged.keys()];
  if (ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))) throw new HttpError(400, 'Invalid item');

  const items = await MenuItem.find({ _id: { $in: ids }, tenantId: tenant._id }).lean();
  if (items.length !== ids.length) throw new HttpError(400, 'Some items are no longer available');
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const outletBranch = branchId || area?.branchId || null;

  // Check minimum order before touching stock.
  let itemsTotal = 0;
  for (const [id, qty] of merged) { const it = byId.get(id); itemsTotal += unitPrice(it.price, it.discountPercent, features.discounts) * qty; }
  const min = Math.max(Number(area?.minOrder) || 0, Number(tenant.ordering?.minOrder) || 0);
  if (source === 'online' && orderType === 'delivery' && min > 0 && itemsTotal < min) throw new HttpError(400, `Minimum order for delivery is Rs. ${min}`, 'MIN_ORDER');

  const reserved = [];
  try {
    for (const [id, qty] of merged) {
      const it = byId.get(id);
      if (!it.isAvailable) throw new HttpError(409, `${it.name} is not available right now`);
      if (outletBranch && it.branchId && String(it.branchId) !== String(outletBranch)) throw new HttpError(409, `${it.name} is not sold at this branch`);
      if (features.inventory && it.stock !== null && it.stock !== undefined) {
        const r = await MenuItem.updateOne({ _id: it._id, tenantId: tenant._id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
        if (!r.modifiedCount) throw new HttpError(409, it.stock > 0 ? `Only ${it.stock} of ${it.name} left in stock` : `${it.name} is sold out`);
        reserved.push({ itemId: it._id, qty });
      }
    }
  } catch (e) { await restoreStock(tenant._id, reserved); throw e; }

  let subtotal = 0;
  const orderItems = [...merged].map(([id, qty]) => {
    const it = byId.get(id);
    const unit = unitPrice(it.price, it.discountPercent, features.discounts);
    subtotal += it.price * qty;
    return { itemId: it._id, name: it.name, price: it.price, discountPercent: features.discounts ? it.discountPercent || 0 : 0, unitPrice: unit, qty, note: notes.get(id) };
  });
  const fee = orderType === 'delivery' && area ? Number(area.deliveryFee) || 0 : 0;
  const t = computeTotals(itemsTotal, tenant.ordering, fee);
  try {
    return await Order.create({
      tenantId: tenant._id, number: orderNumber(), source, orderType, branchId: outletBranch, areaId: area?._id || null, area: area?.name, city: area?.city,
      customer, instructions, changeFor, gift, items: orderItems, subtotal, discount: subtotal - itemsTotal, tax: t.tax, deliveryFee: t.deliveryFee, total: t.total,
      status, paymentStatus, paymentMethod, createdBy: userId, history: [{ status, at: new Date(), by }],
    });
  } catch (e) { await restoreStock(tenant._id, reserved); throw e; }
}

module.exports = { placeOrder, restoreStock, computeTotals, pushStatus, STATUSES, TERMINAL };
