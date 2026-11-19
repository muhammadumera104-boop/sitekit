// Super Admin portal: platform-wide views, plans (with limits), payouts, announcements, settings and accounts.
// Needs a RUNNING API seeded with `npm run seed`.
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const API = process.env.TEST_API || 'http://localhost:5000/api';
const PW = process.env.SEED_PASSWORD || 'Passw0rd!123';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const login = async (email, password, tenantSlug, door) => {
  const r = await call('/auth/login', { method: 'POST', body: { email, password, tenantSlug, door } });
  assert.equal(r.status, 200, `login ${email}`);
  return r.data.accessToken;
};
const admin = () => login(process.env.SUPER_ADMIN_EMAIL, process.env.SUPER_ADMIN_PASSWORD);
const staff = () => login(process.env.STAFF_EMAIL, process.env.STAFF_PASSWORD);

test('overview: platform totals, 14-day chart and top stores', async () => {
  const t = await admin();
  const r = await call('/admin/overview', { token: t });
  assert.equal(r.status, 200);
  assert.ok(r.data.stores.total >= 5);
  assert.equal(r.data.days.length, 14);
  assert.ok(r.data.products >= 10 && r.data.customers >= 0);
  assert.ok(Array.isArray(r.data.topStores) && Array.isArray(r.data.recent));
});

test('products: pick a website and see the products it listed', async () => {
  const t = await admin();
  const stores = (await call('/admin/stores', { token: t })).data.stores;
  const fh = stores.find((s) => s.slug === 'fashionhub');
  assert.ok(fh, 'Fashion Hub exists');
  const r = await call(`/admin/products?tenantId=${fh.id}`, { token: t });
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 10);
  assert.ok(r.data.items.every((i) => i.store.slug === 'fashionhub'));
  assert.ok(r.data.counts[fh.id] === 10);
  assert.ok((await call('/admin/products?q=oxford', { token: t })).data.items.some((i) => i.name.includes('Oxford')));
  const all = await call('/admin/products', { token: t });
  assert.ok(new Set(all.data.items.map((i) => i.store.slug)).size >= 1);
  // staff can hide a product; a store owner cannot reach the admin API
  const item = r.data.items[0];
  const s = await staff();
  assert.equal((await call(`/admin/products/${item._id}`, { method: 'PATCH', token: s, body: { isAvailable: false } })).status, 200);
  assert.equal((await call(`/admin/products/${item._id}`, { method: 'PATCH', token: s, body: { isAvailable: true } })).status, 200);
  const owner = await login('owner@fashionhub.test', PW, 'fashionhub', 'owner');
  assert.equal((await call('/admin/products', { token: owner })).status, 403);
});

test('orders, customers, reviews, coupons and payments are visible across stores', async () => {
  const t = await admin();
  for (const p of ['orders', 'customers', 'reviews', 'promos', 'payments']) assert.equal((await call(`/admin/${p}`, { token: t })).status, 200, p);
  const o = await call('/admin/orders?status=cancelled', { token: t });
  assert.ok(o.data.items.every((x) => x.status === 'cancelled'));
  assert.ok(typeof o.data.revenue === 'number');
  const pay = await call('/admin/payments', { token: t });
  assert.ok(pay.data.items.every((x) => x.paymentMethod !== 'cod'));
  assert.ok(Array.isArray(pay.data.byStatus));
});

test('coupons: create for a store, toggle, delete', async () => {
  const t = await admin();
  const fh = (await call('/admin/stores', { token: t })).data.stores.find((s) => s.slug === 'fashionhub');
  const c = await call('/admin/promos', { method: 'POST', token: t, body: { tenantId: fh.id, code: 'adm-test', type: 'flat', value: 100, minOrder: 1000 } });
  assert.equal(c.status, 201);
  assert.equal(c.data.promo.code, 'ADM-TEST');
  assert.equal((await call(`/admin/promos/${c.data.promo._id}`, { method: 'PATCH', token: t, body: { isActive: false } })).data.promo.isActive, false);
  assert.equal((await call('/admin/promos', { method: 'POST', token: t, body: { tenantId: 'bad', code: 'xyz', type: 'flat', value: 5 } })).status, 400);
  assert.equal((await call(`/admin/promos/${c.data.promo._id}`, { method: 'DELETE', token: t })).status, 200);
});

test('payouts: earnings, commission and recorded payments per store', async () => {
  const t = await admin();
  const r = await call('/admin/payouts', { token: t });
  assert.equal(r.status, 200);
  const row = r.data.rows[0];
  assert.ok(row && 'gross' in row && 'commission' in row && 'balance' in row);
  const fh = (await call('/admin/stores', { token: t })).data.stores.find((s) => s.slug === 'fashionhub');
  const p = await call('/admin/payouts', { method: 'POST', token: t, body: { tenantId: fh.id, amount: 1500, method: 'bank', reference: 'TEST-REF' } });
  assert.equal(p.status, 201);
  const after = (await call('/admin/payouts', { token: t })).data;
  assert.ok(after.items.some((x) => x.reference === 'TEST-REF'));
  assert.equal(after.rows.find((x) => x.store.slug === 'fashionhub').paidOut - r.data.rows.find((x) => x.store.slug === 'fashionhub').paidOut, 1500);
  assert.equal((await call('/admin/payouts', { method: 'POST', token: await staff(), body: { tenantId: fh.id, amount: 5 } })).status, 403, 'only the Super Admin records payouts');
  assert.equal((await call(`/admin/payouts/${p.data.payout._id}`, { method: 'DELETE', token: t })).status, 200);
});

test('plans: Super Admin manages them and a plan limit stops a store adding more products', async () => {
  const t = await admin();
  const plans = (await call('/admin/plans', { token: t })).data.plans;
  assert.ok(['Free', 'Basic', 'Pro'].every((n) => plans.some((p) => p.name === n)));
  assert.equal((await call('/admin/plans', { method: 'POST', token: await staff(), body: { name: 'Nope', price: 1 } })).status, 403);
  const tiny = await call('/admin/plans', { method: 'POST', token: t, body: { name: 'Tiny Test', price: 1, maxProducts: 10, commissionPercent: 1 } });
  assert.equal(tiny.status, 201);
  const pro = plans.find((p) => p.name === 'Pro');
  const fh = (await call('/admin/stores', { token: t })).data.stores.find((s) => s.slug === 'fashionhub');
  const owner = await login('owner@fashionhub.test', PW, 'fashionhub', 'owner');
  const menu = (await call('/tenant/menu', { token: owner })).data;
  try {
    assert.equal((await call(`/admin/tenants/${fh.id}/plan`, { method: 'PUT', token: t, body: { planId: tiny.data.plan._id } })).status, 200);
    const r = await call('/tenant/menu/items', { method: 'POST', token: owner, body: { categoryId: menu.categories[0]._id, name: 'Over limit', price: 10 } });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'PLAN_LIMIT');
  } finally {
    await call(`/admin/tenants/${fh.id}/plan`, { method: 'PUT', token: t, body: { planId: pro._id } });
  }
  const ok = await call('/tenant/menu/items', { method: 'POST', token: owner, body: { categoryId: menu.categories[0]._id, name: 'Within limit', price: 10 } });
  assert.equal(ok.status, 201);
  await call(`/tenant/menu/items/${ok.data.item._id}`, { method: 'DELETE', token: owner });
  assert.equal((await call(`/admin/plans/${tiny.data.plan._id}`, { method: 'DELETE', token: t })).status, 200);
  assert.equal((await call(`/admin/plans/${pro._id}`, { method: 'DELETE', token: t })).status, 409, 'a plan in use cannot be deleted');
});

test('announcements reach store dashboards', async () => {
  const t = await admin();
  const a = await call('/admin/announcements', { method: 'POST', token: t, body: { title: 'Test notice', body: 'Scheduled maintenance tonight.', level: 'warning', audience: 'owners' } });
  assert.equal(a.status, 201);
  const owner = await login('owner@fashionhub.test', PW, 'fashionhub', 'owner');
  const cashier = await login('cashier@fashionhub.test', PW, 'fashionhub', 'worker');
  assert.ok((await call('/tenant/announcements', { token: owner })).data.items.some((x) => x.title === 'Test notice'));
  assert.ok(!(await call('/tenant/announcements', { token: cashier })).data.items.some((x) => x.title === 'Test notice'), 'owners-only notice is not shown to workers');
  assert.equal((await call(`/admin/announcements/${a.data.announcement._id}`, { method: 'PUT', token: t, body: { isActive: false } })).status, 200);
  assert.ok(!(await call('/tenant/announcements', { token: owner })).data.items.some((x) => x.title === 'Test notice'));
  assert.equal((await call(`/admin/announcements/${a.data.announcement._id}`, { method: 'DELETE', token: t })).status, 200);
});

test('platform settings: Super Admin edits, staff only read, public sees name and maintenance', async () => {
  const t = await admin();
  const before = (await call('/admin/settings', { token: t })).data.settings;
  assert.equal((await call('/admin/settings', { method: 'PUT', token: await staff(), body: { platformName: 'Hacked' } })).status, 403);
  try {
    assert.equal((await call('/admin/settings', { method: 'PUT', token: t, body: { maintenanceMode: true, maintenanceMessage: 'Back soon', supportEmail: 'help@example.com' } })).status, 200);
    const pub = (await call('/public/platform')).data;
    assert.equal(pub.maintenance, 'Back soon');
    assert.equal(pub.supportEmail, 'help@example.com');
    assert.equal((await call('/admin/settings', { method: 'PUT', token: t, body: { supportEmail: 'not-an-email' } })).status, 400);
  } finally {
    await call('/admin/settings', { method: 'PUT', token: t, body: { maintenanceMode: before.maintenanceMode, maintenanceMessage: before.maintenanceMessage, supportEmail: before.supportEmail || '' } });
  }
  assert.equal((await call('/public/platform')).data.maintenance, before.maintenanceMode ? before.maintenanceMessage : null);
});

test('accounts: create a login with email + password, reset the password, remove it', async () => {
  const t = await admin();
  const email = `acct${Date.now().toString().slice(-6)}@siteforge.test`;
  const c = await call('/admin/users', { method: 'POST', token: t, body: { name: 'Temp Staff', email, role: 'platform_staff', password: 'FirstPass#123' } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  await login(email, 'FirstPass#123');
  const id = c.data.user.id;
  assert.equal((await call(`/admin/users/${id}/password`, { method: 'POST', token: t, body: { password: 'short' } })).status, 400);
  assert.equal((await call(`/admin/users/${id}/password`, { method: 'POST', token: t, body: { password: 'SecondPass#456' } })).status, 200);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email, password: 'FirstPass#123' } })).status, 401, 'old password stops working');
  await login(email, 'SecondPass#456');
  assert.equal((await call(`/admin/users/${id}`, { method: 'DELETE', token: t })).status, 200);
});
