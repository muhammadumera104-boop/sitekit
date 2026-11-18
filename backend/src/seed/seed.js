// Creates the four example tenants (SRS section 13), their staff accounts and sample content.
// Usage: npm run seed            (skips what already exists, but tops up branches / staff / discounts / stock)
//        npm run seed -- --reset (wipes ALL collections first)
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const env = require('../config/env');
const connectDb = require('../config/db');
const models = require('../models');
const { permissionsFor, R, matrix } = require('../config/permissions');
const { registerTemplates } = require('../services/templates');
const { createTenant } = require('../services/tenants');

const tenants = require("./data");
const { photo } = tenants;

// Demo branches per store (the video script: vendors manage one branch, cashiers run the POS).
const BRANCHES = {
  kababjees: [{ name: 'Do Darya', address: 'Do Darya, Seaview, DHA Phase 8, Karachi' }, { name: 'Clifton', address: 'Clifton Block 5, Karachi' }],
  unitedking: [{ name: 'Sharfabad (Head Office)', address: 'Plot-64, Ibrahim Residency, Sharfabad, Karachi' }, { name: 'Gulshan', address: 'Gulshan-e-Iqbal, Karachi' }],
  foodin: [{ name: 'Main Branch', address: 'Karachi' }, { name: 'Lahore Branch', address: 'Lahore' }],
  kravemart: [{ name: 'Karachi', address: 'Thinkhub, SMCHS, Karachi' }, { name: 'Lahore', address: 'Lahore' }],
};
// Sample sale prices and stock so the discount / inventory toggles have something to show. [item name, discount %, stock]
const DEMO_ITEMS = {
  kravemart: [['Potato Chips 150g', 15, 40], ['Chocolate Bar', 0, 25], ['Salted Peanuts', 10, 3], ['Orange Juice 1L', 20, 18], ['Mineral Water 1.5L', 0, 120], ['Fresh Tomatoes 1kg', 0, 0], ['Mixed Vegetables 1kg', 5, 30], ['Dishwash Liquid', 0, 22]],
  kababjees: [['Zingo Burger', 10, null], ['Soft Drink', 0, null], ['Chicken Tikka', 5, null]],
  unitedking: [['Chicken Patties', 10, null], ['Milk Bread', 0, null], ['Chocolate Fudge Cake', 8, null]],
  foodin: [['Classic Smash', 12, null], ['Loaded Fries', 0, null]],
};

async function ensureUser(tenant, { name, email, role, branchId }, hash) {
  const exists = await models.User.findOne({ email });
  if (exists) { if (String(exists.tenantId) === String(tenant._id) && branchId && !exists.branchId) { exists.branchId = branchId; await exists.save(); } return false; }
  await models.User.create({ name, email, role, tenantId: tenant._id, branchId: branchId || null, passwordHash: hash, status: 'active' });
  return true;
}

// Idempotent: safe to run on an existing database.
async function topUp(tenant, hash) {
  const slug = tenant.slug;
  const made = [];
  const branchDocs = [];
  for (const b of BRANCHES[slug] || [{ name: 'Main Branch' }]) {
    let doc = await models.Branch.findOne({ tenantId: tenant._id, name: b.name });
    if (!doc) { doc = await models.Branch.create({ tenantId: tenant._id, ...b }); made.push(`branch ${b.name}`); }
    branchDocs.push(doc);
  }
  const first = branchDocs[0]._id;
  if (await ensureUser(tenant, { name: `${tenant.name} Cashier`, email: `cashier@${slug}.test`, role: R.TC, branchId: first }, hash)) made.push('cashier');
  if (await ensureUser(tenant, { name: `${tenant.name} Vendor`, email: `vendor@${slug}.test`, role: R.TV, branchId: first }, hash)) made.push('vendor');

  for (const [name, pct, stock] of DEMO_ITEMS[slug] || []) {
    const item = await models.MenuItem.findOne({ tenantId: tenant._id, name });
    if (!item) continue;
    const set = {};
    if (!item.discountPercent && pct) set.discountPercent = pct;
    if ((item.stock === null || item.stock === undefined) && stock !== null) set.stock = stock;
    if (Object.keys(set).length) { await models.MenuItem.updateOne({ _id: item._id }, { $set: set }); made.push(`demo ${name}`); }
  }
  return made;
}

(async () => {
  await connectDb();
  if (process.argv.includes('--reset')) {
    for (const m of Object.values(models)) await m.deleteMany({});
    console.log('All collections wiped.');
  }
  await Promise.all(Object.values(models).map((m) => m.init())); // build unique indexes
  await registerTemplates();

  // Roles collection mirrors the permission matrix.
  for (const role of Object.values(R)) {
    await models.Role.updateOne({ name: role }, { $set: { scope: role.startsWith('tenant') ? 'tenant' : 'platform', permissions: permissionsFor(role) } }, { upsert: true });
  }
  void matrix;

  const hash = await bcrypt.hash(env.seedPassword, 12);
  if (!env.superAdmin.email || !env.superAdmin.password) throw new Error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in backend/.env');
  // Platform accounts use their own secret passwords from .env (never the shared demo password).
  const platform = [
    { name: 'Super Admin', email: env.superAdmin.email, role: R.SA, pw: env.superAdmin.password },
    ...(env.staff.email && env.staff.password ? [{ name: 'Platform Staff', email: env.staff.email, role: R.PS, pw: env.staff.password }] : []),
  ];
  let admin;
  for (const p of platform) {
    let u = await models.User.findOne({ email: p.email.toLowerCase() });
    if (!u) u = await models.User.create({ name: p.name, email: p.email, role: p.role, passwordHash: await bcrypt.hash(p.pw, 12), status: 'active' });
    if (p.role === R.SA) admin = u;
  }

  for (const t of tenants) {
    let tenant = await models.Tenant.findOne({ slug: t.slug });
    if (tenant) console.log(`- ${t.slug}: exists`);
    else {
      const { editor, gallery, ...input } = t;
      ({ tenant } = await createTenant(input, admin, { password: env.seedPassword }));
      await models.User.create({ name: editor.name, email: editor.email, role: R.TE, tenantId: tenant._id, passwordHash: hash, status: 'active' });
      await models.User.create({ name: `${t.name} Manager`, email: `manager@${t.slug}.test`, role: R.TM, tenantId: tenant._id, passwordHash: hash, status: 'active' });
      await models.Media.insertMany(gallery.map((g, i) => ({ tenantId: tenant._id, url: photo(g, 900), type: 'image/jpeg', isGallery: true, caption: `${t.name} ${i + 1}` })));
      await models.AuditLog.create({ userId: admin._id, tenantId: tenant._id, action: 'tenant.create', details: { slug: t.slug, seeded: true } });
      console.log(`+ ${t.slug}: created`);
    }
    const made = await topUp(tenant, hash);
    if (made.length) console.log(`  added: ${made.join(', ')}`);
  }

  console.log('\nSeed done.');
  console.log('  Platform logins (Super Admin / Staff): see SUPER_ADMIN_* and STAFF_* in backend/.env');
  console.log('  Demo business accounts: owner@ / manager@ / editor@ / cashier@ / vendor@ <slug>.test use SEED_PASSWORD (change before going live)');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
