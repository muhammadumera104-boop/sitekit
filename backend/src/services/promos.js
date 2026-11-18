// Promo codes: validation + the discount amount (the client mirrors promoAmount for its live total).
const { Promo } = require('../models');
const { HttpError } = require('../utils/helpers');

const clean = (code) => String(code || '').trim().toUpperCase();

function promoAmount(promo, itemsTotal) {
  if (!promo || itemsTotal <= 0 || itemsTotal < (promo.minOrder || 0)) return 0;
  let d = promo.type === 'percent' ? Math.floor((itemsTotal * promo.value) / 100) : promo.value;
  if (promo.maxDiscount > 0) d = Math.min(d, promo.maxDiscount);
  return Math.max(0, Math.min(d, itemsTotal));
}

// Throws a friendly error when the code cannot be used right now.
async function findUsablePromo(tenantId, code, itemsTotal) {
  const c = clean(code);
  if (!c) throw new HttpError(400, 'Enter a promo code', 'PROMO_INVALID');
  const promo = await Promo.findOne({ tenantId, code: c }).lean();
  const now = new Date();
  if (!promo || !promo.isActive) throw new HttpError(404, 'This promo code is not valid', 'PROMO_INVALID');
  if (promo.validFrom && promo.validFrom > now) throw new HttpError(400, 'This promo code is not active yet', 'PROMO_INVALID');
  if (promo.validTo && promo.validTo < now) throw new HttpError(400, 'This promo code has expired', 'PROMO_INVALID');
  if (promo.usageLimit > 0 && promo.used >= promo.usageLimit) throw new HttpError(400, 'This promo code has been fully used', 'PROMO_INVALID');
  if (itemsTotal !== undefined && itemsTotal < (promo.minOrder || 0)) throw new HttpError(400, `Add Rs. ${promo.minOrder - itemsTotal} more to use this code (minimum order Rs. ${promo.minOrder})`, 'PROMO_MIN');
  return promo;
}

// Counts the use atomically so a limited code can never be over-used.
async function reservePromo(promo) {
  const filter = { _id: promo._id, ...(promo.usageLimit > 0 ? { $expr: { $lt: ['$used', '$usageLimit'] } } : {}) };
  const r = await Promo.updateOne(filter, { $inc: { used: 1 } });
  if (!r.modifiedCount) throw new HttpError(409, 'This promo code has just run out', 'PROMO_INVALID');
}
const releasePromo = (promo) => Promo.updateOne({ _id: promo._id, used: { $gt: 0 } }, { $inc: { used: -1 } });

module.exports = { promoAmount, findUsablePromo, reservePromo, releasePromo, clean };
