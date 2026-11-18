// Order placement shared by the public checkout and the cashier POS.
// Prices, options, promo discounts, tax and delivery fees are ALWAYS computed here from the database, never trusted from the client.
const { MenuItem, Order } = require('../models');
const { HttpError } = require('../utils/helpers');
const { unitPrice } = require('./features');
const { promoAmount, reservePromo, releasePromo } = require('./promos');

const STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
const TERMINAL = ['delivered', 'completed', 'cancelled'];
const orderNumber = () => `${Date.now().toString(36).toUpperCase().slice(-5)}${Math.floor(100 + Math.random() * 900)}`;

// Put reserved stock back (used when an order fails half way, or is cancelled).
async function restoreStock(tenantId, lines) {
  for (const l of lines) {
    await MenuItem.updateOne({ _id: l.itemId, tenantId, stock: { $ne: null } }, { $inc: { stock: l.qty } });
  }
}

// itemsTotal = sum of line prices AFTER the promo discount. Prices are tax-inclusive unless taxInclusive is false.
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

// Validates the chosen options of one cart line against the item's option groups and returns them with prices.
function resolveOptions(item, selected = []) {
  const groups = item.optionGroups || [];
  const picked = new Map();
  for (const s of selected) {
    const g = groups.find((x) => String(x._id) === String(s.groupId));
    const o = g?.options.find((x) => String(x._id) === String(s.optionId));
    if (!g || !o) throw new HttpError(400, `Invalid option for ${item.name}`);
    if (!picked.has(String(g._id))) picked.set(String(g._id), new Set());
    picked.get(String(g._id)).add(String(o._id));
  }
  const out = [];
  for (const g of groups) {
    const set = picked.get(String(g._id)) || new Set();
    const n = set.size;
    if ((g.required && n < 1) || (g.min && n < g.min)) throw new HttpError(400, `Please choose ${g.name.toLowerCase()} for ${item.name}`);
    if (!g.multiple && n > 1) throw new HttpError(400, `Only one ${g.name.toLowerCase()} allowed for ${item.name}`);
    if (g.max && n > g.max) throw new HttpError(400, `At most ${g.max} ${g.name.toLowerCase()} for ${item.name}`);
    for (const o of g.options) if (set.has(String(o._id))) out.push({ groupId: String(g._id), optionId: String(o._id), group: g.name, name: o.name, price: o.price || 0 });
  }
  return out;
}

/**
 * lines: [{ itemId, qty, note, options: [{ groupId, optionId }] }]
 * opts: { tenant, features, source, orderType, area, customer, customerId, instructions, changeFor, gift, promo,
 *         paymentMethod, paymentStatus, paymentRef, status, branchId, userId, by }
 */
async function placeOrder(lines, opts) {
  const { tenant, features, source, orderType = 'delivery', area = null, customer = {}, customerId = null, instructions, changeFor, gift, promo = null,
    paymentMethod, paymentStatus, paymentRef, paymentSender, status, branchId = null, userId, by = 'customer' } = opts;
  if (!lines.length) throw new HttpError(400, 'Your cart is empty');
  if (lines.length > 80) throw new HttpError(400, 'Too many items in one order');
  const ids = [...new Set(lines.map((l) => String(l.itemId)))];
  if (ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))) throw new HttpError(400, 'Invalid item');
  const items = await MenuItem.find({ _id: { $in: ids }, tenantId: tenant._id }).lean();
  if (items.length !== ids.length) throw new HttpError(400, 'Some items are no longer available');
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const outletBranch = branchId || area?.branchId || null;

  // Merge identical lines (same item + same options), price each one.
  const merged = new Map();
  for (const l of lines) {
    const qty = Number(l.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Quantity must be between 1 and 99');
    const it = byId.get(String(l.itemId));
    const options = resolveOptions(it, l.options);
    const key = `${l.itemId}|${options.map((o) => o.optionId).sort().join(',')}`;
    const extra = options.reduce((s, o) => s + o.price, 0);
    const cur = merged.get(key) || { it, options, qty: 0, note: '', extra };
    cur.qty += qty; if (l.note) cur.note = String(l.note).slice(0, 500);
    merged.set(key, cur);
  }
  const list = [...merged.values()];
  let itemsTotal = 0; let subtotal = 0;
  for (const m of list) {
    m.unit = unitPrice(m.it.price, m.it.discountPercent, features.discounts) + m.extra;
    itemsTotal += m.unit * m.qty; subtotal += (m.it.price + m.extra) * m.qty;
  }
  const min = Math.max(Number(area?.minOrder) || 0, Number(tenant.ordering?.minOrder) || 0);
  if (source === 'online' && orderType === 'delivery' && min > 0 && itemsTotal < min) throw new HttpError(400, `Minimum order for delivery is Rs. ${min}`, 'MIN_ORDER');
  const promoOff = promo ? promoAmount(promo, itemsTotal) : 0;
  if (promo && promoOff <= 0) throw new HttpError(400, 'This promo code does not apply to your order', 'PROMO_INVALID');

  // Reserve stock (per item, across all its lines) and the promo use. Both are rolled back if anything fails.
  const perItem = new Map();
  for (const m of list) perItem.set(String(m.it._id), (perItem.get(String(m.it._id)) || 0) + m.qty);
  const reserved = []; let promoReserved = false;
  const rollback = async () => { await restoreStock(tenant._id, reserved); if (promoReserved) await releasePromo(promo); };
  try {
    for (const [id, qty] of perItem) {
      const it = byId.get(id);
      if (!it.isAvailable) throw new HttpError(409, `${it.name} is not available right now`);
      if (outletBranch && it.branchId && String(it.branchId) !== String(outletBranch)) throw new HttpError(409, `${it.name} is not sold at this branch`);
      if (features.inventory && it.stock !== null && it.stock !== undefined) {
        const r = await MenuItem.updateOne({ _id: it._id, tenantId: tenant._id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
        if (!r.modifiedCount) throw new HttpError(409, it.stock > 0 ? `Only ${it.stock} of ${it.name} left in stock` : `${it.name} is sold out`);
        reserved.push({ itemId: it._id, qty });
      }
    }
    if (promo) { await reservePromo(promo); promoReserved = true; }
  } catch (e) { await rollback(); throw e; }

  const fee = orderType === 'delivery' && area ? Number(area.deliveryFee) || 0 : 0;
  const t = computeTotals(itemsTotal - promoOff, tenant.ordering, fee);
  try {
    return await Order.create({
      tenantId: tenant._id, number: orderNumber(), source, orderType, branchId: outletBranch, areaId: area?._id || null, area: area?.name, city: area?.city,
      customerId, customer, instructions, changeFor, gift,
      items: list.map((m) => ({ itemId: m.it._id, name: m.it.name, price: m.it.price + m.extra, discountPercent: features.discounts ? m.it.discountPercent || 0 : 0, unitPrice: m.unit, qty: m.qty, note: m.note, options: m.options })),
      subtotal, discount: subtotal - itemsTotal, promoCode: promo?.code, promoDiscount: promoOff, tax: t.tax, deliveryFee: t.deliveryFee, total: t.total,
      status, paymentStatus, paymentMethod, paymentRef, paymentSender, createdBy: userId, history: [{ status, at: new Date(), by }],
    });
  } catch (e) { await rollback(); throw e; }
}

module.exports = { placeOrder, restoreStock, computeTotals, pushStatus, STATUSES, TERMINAL };
