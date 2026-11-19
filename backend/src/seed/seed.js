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
  fashionhub: [['Karachi', 250, ['DHA', 'Clifton', 'Gulshan-e-Iqbal', 'PECHS', 'North Nazimabad', 'Gulistan-e-Jauhar', 'Saddar']], ['Lahore', 250, ['Gulberg', 'DHA', 'Johar Town', 'Model Town', 'Bahria Town']], ['Islamabad', 300, ['F-6', 'F-7', 'F-10', 'G-11', 'Blue Area']], ['Rawalpindi', 300, ['Saddar', 'Bahria Town', 'Satellite Town']], ['Faisalabad', 300, ['D Ground', 'Peoples Colony']]],
  kravemart: [['Karachi', 0, ['SMCHS', 'PECHS', 'Gulshan-e-Iqbal', 'Clifton', 'DHA']], ['Lahore', 0, ['Gulberg', 'DHA', 'Model Town']], ['Rawalpindi', 0, ['Saddar', 'Bahria Town']]],
};
const ORDERING = { fashionhub: { taxPercent: 0, etaMinutes: 240, etaLabel: '2-4 days', freeDeliveryOver: 5000 }, kababjees: { taxPercent: 15, taxInclusive: true, taxLabel: 'Tax', etaMinutes: 45 }, unitedking: { taxPercent: 15, taxInclusive: true, etaMinutes: 50 }, foodin: { taxPercent: 15, taxInclusive: true, etaMinutes: 40 }, kravemart: { taxPercent: 0, etaMinutes: 30 } };
// Extra Kababjees Fried Chicken style menu (prices from the public site; no photos - owner can upload).
const EXTRA_MENU = {
  kababjees: [
    { name: 'Meal Deals', items: [['Chick N Crunch Burger, Fries & Regular Drink', 'Crispy burger with fries and a regular drink.', 590], ['Flavor Craver', 'A big sharing meal for the hungry.', 1050], ['Ultimate Crunch Feast', 'Burgers, fried chicken, fries and drinks for the family.', 1560]] },
    { name: 'Premium Burgers', items: [["Chick N' Crunch Burger", 'Crispy goodness, made of chest chicken meat. Along with Al Baik sauce.', 310]] },
    { name: 'Arabic Delicacies', items: [['Extra Mandi Rice', 'An additional serving of fragrant Mandi rice, seasoned with traditional Arabian spices.', 390], ['Fried Fish Mandi', 'Golden crispy fried fish over aromatic Arabic-style Mandi rice.', 1500], ['Classic Fried Plain Chicken Mandi', 'Classic fried chicken on Mandi rice.', 1150]] },
    { name: 'Snacks', items: [['Chicken Piece', 'Single piece of crispy fried chicken.', 320], ['French Fries', 'Golden crispy fries.', 340], ['Coleslaw', 'Fresh creamy coleslaw.', 150], ['Al-Baik Sauce', 'Signature garlic sauce.', 80]] },
  ],
};

// Demo item options (sizes / add-ons) so the options popup has something to show.
const OPTIONS = {
  kababjees: {
    "Chick N' Crunch Burger": [
      { name: 'Make it a meal', required: false, multiple: false, options: [{ name: 'Fries + regular drink', price: 280 }, { name: 'Fries only', price: 150 }] },
      { name: 'Add-ons', required: false, multiple: true, max: 3, options: [{ name: 'Extra cheese slice', price: 60 }, { name: 'Extra Al-Baik sauce', price: 40 }, { name: 'Jalapenos', price: 30 }] },
    ],
    'Soft Drink': [{ name: 'Size', required: true, multiple: false, options: [{ name: 'Regular (345 ml)', price: 0 }, { name: 'Large (500 ml)', price: 50 }] }],
    'Zingo Burger': [{ name: 'Spice level', required: true, multiple: false, options: [{ name: 'Mild', price: 0 }, { name: 'Medium', price: 0 }, { name: 'Hot', price: 0 }] }],
  },
  foodin: { 'Classic Smash': [{ name: 'Patty', required: true, multiple: false, options: [{ name: 'Double', price: 0 }, { name: 'Triple', price: 220 }] }] },
};
const PROMOS = { fashionhub: ['WELCOME10', 10], kababjees: ['WELCOME10', 10], kravemart: ['FRESH10', 10], foodin: ['FOODIN10', 10], unitedking: ['SWEET10', 10] };
const PAY_DEMO = [
  { method: 'jazzcash', accountName: 'Demo Account (replace in Dashboard)', accountNumber: '0300-0000000', instructions: 'Send the total amount, then enter the transaction ID at checkout.', enabled: true },
  { method: 'easypaisa', accountName: 'Demo Account (replace in Dashboard)', accountNumber: '0300-0000001', instructions: 'Send the total amount, then enter the transaction ID at checkout.', enabled: true },
];

// Pricing plans (like the reference platform): limits are enforced on the store side, commission feeds the payouts report.
const PLANS = [
  { name: 'Free', description: 'Perfect to try things out', price: 0, maxProducts: 25, maxStaff: 3, commissionPercent: 5, order: 1, features: ['Up to 25 products', '3 team accounts', 'Store link on our domain', 'Community support'] },
  { name: 'Basic', description: 'For growing shops', price: 5000, maxProducts: 500, maxStaff: 10, commissionPercent: 3, order: 2, features: ['Up to 500 products', '10 team accounts', 'Promo codes & flash sales', 'Email support'] },
  { name: 'Pro', description: 'For serious brands', price: 12000, maxProducts: 0, maxStaff: 0, commissionPercent: 2, isPopular: true, order: 3, features: ['Unlimited products', 'Unlimited team accounts', 'Custom domain', 'Priority support'] },
];
async function ensurePlans() {
  for (const pl of PLANS) await models.Plan.updateOne({ name: pl.name }, { $setOnInsert: pl }, { upsert: true });
  return models.Plan.findOne({ name: 'Pro' });
}

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

  // Modern fonts for stores that still have the old defaults.
  const oldHeading = ['Georgia, serif', 'Trebuchet MS, sans-serif', 'Verdana, sans-serif'];
  if (oldHeading.includes(tenant.theme?.fontHeading)) {
    await models.Tenant.updateOne({ _id: tenant._id }, { $set: { 'theme.fontHeading': 'var(--font-outfit), system-ui, sans-serif', 'theme.fontBody': 'var(--font-jakarta), system-ui, sans-serif' } });
    made.push('modern fonts');
  }

  for (const [name, groups] of Object.entries(OPTIONS[slug] || {})) {
    const it = await models.MenuItem.findOne({ tenantId: tenant._id, name });
    if (it && !it.optionGroups?.length) { it.optionGroups = groups; await it.save(); made.push(`options ${name}`); }
  }
  if (PROMOS[slug] && !(await models.Promo.exists({ tenantId: tenant._id, code: PROMOS[slug][0] }))) {
    await models.Promo.create({ tenantId: tenant._id, code: PROMOS[slug][0], description: `${PROMOS[slug][1]}% off your order`, type: 'percent', value: PROMOS[slug][1], minOrder: 500, maxDiscount: 300 });
    made.push(`promo ${PROMOS[slug][0]}`);
  }
  if (!tenant.ordering?.paymentAccounts?.length) {
    await models.Tenant.updateOne({ _id: tenant._id }, { $set: { 'ordering.paymentAccounts': PAY_DEMO } });
    made.push('payment accounts');
  }

  if (!tenant.planId && global.__proPlan) { await models.Tenant.updateOne({ _id: tenant._id }, { $set: { planId: global.__proPlan._id } }); made.push('Pro plan'); }

  // Premium dark storefront for every store (only where no mode is stored yet).
  if ((await models.Tenant.updateOne({ _id: tenant._id, 'theme.mode': { $exists: false } }, { $set: { 'theme.mode': 'dark' } })).modifiedCount) made.push('dark theme');

  // Ordering settings (tax, delivery ETA) and delivery areas.
  if (ORDERING[slug] && (slug === 'fashionhub' ? !tenant.ordering?.etaLabel : !tenant.ordering?.taxPercent)) { await models.Tenant.updateOne({ _id: tenant._id }, { $set: Object.fromEntries(Object.entries(ORDERING[slug]).map(([k, v]) => [`ordering.${k}`, v])) }); made.push('ordering settings'); }
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

  const proPlan = await ensurePlans();
  global.__proPlan = proPlan;
  for (const t of tenants) {
    let tenant = await models.Tenant.findOne({ slug: t.slug });
    if (tenant) console.log(`- ${t.slug}: exists`);
    else {
      const { editor, gallery, ...input } = t;
      ({ tenant } = await createTenant(input, admin, { password: env.seedPassword }));
      await models.User.create({ name: editor.name, email: editor.email, role: R.TE, tenantId: tenant._id, passwordHash: hash, status: 'active' });
      await models.User.create({ name: `${t.name} Manager`, email: `manager@${t.slug}.test`, role: R.TM, tenantId: tenant._id, passwordHash: hash, status: 'active' });
      await models.Media.insertMany(gallery.map((g, i) => ({ tenantId: tenant._id, url: g.startsWith('http') ? g : photo(g, 900), type: 'image/jpeg', isGallery: true, caption: `${t.name} ${i + 1}` })));
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
