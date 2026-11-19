// Fashion Hub / premium storefront: dark theme default, slides, announcement, flash sale, tags, swatches,
// free delivery above a threshold and the newsletter. Needs a RUNNING API seeded with `npm run seed`.
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const API = process.env.TEST_API || 'http://localhost:5000/api';
const PW = process.env.SEED_PASSWORD || 'Passw0rd!123';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const login = async (email, slug, door) => {
  const r = await call('/auth/login', { method: 'POST', body: { email, password: PW, tenantSlug: slug, door } });
  assert.equal(r.status, 200, `login ${email}`);
  return r.data.accessToken;
};
const site = async (slug = 'fashionhub') => (await call(`/public/tenants/${slug}`)).data;
const find = (s, name) => s.menu.flatMap((c) => c.items).find((i) => i.name === name);

test('every demo store defaults to the dark premium theme', async () => {
  for (const slug of ['kababjees', 'unitedking', 'foodin', 'kravemart', 'fashionhub']) {
    assert.equal((await site(slug)).tenant.theme.mode, 'dark', slug);
  }
});

test('Fashion Hub payload: slides, announcement, flash sale, tags, swatches, shipping text', async () => {
  const s = await site();
  assert.equal(s.tenant.theme.primary, '#c9a24b');
  assert.ok(s.tenant.slides.length >= 3);
  assert.match(s.tenant.announcement.text, /Free delivery/);
  assert.ok(s.tenant.flashSale && new Date(s.tenant.flashSale.endsAt) > new Date());
  assert.equal(s.ordering.etaLabel, '2-4 days');
  assert.equal(s.ordering.freeDeliveryOver, 5000);
  const shirt = find(s, 'Classic Oxford Shirt');
  assert.ok(shirt.tags.includes('featured') && shirt.tags.includes('bestseller'));
  assert.equal(shirt.discountPercent, 24);
  const color = shirt.optionGroups.find((g) => g.name === 'Color');
  assert.ok(color.options.every((o) => /^#[0-9a-f]{6}$/i.test(o.color)), 'swatch colours');
  assert.ok(shirt.optionGroups.find((g) => g.name === 'Size').required);
  // a store without these extras stays clean
  const kb = await site('kababjees');
  assert.equal(kb.tenant.announcement, null);
  assert.deepEqual(kb.tenant.slides, []);
  assert.equal(kb.tenant.flashSale, null);
});

test('free delivery applies above the threshold and not below it', async () => {
  const s = await site();
  const area = s.locations[0].areas[0];
  const shirt = find(s, 'Classic Oxford Shirt');
  const size = shirt.optionGroups.find((g) => g.name === 'Size'); const color = shirt.optionGroups.find((g) => g.name === 'Color');
  const opts = [{ groupId: size.id, optionId: size.options[1].id }, { groupId: color.id, optionId: color.options[0].id }];
  const customer = { name: 'Fashion Tester', phone: '0345-1112233', address: 'House 1, Street 2' };
  const owner = await login('owner@fashionhub.test', 'fashionhub', 'owner');
  const cancel = async (n) => { const o = (await call('/tenant/orders?source=online', { token: owner })).data.items.find((x) => x.number === n); if (o) await call(`/tenant/orders/${o._id}`, { method: 'PATCH', token: owner, body: { status: 'cancelled' } }); };

  const small = await call('/public/tenants/fashionhub/orders', { method: 'POST', body: { items: [{ id: shirt.id, qty: 1, options: opts }], areaId: area.id, customer } });
  assert.equal(small.status, 201, JSON.stringify(small.data));
  assert.equal(small.data.order.deliveryFee, area.deliveryFee, 'under Rs. 5,000 pays delivery');
  assert.equal(small.data.order.total, shirt.salePrice + area.deliveryFee);
  await cancel(small.data.order.number);

  const big = await call('/public/tenants/fashionhub/orders', { method: 'POST', body: { items: [{ id: shirt.id, qty: 2, options: opts }], areaId: area.id, customer } });
  assert.equal(big.status, 201, JSON.stringify(big.data));
  assert.equal(big.data.order.deliveryFee, 0, 'over Rs. 5,000 ships free');
  assert.equal(big.data.order.total, 2 * shirt.salePrice);
  await cancel(big.data.order.number);
});

test('newsletter: valid emails are stored once, bad ones are rejected', async () => {
  const email = `news.${Date.now()}@example.com`;
  assert.equal((await call('/public/tenants/fashionhub/subscribe', { method: 'POST', body: { email } })).status, 201);
  assert.equal((await call('/public/tenants/fashionhub/subscribe', { method: 'POST', body: { email: email.toUpperCase() } })).status, 201, 'duplicate is accepted quietly');
  assert.equal((await call('/public/tenants/fashionhub/subscribe', { method: 'POST', body: { email: 'not-an-email' } })).status, 400);
  const owner = await login('owner@fashionhub.test', 'fashionhub', 'owner');
  const msgs = (await call('/tenant/messages?limit=100', { token: owner })).data.items.filter((m) => m.type === 'newsletter' && m.email === email);
  assert.equal(msgs.length, 1);
});

test('owners can edit storefront extras; values are validated', async () => {
  const owner = await login('owner@fashionhub.test', 'fashionhub', 'owner');
  const before = (await call('/tenant/settings', { token: owner })).data.tenant;
  try {
    const r = await call('/tenant/settings', { method: 'PUT', token: owner, body: { announcement: { text: 'Test banner', enabled: true }, theme: { mode: 'light' } } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const s = await site();
    assert.equal(s.tenant.announcement.text, 'Test banner');
    assert.equal(s.tenant.theme.mode, 'light');
    assert.equal((await call('/tenant/settings', { method: 'PUT', token: owner, body: { theme: { mode: 'purple' } } })).status, 400);
    assert.equal((await call('/tenant/settings', { method: 'PUT', token: owner, body: { announcement: { enabled: false } } })).status, 200);
    assert.equal((await site()).tenant.announcement, null, 'a disabled banner is hidden');
  } finally {
    await call('/tenant/settings', { method: 'PUT', token: owner, body: { announcement: { text: before.announcement?.text || '', enabled: before.announcement?.enabled !== false }, theme: { mode: before.theme.mode || 'dark' } } });
  }
  assert.equal((await site()).tenant.theme.mode, 'dark');
});

test('product tags and swatch colours round-trip through the dashboard', async () => {
  const owner = await login('owner@fashionhub.test', 'fashionhub', 'owner');
  const menu = (await call('/tenant/menu', { token: owner })).data;
  const cat = menu.categories[0];
  const item = await call('/tenant/menu/items', { method: 'POST', token: owner, body: {
    categoryId: cat._id, name: 'Tag Test Tee', price: 1000, tags: ['new', 'bestseller'],
    optionGroups: [{ name: 'Color', required: true, options: [{ name: 'Red', price: 0, color: '#ff0000' }] }],
  } });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  try {
    const pub = find(await site(), 'Tag Test Tee');
    assert.deepEqual(pub.tags.sort(), ['bestseller', 'new']);
    assert.equal(pub.optionGroups[0].options[0].color, '#ff0000');
    const bad = await call('/tenant/menu/items', { method: 'POST', token: owner, body: { categoryId: cat._id, name: 'Bad', price: 1, optionGroups: [{ name: 'C', options: [{ name: 'x', color: 'red' }] }] } });
    assert.equal(bad.status, 400, 'colour must be a hex value');
    assert.equal((await call('/tenant/menu/items', { method: 'POST', token: owner, body: { categoryId: cat._id, name: 'Bad2', price: 1, tags: ['hot'] } })).status, 400, 'unknown tag');
  } finally { await call(`/tenant/menu/items/${item.data.item._id}`, { method: 'DELETE', token: owner }); }
});
