// Permanently removes tenants that were soft-deleted longer ago than the retention window (SRS 5.2).
const { Tenant, User, Page, MenuCategory, MenuItem, Media, Message, Visit, Session } = require('../models');
const { deleteImage } = require('./storage');

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 30);

async function purgeExpiredTenants() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5);
  const expired = await Tenant.find({ status: 'deleted', deletedAt: { $lt: cutoff } });
  for (const t of expired) {
    const users = await User.find({ tenantId: t._id }).select('_id');
    await Session.deleteMany({ userId: { $in: users.map((u) => u._id) } });
    for (const m of await Media.find({ tenantId: t._id })) await deleteImage(m.publicId);
    for (const M of [User, Page, MenuCategory, MenuItem, Media, Message, Visit]) await M.deleteMany({ tenantId: t._id });
    await t.deleteOne();
    console.log(`Purged tenant ${t.slug} (deleted more than ${RETENTION_DAYS} days ago)`);
  }
  return expired.length;
}

exports.purgeExpiredTenants = purgeExpiredTenants;
exports.startPurgeJob = () => {
  const run = () => purgeExpiredTenants().catch((e) => console.error('purge failed', e.message));
  setTimeout(run, 15000);
  setInterval(run, 24 * 3600 * 1000).unref();
};
