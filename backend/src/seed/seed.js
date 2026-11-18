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

// Delivery areas per store: [city, fee, [areas]]. Sample data - the owner edits these in Dashboard -> Delivery areas.
const AREAS = {
  kababjees: [
    ['Karachi', 100, ['2 Talwar', '3 Talwar', 'Clifton Block 5', 'Clifton Block 8', 'DHA Phase 2', 'DHA Phase 5', 'DHA Phase 8', 'Do Darya', 'Gulshan-e-Iqbal', 'Gulistan-e-Jauhar', 'Bahadurabad', 'PECHS', 'Saddar', 'North Nazimabad', 'Nazimabad', 'Malir']],
    ['Lahore', 120, ['Gulberg', 'DHA Phase 5', 'Model Town', 'Johar Town', 'Bahria Town']],
    ['Islamabad', 120, ['F-6', 'F-7', 'F-10', 'G-9', 'G-11', 'Blue Area']],
    ['Hyderabad', 100, ['Latifabad', 'Qasimabad', 'Autobahn Road']],
  ],
  unitedking: [['Karachi', 150, ['Sharfabad', 'Gulshan-e-Iqbal', 'Clifton', 'DHA Phase 6', 'Tariq Road', 'North Nazimabad']]],
  foodin: [['Karachi', 100, ['Clifton', 'DHA', 'Gulshan-e-Iqbal', 'Bahadurabad']], ['Lahore', 120, ['Gulberg', 'DHA', 'Johar Town']]],
  kravemart: [['Karachi', 0, ['SMCHS', 'PECHS', 'Gulshan-e-Iqbal', 'Clifton', 'DHA']], ['Lahore', 0, ['Gulberg', 'DHA', 'Model Town']], ['Rawalpindi', 0, ['Saddar', 'Bahria Town']]],
};
const ORDERING = { kababjees: { taxPercent: 15, taxInclusive: true, taxLabel: 'Tax', etaMinutes: 45 }, unitedking: { taxPercent: 15, taxInclusive: true, etaMinutes: 50 }, foodin: { taxPercent: 15, taxInclusive: true, etaMinutes: 40 }, kravemart: { taxPercent: 0, etaMinutes: 30 } };
// Extra Kababjees Fried Chicken style menu (prices from the public site; no photos - owner can upload).
const EXTRA_MENU = {
  kababjees: [
    { name: 'Meal Deals', items: [['Chick N Crunch Burger, Fries & Regular Drink', 'Crispy burger with fries and a regular drink.', 590], ['Flavor Craver', 'A big sharing meal for the hungry.', 1050], ['Ultimate Crunch Feast', 'Burgers, fried chicken, fries and drinks for the family.', 1560]] },
    { name: 'Premium Burgers', items: [["Chick N' Crunch Burger", 'Crispy goodness, made of chest chicken meat. Along with Al Baik sauce.', 310]] },
    { name: 'Arabic Delicacies', items: [['Extra Mandi Rice', 'An additional serving of fragrant Mandi rice, seasoned with traditional Arabian spices.', 390], ['Fried Fish Mandi', 'Golden crispy fried fish over aromatic Arabic-style Mandi rice.', 1500], ['Classic Fried Plain Chicken Mandi', 'Classic fried chicken on Mandi rice.', 1150]] },
    { name: 'Snacks', items: [['Chicken Piece', 'Single piece of crispy fried chicken.', 320], ['French Fries', 'Golden crispy fries.', 340], ['Coleslaw', 'Fresh creamy coleslaw.', 150], ['Al-Baik Sauce', 'Signature garlic sauce.', 80]] },
  ],
};

async function ensureUser(tenant, { name, email, role, branchId, phone }, hash) {
  const exists = await models.User.findOne({ email });
  if (exists) { if (String(exists.tenantId) === String(tenant._id) && branchId && !exists.branchId) { exists.branchId = branchId; await exists.save(); } return false; }
  await models.User.create({ name, email, role, tenantId: tenant._id, branchId: branchId || null, phone, passwordHash: hash, status: 'active' });
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
  if (await ensureUser(tenant, { name: `${tenant.name} Rider`, email: `rider@${slug}.test`, role: R.TR, branchId: first, phone: '03001234567' }, hash)) made.push('rider');

  // Ordering settings (tax, delivery ETA) and delivery areas.
  if (!tenant.ordering?.taxPercent && ORDERING[slug]) { await models.Tenant.updateOne({ _id: tenant._id }, { $set: Object.fromEntries(Object.entries(ORDERING[slug]).map(([k, v]) => [`ordering.${k}`, v])) }); made.push('ordering settings'); }
  if (!(await models.ServiceArea.countDocuments({ tenantId: tenant._id }))) {
    const docs = [];
    for (const [city, fee, names] of AREAS[slug] || []) for (const name of names) docs.push({ tenantId: tenant._id, city, name, deliveryFee: fee, branchId: first });
    if (docs.length) { await models.ServiceArea.insertMany(docs); made.push(`${docs.length} delivery areas`); }
  }
  for (const cat of EXTRA_MENU[slug] || []) {
    if (await models.MenuCategory.findOne({ tenantId: tenant._id, name: cat.name })) continue;
    const order = await models.MenuCategory.countDocuments({ tenantId: tenant._id });
    const c = await models.MenuCategory.create({ tenantId: tenant._id, name: cat.name, order });
    await models.MenuItem.insertMany(cat.items.map(([name, description, price], i) => ({ tenantId: tenant._id, categoryId: c._id, name, description, price, order: i })));
    made.push(`menu ${cat.name}`);
  }

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
  console.log('  Demo business accounts: owner@ / manager@ / editor@ / cashier@ / vendor@ / rider@ <slug>.test use SEED_PASSWORD (change before going live)');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
