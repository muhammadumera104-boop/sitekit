// Integration tests against a RUNNING API seeded with `npm run seed`.
//   terminal 1: npm run dev     terminal 2: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const API = process.env.TEST_API || 'http://localhost:5000/api';
const PW = process.env.SEED_PASSWORD || 'Passw0rd!123';

async function call(path, { method = 'GET', body, token, tenant } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'X-Tenant-Slug': tenant } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const SUPER = process.env.SUPER_ADMIN_EMAIL, STAFF = process.env.STAFF_EMAIL;
const PASSWORDS = { [SUPER]: process.env.SUPER_ADMIN_PASSWORD, [STAFF]: process.env.STAFF_PASSWORD };
// Each door only accepts its own people: /login = platform team, /{slug}/login = that business.
const doorOf = (email) => (email === SUPER || email === STAFF ? undefined : email.split('@')[1].replace('.test', ''));
async function login(email) {
  const r = await call('/auth/login', { method: 'POST', body: { email, password: PASSWORDS[email] || PW, tenantSlug: doorOf(email) } });
  assert.equal(r.status, 200, `login ${email}`);
  return r.data.accessToken;
}

test('unauthenticated requests get 401', async () => {
  assert.equal((await call('/tenant/settings')).status, 401);
  assert.equal((await call('/admin/tenants')).status, 401);
});

test('tenant user cannot read another tenant via header', async () => {
  const t = await login('owner@kababjees.test');
  const own = await call('/tenant/settings', { token: t });
  assert.equal(own.data.tenant.slug, 'kababjees');
  assert.equal((await call('/tenant/settings', { token: t, tenant: 'foodin' })).status, 403);
});

test('tenant user cannot modify or reference another tenant\'s records', async () => {
  const kj = await login('owner@kababjees.test');
  const fi = await login('owner@foodin.test');
  const foodin = await call('/tenant/menu', { token: fi });
  const foreignItem = foodin.data.items[0]._id;
  const foreignCat = foodin.data.categories[0]._id;
  assert.equal((await call(`/tenant/menu/items/${foreignItem}`, { method: 'PUT', token: kj, body: { name: 'hacked' } })).status, 404);
  assert.equal((await call(`/tenant/menu/items/${foreignItem}`, { method: 'DELETE', token: kj })).status, 404);
  const r = await call('/tenant/menu/items', { method: 'POST', token: kj, body: { categoryId: foreignCat, name: 'x', price: 1 } });
  assert.equal(r.status, 400);
  // listing never includes foreign data
  const mine = await call('/tenant/menu', { token: kj });
  assert.ok(!mine.data.items.some((i) => i._id === foreignItem));
});

test('tenant users cannot reach the admin API', async () => {
  const t = await login('owner@kravemart.test');
  assert.equal((await call('/admin/tenants', { token: t })).status, 403);
});

test('role restrictions follow the permission matrix', async () => {
  const editor = await login('editor@kababjees.test');
  assert.equal((await call('/tenant/users', { token: editor })).status, 403); // owner only
  assert.equal((await call('/tenant/settings', { method: 'PUT', token: editor, body: { name: 'x' } })).status, 403);
  assert.equal((await call('/tenant/publish', { method: 'POST', token: editor, body: { publish: false } })).status, 403);
  assert.equal((await call('/tenant/menu', { token: editor })).status, 200); // content allowed
  const staff = await login(STAFF);
  const t = (await call('/admin/tenants?q=foodin', { token: staff })).data.items[0];
  assert.equal((await call(`/admin/tenants/${t._id}/status`, { method: 'PATCH', token: staff, body: { status: 'suspended', reason: 'x' } })).status, 403);
  assert.equal((await call(`/admin/tenants/${t._id}`, { method: 'DELETE', token: staff })).status, 403);
});

test('reserved and duplicate slugs are rejected', async () => {
  const admin = await login(SUPER);
  for (const s of ['admin', 'dashboard', 'login', 'api', '_next', '404']) {
    assert.equal((await call(`/admin/tenants/check-slug?slug=${s}`, { token: admin })).data.ok, false, s);
  }
  assert.equal((await call('/admin/tenants/check-slug?slug=kababjees', { token: admin })).data.ok, false);
  assert.equal((await call('/admin/tenants/check-slug?slug=freshname1', { token: admin })).data.ok, true);
});

test('suspended tenant site is hidden and its users cannot log in', async () => {
  const admin = await login(SUPER);
  const t = (await call('/admin/tenants?q=unitedking', { token: admin })).data.items[0];
  try {
    assert.equal((await call(`/admin/tenants/${t._id}/status`, { method: 'PATCH', token: admin, body: { status: 'suspended', reason: 'test' } })).status, 200);
    assert.equal((await call('/public/tenants/unitedking')).status, 403);
    const l = await call('/auth/login', { method: 'POST', body: { email: 'owner@unitedking.test', password: PW, tenantSlug: 'unitedking' } });
    assert.equal(l.status, 403);
  } finally {
    await call(`/admin/tenants/${t._id}/status`, { method: 'PATCH', token: admin, body: { status: 'active' } });
  }
  assert.equal((await call('/public/tenants/unitedking')).status, 200);
});

test('unknown slug is a 404 and NoSQL operators are stripped', async () => {
  assert.equal((await call('/public/tenants/does-not-exist')).status, 404);
  const r = await call('/auth/login', { method: 'POST', body: { email: { $gt: '' }, password: { $gt: '' } } });
  assert.equal(r.status, 400);
});

test('renamed slug keeps redirecting and stays reserved (FR-T12)', async () => {
  const admin = await login(SUPER);
  const t = (await call('/admin/tenants?q=foodin', { token: admin })).data.items[0];
  try {
    assert.equal((await call(`/admin/tenants/${t._id}`, { method: 'PUT', token: admin, body: { slug: 'foodinnew' } })).status, 200);
    const old = await call('/public/tenants/foodin');
    assert.equal(old.status, 404); assert.equal(old.data.code, 'MOVED'); assert.equal(old.data.message, 'foodinnew');
    assert.equal((await call('/public/tenants/foodinnew')).status, 200);
    assert.equal((await call('/admin/tenants/check-slug?slug=foodin', { token: admin })).data.ok, false);
  } finally {
    await call(`/admin/tenants/${t._id}`, { method: 'PUT', token: admin, body: { slug: 'foodin' } });
  }
  assert.equal((await call('/public/tenants/foodin')).status, 200);
});

test('separate doors: wrong login page and tenant listing are blocked', async () => {
  const bad = (body) => call('/auth/login', { method: 'POST', body });
  // a business owner cannot sign in through the platform door or another business's door
  assert.equal((await bad({ email: 'owner@kababjees.test', password: PW })).status, 401);
  assert.equal((await bad({ email: 'owner@kababjees.test', password: PW, tenantSlug: 'foodin' })).status, 401);
  // the super admin cannot sign in through a business door
  assert.equal((await bad({ email: SUPER, password: PASSWORDS[SUPER], tenantSlug: 'kababjees' })).status, 401);
  // the old shared demo password and old demo admin do not work
  assert.equal((await bad({ email: 'admin@platform.test', password: PW })).status, 401);
  assert.equal((await bad({ email: SUPER, password: PW })).status, 401);
  // nobody can list the tenants
  assert.equal((await call('/public/tenants')).status, 404);
  // brand endpoint only describes the one requested business
  const b = await call('/public/tenants/kababjees/brand');
  assert.equal(b.data.slug, 'kababjees');
});
