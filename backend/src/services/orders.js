// Order placement shared by the public checkout and the cashier POS.
// Prices are ALWAYS computed here from the database, never trusted from the client.
const { MenuItem, Order } = require('../models');
const { HttpError } = require('../utils/helpers');
const { unitPrice } = require('./features');

const orderNumber = () => `${Date.now().toString(36).toUpperCase().slice(-5)}${Math.floor(100 + Math.random() * 900)}`;

// Put reserved stock back (used when an order fails half way, or is cancelled).
async function restoreStock(tenantId, lines) {
  for (const l of lines) {
    await MenuItem.updateOne({ _id: l.itemId, tenantId, stock: { $ne: null } }, { $inc: { stock: l.qty } });
  }
}

/**
 * lines: [{ itemId, qty }]
 * opts: { tenant, features, source, customer, paymentMethod, paymentStatus, status, branchId, userId }
 */
async function placeOrder(lines, opts) {
  const { tenant, features, source, customer = {}, paymentMethod, paymentStatus, status, branchId = null, userId } = opts;
  const merged = new Map();
  for (const l of lines) {
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Quantity must be between 1 and 99');
    merged.set(String(l.itemId), (merged.get(String(l.itemId)) || 0) + qty);
  }
  if (!merged.size) throw new HttpError(400, 'Your cart is empty');
  if (merged.size > 60) throw new HttpError(400, 'Too many different items in one order');
  const ids = [...merged.keys()];
  if (ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))) throw new HttpError(400, 'Invalid item');

  const items = await MenuItem.find({ _id: { $in: ids }, tenantId: tenant._id }).lean();
  if (items.length !== ids.length) throw new HttpError(400, 'Some items are no longer available');
  const byId = new Map(items.map((i) => [String(i._id), i]));

  const reserved = [];
  try {
    for (const [id, qty] of merged) {
      const it = byId.get(id);
      if (!it.isAvailable) throw new HttpError(409, `${it.name} is not available right now`);
      if (branchId && it.branchId && String(it.branchId) !== String(branchId)) throw new HttpError(409, `${it.name} is not sold at your branch`);
      if (features.inventory && it.stock !== null && it.stock !== undefined) {
        const r = await MenuItem.updateOne({ _id: it._id, tenantId: tenant._id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
        if (!r.modifiedCount) throw new HttpError(409, it.stock > 0 ? `Only ${it.stock} of ${it.name} left in stock` : `${it.name} is sold out`);
        reserved.push({ itemId: it._id, qty });
      }
    }
  } catch (e) { await restoreStock(tenant._id, reserved); throw e; }

  let subtotal = 0; let total = 0;
  const orderItems = [...merged].map(([id, qty]) => {
    const it = byId.get(id);
    const unit = unitPrice(it.price, it.discountPercent, features.discounts);
    subtotal += it.price * qty; total += unit * qty;
    return { itemId: it._id, name: it.name, price: it.price, discountPercent: features.discounts ? it.discountPercent || 0 : 0, unitPrice: unit, qty };
  });
  try {
    const order = await Order.create({
      tenantId: tenant._id, number: orderNumber(), source, branchId, customer, items: orderItems,
      subtotal, discount: subtotal - total, total, status, paymentStatus, paymentMethod, createdBy: userId,
    });
    return order;
  } catch (e) { await restoreStock(tenant._id, reserved); throw e; }
}

module.exports = { placeOrder, restoreStock };
