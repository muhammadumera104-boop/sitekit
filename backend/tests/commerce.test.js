// Integration tests for feature toggles, RBAC (Admin / Cashier / Vendor), POS, orders and inventory.
// Needs a RUNNING API seeded with `npm run seed`:   terminal 1: npm run dev     terminal 2: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const API = process.env.TEST_API || 'http://localhost:5000/api';
const PW = process.env.SEED_PASSWORD || 'Passw0rd!123';
const SUPER = process.env.SUPER_ADMIN_EMAIL;

async function call(path, { method = 'GET', body, token, tenant } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'X-Tenant-Slug': tenant } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function login(email, slug) {
  const r = await call('/auth/login', { method: 'POST', body: { email, password: email === SUPER ? process.env.SUPER_ADMIN_PASSWORD : email === process.env.STAFF_EMAIL ? process.env.STAFF_PASSWORD : PW, tenantSlug: slug } });
  assert.equal(r.status, 200, `login ${email}`);
  return r.data.accessToken;
}
const publicItem = async (slug, name) => {
  const site = (await call(`/public/tenants/${slug}`)).data;
  return { site, item: site.menu.flatMap((c) => c.items).find((i) => i.name === name) };
};

test('discounts show on the public site and follow the toggle', async () => {
  const { site, item } = await publicItem('kravemart', 'Orange Juice 1L');
  assert.equal(site.features.cart, true);
  assert.equal(item.discountPercent, 20);
  assert.equal(item.salePrice, 272); // 340 - 20%
  const admin = await login(SUPER);
  try {
    assert.equal((await call('/admin/features', { method: 'PUT', token: admin, body: { features: { discounts: false } } })).status, 200);
    const off = (await publicItem('kravemart', 'Orange Juice 1L')).item;
    assert.equal(off.discountPercent, 0);
    assert.equal(off.salePrice, 340);
  } finally {
    await call('/admin/features', { method: 'PUT', token: admin, body: { features: { discounts: true } } });
  }
});

test('only the Super Admin changes global toggles; staff can change a single store', async () => {
  const staff = await login(process.env.STAFF_EMAIL);
  assert.equal((await call('/admin/features', { token: staff })).status, 200);
  assert.equal((await call('/admin/features', { method: 'PUT', token: staff, body: { features: { pos: false } } })).status, 403);
  const owner = await login('owner@kravemart.test', 'kravemart');
  assert.equal((await call('/admin/features', { token: owner })).status, 403);
  assert.equal((await call('/admin/features', { method: 'PUT', token: await login(SUPER), body: { features: { nope: true } } })).status, 400);
});

test('cashier: POS sale uses server prices and reduces stock; no access to products or settings', async () => {
  const cashier = await login('cashier@kravemart.test', 'kravemart');
  const pos = await call('/tenant/pos/items', { token: cashier });
  assert.equal(pos.status, 200);
  const chips = pos.data.items.find((i) => i.name === 'Potato Chips 150g');
  assert.ok(chips && chips.stock > 3);
  assert.ok(!pos.data.items.some((i) => i.name === 'Fresh Tomatoes 1kg'), 'sold-out items are not offered');

  const sale = await call('/tenant/pos/orders', { method: 'POST', token: cashier, body: { items: [{ itemId: chips.id, qty: 2 }], paymentMethod: 'card' } });
  assert.equal(sale.status, 201);
  assert.equal(sale.data.order.total, 2 * chips.salePrice);
  assert.equal(sale.data.order.paymentStatus, 'paid');
  const after = (await call('/tenant/pos/items', { token: cashier })).data.items.find((i) => i.name === 'Potato Chips 150g');
  assert.equal(after.stock, chips.stock - 2);

  // cancelling returns the stock
  const owner = await login('owner@kravemart.test', 'kravemart');
  assert.equal((await call(`/tenant/orders/${sale.data.order._id}`, { method: 'PATCH', token: owner, body: { status: 'cancelled' } })).status, 200);
  assert.equal((await call('/tenant/pos/items', { token: cashier })).data.items.find((i) => i.name === 'Potato Chips 150g').stock, chips.stock);

  assert.equal((await call('/tenant/orders', { token: cashier })).status, 200);
  assert.equal((await call('/tenant/menu', { token: cashier })).status, 403);
  assert.equal((await call('/tenant/settings', { method: 'PUT', token: cashier, body: { about: 'x' } })).status, 403);
  assert.equal((await call('/tenant/branches', { method: 'POST', token: cashier, body: { name: 'Hack' } })).status, 403);
});

test('overselling is blocked and nothing is half-saved', async () => {
  const cashier = await login('cashier@kravemart.test', 'kravemart');
  const items = (await call('/tenant/pos/items', { token: cashier })).data.items;
  const peanuts = items.find((i) => i.name === 'Salted Peanuts');
  const chips = items.find((i) => i.name === 'Potato Chips 150g');
  const r = await call('/tenant/pos/orders', { method: 'POST', token: cashier, body: { items: [{ itemId: chips.id, qty: 1 }, { itemId: peanuts.id, qty: peanuts.stock + 1 }] } });
  assert.equal(r.status, 409);
  const again = (await call('/tenant/pos/items', { token: cashier })).data.items;
  assert.equal(again.find((i) => i.name === 'Potato Chips 150g').stock, chips.stock, 'first line was rolled back');
  assert.equal((await call('/tenant/pos/orders', { method: 'POST', token: cashier, body: { items: [{ itemId: chips.id, qty: 0 }] } })).status, 400);
});

test('vendor manages only the products and stock of their own branch', async () => {
  const vendor = await login('vendor@kravemart.test', 'kravemart');
  const owner = await login('owner@kravemart.test', 'kravemart');
  const ownerMenu = (await call('/tenant/menu', { token: owner })).data;
  const someoneElses = ownerMenu.items.find((i) => !i.branchId);
  const vm = await call('/tenant/menu', { token: vendor });
  assert.equal(vm.status, 200);
  assert.ok(!vm.data.items.some((i) => i._id === someoneElses._id), 'other branches are hidden');
  assert.equal((await call(`/tenant/menu/items/${someoneElses._id}`, { method: 'PUT', token: vendor, body: { price: 1 } })).status, 404);
  assert.equal((await call(`/tenant/menu/items/${someoneElses._id}`, { method: 'DELETE', token: vendor })).status, 404);

  const created = await call('/tenant/menu/items', { method: 'POST', token: vendor, body: { categoryId: ownerMenu.categories[0]._id, name: 'Vendor Test Item', price: 50, stock: 7, branchId: null } });
  assert.equal(created.status, 201);
  const id = created.data.item._id;
  try {
    assert.ok(created.data.item.branchId, 'vendor items are forced into the vendor branch');
    const inv = await call('/tenant/inventory', { token: vendor });
    assert.equal(inv.status, 200);
    assert.deepEqual(inv.data.items.map((i) => i.name), ['Vendor Test Item']);
    assert.equal((await call(`/tenant/inventory/${id}`, { method: 'PATCH', token: vendor, body: { adjust: 3 } })).data.item.stock, 10);
    assert.equal((await call(`/tenant/inventory/${id}`, { method: 'PATCH', token: vendor, body: { adjust: -50 } })).status, 409);
    assert.equal((await call(`/tenant/inventory/${someoneElses._id}`, { method: 'PATCH', token: vendor, body: { stock: 1 } })).status, 404);
  } finally {
    await call(`/tenant/menu/items/${id}`, { method: 'DELETE', token: owner });
  }
  assert.equal((await call('/tenant/pos/items', { token: vendor })).status, 403);
  assert.equal((await call('/tenant/orders', { token: vendor })).status, 403);
  assert.equal((await call('/tenant/menu/categories', { method: 'POST', token: vendor, body: { name: 'x' } })).status, 403);
});

test('a vendor must belong to a branch', async () => {
  const owner = await login('owner@kravemart.test', 'kravemart');
  const r = await call('/tenant/users', { method: 'POST', token: owner, body: { name: 'No Branch', email: 'nobranch@kravemart.test', role: 'tenant_vendor', password: 'Passw0rd!123' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.code, 'BRANCH_REQUIRED');
});

test('per-store toggle turns the POS off for that store only', async () => {
  const admin = await login(SUPER);
  const kr = (await call('/admin/tenants?q=kravemart', { token: admin })).data.items[0];
  const cashier = await login('cashier@kravemart.test', 'kravemart');
  try {
    assert.equal((await call(`/admin/tenants/${kr._id}/features`, { method: 'PUT', token: admin, body: { features: { pos: false } } })).status, 200);
    const r = await call('/tenant/pos/items', { token: cashier });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, 'FEATURE_OFF');
    assert.equal((await call('/tenant/me', { token: cashier })).data.features.pos, false);
    const kb = await login('cashier@kababjees.test', 'kababjees');
    assert.equal((await call('/tenant/pos/items', { token: kb })).status, 200); // other store unaffected
  } finally {
    await call(`/admin/tenants/${kr._id}/features`, { method: 'PUT', token: admin, body: { features: { pos: null } } });
  }
  assert.equal((await call('/tenant/pos/items', { token: cashier })).status, 200);
});

test('online checkout: needs the cart feature, prices come from the server', async () => {
  const { item } = await publicItem('kravemart', 'Mixed Vegetables 1kg');
  const body = { items: [{ id: item.id, qty: 1 }], customer: { name: 'Test Buyer', phone: '03001234567', address: 'House 1, Karachi' } };
  const ok = await call('/public/tenants/kravemart/orders', { method: 'POST', body: { ...body, total: 1 } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.order.total, item.salePrice, 'a client-sent total is ignored');
  const owner = await login('owner@kravemart.test', 'kravemart');
  const list = await call('/tenant/orders?source=online', { token: owner });
  const mine = list.data.items.find((o) => o.number === ok.data.order.number);
  assert.ok(mine);
  assert.equal(mine.status, 'new');
  await call(`/tenant/orders/${mine._id}`, { method: 'PATCH', token: owner, body: { status: 'cancelled' } }); // give the stock back

  // restaurants have the cart off by default
  const kb = (await publicItem('kababjees', 'Soft Drink')).item;
  const r = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { items: [{ id: kb.id, qty: 1 }], customer: body.customer } });
  assert.equal(r.status, 403);
  // empty / invalid carts
  assert.equal((await call('/public/tenants/kravemart/orders', { method: 'POST', body: { items: [], customer: body.customer } })).status, 400);
  assert.equal((await call('/public/tenants/kravemart/orders', { method: 'POST', body: { items: [{ id: 'zzz', qty: 1 }], customer: body.customer } })).status, 400);
});

test('orders of one store are invisible to another store', async () => {
  const fi = await login('owner@foodin.test', 'foodin');
  const kr = await login('owner@kravemart.test', 'kravemart');
  const foreign = (await call('/tenant/orders', { token: kr })).data.items[0];
  if (foreign) assert.equal((await call(`/tenant/orders/${foreign._id}`, { method: 'PATCH', token: fi, body: { status: 'cancelled' } })).status, 404);
  assert.ok(!(await call('/tenant/orders', { token: fi })).data.items.some((o) => o._id === foreign?._id));
});

test('admin sees every website with stats; tenant users cannot', async () => {
  const admin = await login(SUPER);
  const r = await call('/admin/sites', { token: admin });
  assert.equal(r.status, 200);
  const slugs = r.data.sites.map((s) => s.slug);
  for (const s of ['kababjees', 'unitedking', 'foodin', 'kravemart']) assert.ok(slugs.includes(s), s);
  assert.ok(r.data.sites.every((s) => s.stats && typeof s.stats.items === 'number'));
  assert.equal((await call('/admin/sites?q=krave', { token: admin })).data.sites.length, 1);
  assert.equal((await call('/admin/sites', { token: await login('owner@kravemart.test', 'kravemart') })).status, 403);
});
