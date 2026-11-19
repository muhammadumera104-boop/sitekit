// Ordering flow like a food-delivery site: location -> cart -> checkout -> kitchen -> rider -> delivered, plus tracking,
// complaints and role-based staff doors. Needs a RUNNING API seeded with `npm run seed`.
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const API = process.env.TEST_API || 'http://localhost:5000/api';
const PW = process.env.SEED_PASSWORD || 'Passw0rd!123';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const loginAs = (email, door) => call('/auth/login', { method: 'POST', body: { email, password: PW, tenantSlug: 'kababjees', door } });
async function token(email, door) { const r = await loginAs(email, door); assert.equal(r.status, 200, `login ${email}`); return r.data.accessToken; }

async function kababjees() {
  const site = (await call('/public/tenants/kababjees')).data;
  const burger = site.menu.flatMap((c) => c.items).find((i) => i.name === "Chick N' Crunch Burger");
  const karachi = site.locations.find((c) => c.city === 'Karachi');
  return { site, burger, area: karachi.areas.find((a) => a.name === '2 Talwar') };
}
const customer = { title: 'Mr.', name: 'Ali Test', phone: '0300-7654321', address: 'House 12, Street 4', landmark: 'Near the park' };

test('the public site lists cities and areas and the tax settings', async () => {
  const { site, area } = await kababjees();
  assert.ok(site.locations.length >= 3);
  assert.ok(area && area.deliveryFee === 100);
  assert.equal(site.ordering.taxPercent, 15);
  assert.equal(site.features.cart, true);
});

test('delivery order: 15% tax included in price + delivery fee, like the reference site (Rs. 310 -> 410)', async () => {
  const { burger, area } = await kababjees();
  const r = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { items: [{ id: burger.id, qty: 1, note: 'No mayo' }], areaId: area.id, customer, instructions: 'Ring twice', changeFor: 500 } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.order.tax, 40);
  assert.equal(r.data.order.deliveryFee, 100);
  assert.equal(r.data.order.total, 410);

  // tracking needs the number AND the phone
  const n = r.data.order.number;
  assert.equal((await call(`/public/tenants/kababjees/orders/track?number=${n}&phone=03009999999`)).status, 404);
  const tr = await call(`/public/tenants/kababjees/orders/track?number=${n}&phone=${encodeURIComponent(customer.phone)}`);
  assert.equal(tr.status, 200);
  assert.equal(tr.data.order.status, 'new');
  assert.equal(tr.data.order.customer, undefined, 'no personal data in tracking');

  // kitchen -> rider -> delivered
  const owner = await token('owner@kababjees.test', 'owner');
  const order = (await call('/tenant/orders?source=online', { token: owner })).data.items.find((o) => o.number === n);
  assert.equal(order.items[0].note, 'No mayo');
  for (const s of ['confirmed', 'preparing', 'ready']) assert.equal((await call(`/tenant/orders/${order._id}`, { method: 'PATCH', token: owner, body: { status: s } })).status, 200);
  assert.equal((await call(`/tenant/orders/${order._id}`, { method: 'PATCH', token: owner, body: { status: 'out_for_delivery' } })).status, 400, 'needs a rider first');
  const riders = (await call('/tenant/riders', { token: owner })).data.riders.sort((a, b) => (b.name === 'Kababjees Rider') - (a.name === 'Kababjees Rider'));
  assert.ok(riders.length);
  assert.equal((await call(`/tenant/orders/${order._id}`, { method: 'PATCH', token: owner, body: { riderId: riders[0]._id } })).status, 200);

  const rider = await token('rider@kababjees.test', 'rider');
  const mine = (await call('/tenant/deliveries', { token: rider })).data.items;
  assert.ok(mine.some((o) => o.number === n));
  assert.equal((await call(`/tenant/deliveries/${order._id}`, { method: 'PATCH', token: rider, body: { status: 'delivered' } })).status, 409, 'must pick up first');
  assert.equal((await call(`/tenant/deliveries/${order._id}`, { method: 'PATCH', token: rider, body: { status: 'out_for_delivery' } })).status, 200);
  const onWay = await call(`/public/tenants/kababjees/orders/track?number=${n}&phone=${encodeURIComponent(customer.phone)}`);
  assert.equal(onWay.data.order.status, 'out_for_delivery');
  assert.ok(onWay.data.order.rider?.name, 'customer sees the rider');
  const done = await call(`/tenant/deliveries/${order._id}`, { method: 'PATCH', token: rider, body: { status: 'delivered' } });
  assert.equal(done.status, 200);
  assert.equal(done.data.order.paymentStatus, 'paid', 'cash collected on delivery');

  // a rider cannot see the order list or other people's work
  assert.equal((await call('/tenant/orders', { token: rider })).status, 403);
  assert.equal((await call('/tenant/menu', { token: rider })).status, 403);
});

test('pickup orders have no delivery fee and no address', async () => {
  const { burger, area } = await kababjees();
  const r = await call('/public/tenants/kababjees/orders', { method: 'POST', body: { items: [{ id: burger.id, qty: 2 }], orderType: 'pickup', areaId: area.id, customer: { name: 'Sara', phone: '03111234567' } } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.order.deliveryFee, 0);
  assert.equal(r.data.order.total, 620);
  const owner = await token('owner@kababjees.test', 'owner');
  const o = (await call('/tenant/orders?source=online', { token: owner })).data.items.find((x) => x.number === r.data.order.number);
  await call(`/tenant/orders/${o._id}`, { method: 'PATCH', token: owner, body: { status: 'cancelled' } });
});

test('checkout validation: delivery needs an address and a known area', async () => {
  const { burger, area } = await kababjees();
  const base = { items: [{ id: burger.id, qty: 1 }], customer: { ...customer } };
  assert.equal((await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base } })).data.code, 'AREA_REQUIRED');
  assert.equal((await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base, areaId: '0123456789abcdef01234567' } })).data.code, 'AREA_REQUIRED');
  assert.equal((await call('/public/tenants/kababjees/orders', { method: 'POST', body: { ...base, areaId: area.id, customer: { ...customer, address: '' } } })).data.code, 'ADDRESS_REQUIRED');
});

test('staff doors: each role signs in only through its own door', async () => {
  assert.equal((await loginAs('owner@kababjees.test', 'owner')).status, 200);
  assert.equal((await loginAs('owner@kababjees.test', 'rider')).status, 401);
  assert.equal((await loginAs('manager@kababjees.test', 'manager')).status, 200);
  assert.equal((await loginAs('cashier@kababjees.test', 'worker')).status, 200);
  assert.equal((await loginAs('cashier@kababjees.test', 'manager')).status, 401);
  assert.equal((await loginAs('rider@kababjees.test', 'rider')).status, 200);
  assert.equal((await loginAs('rider@kababjees.test', 'owner')).status, 401);
});

test('complaints are stored for the owner', async () => {
  const r = await call('/public/tenants/kababjees/complaints', { method: 'POST', body: { name: 'Test', phone: '03001112222', orderNumber: 'ABC', message: 'The fries were cold.' } });
  assert.equal(r.status, 201);
  const owner = await token('owner@kababjees.test', 'owner');
  const m = (await call('/tenant/messages', { token: owner })).data.items.find((x) => x.type === 'complaint' && x.message === 'The fries were cold.');
  assert.ok(m);
  assert.equal(m.orderNumber, 'ABC');
});

test('owners manage delivery areas and tax; workers cannot', async () => {
  const owner = await token('owner@kababjees.test', 'owner');
  const add = await call('/tenant/areas/bulk', { method: 'POST', token: owner, body: { city: 'Test City', names: ['Area One', 'Area Two', 'Area One'], deliveryFee: 50 } });
  assert.equal(add.status, 201);
  assert.equal(add.data.added, 2);
  assert.ok((await call('/public/tenants/kababjees')).data.locations.some((c) => c.city === 'Test City'));
  assert.equal((await call('/tenant/areas?city=Test%20City', { method: 'DELETE', token: owner })).data.removed, 2);
  const cashier = await token('cashier@kababjees.test', 'worker');
  assert.equal((await call('/tenant/areas/bulk', { method: 'POST', token: cashier, body: { city: 'X', names: ['Y'] } })).status, 403);
  assert.equal((await call('/tenant/ordering', { method: 'PUT', token: cashier, body: { taxPercent: 0 } })).status, 403);
});
