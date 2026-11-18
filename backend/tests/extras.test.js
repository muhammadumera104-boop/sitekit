// Item options, promo codes, customer accounts, manual payments, reviews and live rider location.
// Needs a RUNNING API seeded with `npm run seed`.
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const API = process.env.TEST_API || 'http://localhost:5000/api';
const PW = process.env.SEED_PASSWORD || 'Passw0rd!123';

async function call(path, { method = 'GET', body, token, store } = {}) {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(store ? { 'X-Store': store } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function staff(email, door, slug = 'kababjees') {
  const r = await call('/auth/login', { method: 'POST', body: { email, password: PW, tenantSlug: slug, door } });
  assert.equal(r.status, 200, `login ${email}`);
  return r.data.accessToken;
}
const site = async (slug = 'kababjees') => (await call(`/public/tenants/${slug}`)).data;
const find = (s, name) => s.menu.flatMap((c) => c.items).find((i) => i.name === name);
const buyer = { title: 'Mr.', name: 'Extra Tester', phone: '0311-5550123', address: 'House 9, Street 3', landmark: 'Near the mosque' };
const cancel = async (owner, number) => {
  const o = (await call('/tenant/orders?source=online', { token: owner })).data.items.find((x) => x.number === number);
  if (o) await call(`/tenant/orders/${o._id}`, { method: 'PATCH', token: owner, body: { status: 'cancelled' } });
};

test('item options: required groups are enforced and add-ons are priced by the server', async () => {
  const s = await site();
  const burger = find(s, "Chick N' Crunch Burger");
  const area = s.locations[0].areas[0];
  assert.ok(burger.optionGroups.length === 2);
  const meal = burger.optionGroups[0].options.find((o) => o.name.startsWith('Fries + regular'));
  const cheese = burger.optionGroups[1].options.find((o) => o.name.includes('cheese'));
  const drink = find(s, 'Soft Drink');
  const base = { areaId: area.id, customer: buyer };

  // the drink needs a size
  const bad = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base, items: [{ id: drink.id, qty: 1 }] } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.message, /size/i);
  // an option id from another group/item is rejected
  assert.equal((await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base, items: [{ id: drink.id, qty: 1, options: [{ groupId: burger.optionGroups[0].id, optionId: meal.id }] }] } })).status, 400);

  const large = drink.optionGroups[0].options.find((o) => o.name.startsWith('Large'));
  const ok = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base, items: [
    { id: burger.id, qty: 2, options: [{ groupId: burger.optionGroups[0].id, optionId: meal.id }, { groupId: burger.optionGroups[1].id, optionId: cheese.id }] },
    { id: drink.id, qty: 1, options: [{ groupId: drink.optionGroups[0].id, optionId: large.id }] },
  ] } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  // 2 x (310 + 280 + 60) + (drink + 50) + delivery 100
  const expected = 2 * (burger.salePrice + meal.price + cheese.price) + (drink.salePrice + large.price) + area.deliveryFee;
  assert.equal(ok.data.order.total, expected);
  await cancel(await staff('owner@kababjees.test', 'owner'), ok.data.order.number);
});

test('promo codes: validation, minimum order, discount and usage count (cancel gives the use back)', async () => {
  const s = await site();
  const burger = find(s, "Chick N' Crunch Burger");
  const area = s.locations[0].areas[0];
  const owner = await staff('owner@kababjees.test', 'owner');
  assert.equal((await call('/public/tenants/kababjees/promo/validate', { method: 'POST', body: { code: 'NOPE', subtotal: 1000 } })).status, 404);
  assert.equal((await call('/public/tenants/kababjees/promo/validate', { method: 'POST', body: { code: 'welcome10', subtotal: 200 } })).status, 400, 'below minimum order');
  const v = await call('/public/tenants/kababjees/promo/validate', { method: 'POST', body: { code: 'welcome10', subtotal: 1240 } });
  assert.equal(v.status, 200);
  assert.equal(v.data.promo.discount, 124);

  const before = (await call('/tenant/promos', { token: owner })).data.promos.find((p) => p.code === 'WELCOME10').used;
  const r = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { items: [{ id: burger.id, qty: 4 }], areaId: area.id, customer: buyer, promoCode: 'welcome10' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.order.promoDiscount, 124);
  // 4 x 310 = 1240 - 124 = 1116 (tax inclusive) + 100 delivery
  assert.equal(r.data.order.total, 1116 + 100);
  assert.equal((await call('/tenant/promos', { token: owner })).data.promos.find((p) => p.code === 'WELCOME10').used, before + 1);
  await cancel(owner, r.data.order.number);
  assert.equal((await call('/tenant/promos', { token: owner })).data.promos.find((p) => p.code === 'WELCOME10').used, before);
  // an order under the minimum cannot use the code
  assert.equal((await call('/public/tenants/kababjees/orders', { method: 'POST', body: { items: [{ id: burger.id, qty: 1 }], areaId: area.id, customer: buyer, promoCode: 'WELCOME10' } })).status, 400);
});

test('promo management is for owners and managers', async () => {
  const owner = await staff('owner@kababjees.test', 'owner');
  const cashier = await staff('cashier@kababjees.test', 'worker');
  assert.equal((await call('/tenant/promos', { token: cashier })).status, 403);
  const c = await call('/tenant/promos', { method: 'POST', token: owner, body: { code: 'tmp-test', type: 'flat', value: 50, minOrder: 100 } });
  assert.equal(c.status, 201);
  assert.equal(c.data.promo.code, 'TMP-TEST');
  assert.equal((await call('/tenant/promos', { method: 'POST', token: owner, body: { code: 'bad', type: 'percent', value: 150 } })).status, 400);
  assert.equal((await call(`/tenant/promos/${c.data.promo._id}`, { method: 'DELETE', token: owner })).status, 200);
});

test('customer accounts: sign up, saved address, order history, stores are separate', async () => {
  const phone = `0333${Date.now().toString().slice(-7)}`;
  const reg = await call('/customer/register', { method: 'POST', body: { slug: 'kababjees', name: 'Account Tester', phone, password: 'secret123' } });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  assert.equal((await call('/customer/register', { method: 'POST', body: { slug: 'kababjees', name: 'Dup', phone, password: 'secret123' } })).data.code, 'EXISTS');
  assert.equal((await call('/customer/login', { method: 'POST', body: { slug: 'kababjees', phone, password: 'wrong-pass' } })).status, 401);
  const login = await call('/customer/login', { method: 'POST', body: { slug: 'kababjees', phone, password: 'secret123' } });
  const token = login.data.token;
  assert.equal((await call('/customer/me', { token, store: 'kababjees' })).data.customer.name, 'Account Tester');
  // a token is only good for its own store
  assert.equal((await call('/customer/me', { token, store: 'kravemart' })).status, 401);
  assert.equal((await call('/customer/me')).status, 401);

  const add = await call('/customer/addresses', { method: 'POST', token, store: 'kababjees', body: { label: 'Home', address: 'House 5, Block 7', landmark: 'Near the bakery', lat: 24.86, lng: 67.01 } });
  assert.equal(add.data.customer.addresses.length, 1);

  const s = await site();
  const burger = find(s, "Chick N' Crunch Burger");
  const order = await call('/public/tenants/kababjees/orders', { method: 'POST', token, body: { items: [{ id: burger.id, qty: 1 }], areaId: s.locations[0].areas[0].id, customer: { ...buyer, phone, location: { lat: 24.86, lng: 67.01 } } } });
  assert.equal(order.status, 201);
  const hist = await call('/customer/orders', { token, store: 'kababjees' });
  assert.equal(hist.data.orders[0].number, order.data.order.number);
  assert.equal(hist.data.orders[0].items[0].name, "Chick N' Crunch Burger");
  await cancel(await staff('owner@kababjees.test', 'owner'), order.data.order.number);

  // the owner sees the customer list
  const owner = await staff('owner@kababjees.test', 'owner');
  assert.ok((await call('/tenant/customers', { token: owner })).data.items.some((c) => c.phone === phone && c.orders >= 0));
  assert.equal((await call('/tenant/customers', { token: await staff('cashier@kababjees.test', 'worker') })).status, 403);
});

test('manual online payment: needs a transaction id, staff verify it', async () => {
  const s = await site();
  assert.ok(s.ordering.paymentAccounts.some((a) => a.method === 'jazzcash'));
  const burger = find(s, "Chick N' Crunch Burger");
  const base = { items: [{ id: burger.id, qty: 1 }], areaId: s.locations[0].areas[0].id, customer: buyer, paymentMethod: 'jazzcash' };
  assert.equal((await call('/public/tenants/kababjees/orders', { method: 'POST', body: base })).data.code, 'PAYMENT_REF');
  assert.equal((await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base, paymentMethod: 'bank', paymentRef: 'TXN123456' } })).data.code, 'PAYMENT_UNAVAILABLE', 'bank is not set up');
  const r = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base, paymentRef: 'JC-998877' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.order.paymentStatus, 'pending');
  const owner = await staff('owner@kababjees.test', 'owner');
  const o = (await call('/tenant/orders?source=online', { token: owner })).data.items.find((x) => x.number === r.data.order.number);
  assert.equal(o.paymentRef, 'JC-998877');
  assert.ok((await call('/tenant/orders/summary', { token: owner })).data.pendingPayments >= 1);
  assert.equal((await call(`/tenant/orders/${o._id}`, { method: 'PATCH', token: owner, body: { paymentStatus: 'paid' } })).data.order.paymentStatus, 'paid');
  await cancel(owner, r.data.order.number);
});

test('reviews: only after delivery, once, with the right phone; they show on the site', async () => {
  const s = await site();
  const burger = find(s, "Chick N' Crunch Burger");
  const owner = await staff('owner@kababjees.test', 'owner');
  const r = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { items: [{ id: burger.id, qty: 1 }], orderType: 'pickup', areaId: s.locations[0].areas[0].id, customer: { name: 'Review Tester', phone: '0322-1112233' } } });
  assert.equal(r.status, 201);
  const n = r.data.order.number;
  const body = { number: n, phone: '0322-1112233', rating: 5, comment: 'Crispy and hot, great service!' };
  assert.equal((await call('/public/tenants/kababjees/reviews', { method: 'POST', body })).status, 409, 'not delivered yet');
  const o = (await call('/tenant/orders?source=online', { token: owner })).data.items.find((x) => x.number === n);
  for (const st of ['confirmed', 'preparing', 'ready', 'completed']) await call(`/tenant/orders/${o._id}`, { method: 'PATCH', token: owner, body: { status: st } });
  assert.equal((await call('/public/tenants/kababjees/reviews', { method: 'POST', body: { ...body, phone: '0300-0000000' } })).status, 404, 'wrong phone');
  assert.equal((await call(`/public/tenants/kababjees/orders/track?number=${n}&phone=0322-1112233`)).data.order.canReview, true);
  assert.equal((await call('/public/tenants/kababjees/reviews', { method: 'POST', body })).status, 201);
  assert.equal((await call('/public/tenants/kababjees/reviews', { method: 'POST', body })).status, 409, 'only once');
  const after = await site();
  assert.ok(after.reviews.count >= 1 && after.reviews.items.some((x) => x.comment.includes('Crispy')));
  // moderation: hide it and reply
  const rv = (await call('/tenant/reviews', { token: owner })).data.items.find((x) => x.orderNumber === n);
  assert.equal((await call(`/tenant/reviews/${rv._id}`, { method: 'PATCH', token: owner, body: { reply: 'Thank you!', isPublished: true } })).data.review.reply, 'Thank you!');
  assert.equal((await call(`/tenant/reviews/${rv._id}`, { method: 'PATCH', token: owner, body: { isPublished: false } })).status, 200);
  assert.ok(!(await site()).reviews?.items.some((x) => x.comment?.includes('Crispy')));
});

test('live rider location is shared with the customer only while on the way', async () => {
  const s = await site();
  const burger = find(s, "Chick N' Crunch Burger");
  const owner = await staff('owner@kababjees.test', 'owner');
  const phone = '0344-9998877';
  const r = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { items: [{ id: burger.id, qty: 1 }], areaId: s.locations[0].areas[0].id, customer: { ...buyer, phone, location: { lat: 24.8, lng: 67.05 } } } });
  const n = r.data.order.number;
  const o = (await call('/tenant/orders?source=online', { token: owner })).data.items.find((x) => x.number === n);
  for (const st of ['confirmed', 'preparing', 'ready']) await call(`/tenant/orders/${o._id}`, { method: 'PATCH', token: owner, body: { status: st } });
  const rider = await staff('rider@kababjees.test', 'rider');
  const riders = (await call('/tenant/riders', { token: owner })).data.riders;
  await call(`/tenant/orders/${o._id}`, { method: 'PATCH', token: owner, body: { riderId: riders[0]._id } });
  assert.equal((await call(`/tenant/deliveries/${o._id}/location`, { method: 'PATCH', token: rider, body: { lat: 24.82, lng: 67.03 } })).status, 404, 'not on the way yet');
  await call(`/tenant/deliveries/${o._id}`, { method: 'PATCH', token: rider, body: { status: 'out_for_delivery' } });
  assert.equal((await call(`/tenant/deliveries/${o._id}/location`, { method: 'PATCH', token: rider, body: { lat: 24.82, lng: 67.03 } })).status, 200);
  assert.equal((await call(`/tenant/deliveries/${o._id}/location`, { method: 'PATCH', token: rider, body: { lat: 999, lng: 0 } })).status, 400);
  const tr = (await call(`/public/tenants/kababjees/orders/track?number=${n}&phone=${phone}`)).data.order;
  assert.equal(tr.riderLocation.lat, 24.82);
  assert.equal(tr.destination.lat, 24.8);
  await call(`/tenant/deliveries/${o._id}`, { method: 'PATCH', token: rider, body: { status: 'delivered' } });
  assert.equal((await call(`/public/tenants/kababjees/orders/track?number=${n}&phone=${phone}`)).data.order.riderLocation, null, 'location hidden after delivery');
});

test('feature toggles switch the new features off', async () => {
  const admin = await call('/auth/login', { method: 'POST', body: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD } });
  const token = admin.data.accessToken;
  const kb = (await call('/admin/tenants?q=kababjees', { token })).data.items[0];
  const off = (f) => call(`/admin/tenants/${kb._id}/features`, { method: 'PUT', token, body: { features: f } });
  try {
    await off({ promos: false, accounts: false });
    assert.equal((await call('/public/tenants/kababjees/promo/validate', { method: 'POST', body: { code: 'WELCOME10', subtotal: 900 } })).status, 403);
    assert.equal((await call('/customer/register', { method: 'POST', body: { slug: 'kababjees', name: 'X Y', phone: '0300111222', password: 'secret123' } })).status, 403);
  } finally { await off({ promos: null, accounts: null }); }
});
