const { PlatformSetting } = require('../models');
const { effectiveFeatures } = require('../config/features');

let cache = { at: 0, value: {} };

async function getGlobalFeatures() {
  if (Date.now() - cache.at < 5000) return cache.value;
  const doc = await PlatformSetting.findOne({ key: 'features' }).lean();
  cache = { at: Date.now(), value: doc?.value || {} };
  return cache.value;
}
async function setGlobalFeatures(value) {
  await PlatformSetting.updateOne({ key: 'features' }, { $set: { value } }, { upsert: true });
  cache = { at: 0, value: {} };
}
const featuresFor = async (tenant) => effectiveFeatures(tenant.templateKey, await getGlobalFeatures(), tenant.features);

// Price after discount, rounded to whole rupees. Discounts only apply when the feature is on.
const unitPrice = (price, discountPercent, discountsOn) => {
  const pct = discountsOn ? Number(discountPercent) || 0 : 0;
  return pct > 0 ? Math.round(price * (1 - pct / 100)) : price;
};

module.exports = { getGlobalFeatures, setGlobalFeatures, featuresFor, unitPrice };
