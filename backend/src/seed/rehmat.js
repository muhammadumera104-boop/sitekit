// Fills the "rehmat-e-sheereen" bakery store (created in the admin wizard, so it started empty) with a starter menu,
// real photos (Unsplash, free licence), branding and delivery areas. Idempotent: it only adds what is missing.
// All prices, texts and areas are SAMPLE data for the owner to replace in the dashboard.
const { rsLogo } = require('./brandmarks');

const un = (id, w = 700, h = 560) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&q=75&auto=format&fit=crop`;
const WEIGHT = (extra = [0, 1800, 3400]) => ({ name: 'Weight', required: true, multiple: false, options: [{ name: '1 lb', price: extra[0] }, { name: '2 lb', price: extra[1] }, { name: '3 lb', price: extra[2] }] });
const it = (name, description, price, photo, { off = 0, tags = [], groups = [], stock = null } = {}) => ({ name, description, price, image: un(photo), discountPercent: off, tags, optionGroups: groups, stock });

const MENU = [
  { name: 'Cakes', items: [
    it('Birthday Chocolate Cake', 'Moist chocolate sponge with rich cocoa cream. Add your message in the note.', 1800, '1606983340126-99ab4feaa64a', { tags: ['featured', 'bestseller'], groups: [WEIGHT()] }),
    it('Chocolate Drip Cake', 'Layers of chocolate sponge finished with a glossy ganache drip.', 2400, '1588195538326-c5b1e9f80a1b', { tags: ['featured', 'new'], groups: [WEIGHT()] }),
    it('Red Velvet Cake', 'Classic red velvet with silky cream-cheese frosting.', 2200, '1586788680434-30d324b2d46f', { off: 10, tags: ['bestseller'], groups: [WEIGHT()] }),
    it('Blueberry Cheesecake', 'Baked cheesecake on a buttery biscuit base with blueberry compote.', 2600, '1779282159217-226d9e831c03', { tags: ['new'] }),
  ] },
  { name: 'Pastries & Donuts', items: [
    it('Fresh Cream Pastry', 'Soft sponge layered with fresh cream. Baked every morning.', 220, '1622941367239-8acd68fa946d', { tags: ['bestseller'] }),
    it('Strawberry Fruit Pastry', 'Light sponge, vanilla cream and fresh strawberries.', 260, '1593424731252-a846f98af7e6', { tags: ['featured'] }),
    it('Sprinkle Donut', 'Fluffy ring donut with chocolate glaze and sprinkles.', 160, '1551024601-bec78aea704b', {}),
    it('Butter Croissant', 'Flaky, golden and buttery. Best enjoyed warm.', 200, '1691480162735-9b91238080f6', { tags: ['new'] }),
  ] },
  { name: 'Mithai (Sweets)', items: [
    it('Gulab Jamun (1 kg)', 'Soft khoya dumplings soaked in warm cardamom syrup.', 1200, '1666190092159-3171cf0fbb12', { tags: ['featured', 'bestseller'] }),
    it('Fresh Jalebi (1 kg)', 'Crisp, golden and syrupy, fried fresh all day.', 900, '1778448806852-db6a837fa98f', { off: 10, tags: ['featured'] }),
    it('Motichoor Ladoo (1 kg)', 'Tiny boondi pearls, ghee and saffron — a celebration classic.', 1400, '1635952346904-95f2ccfcd029', { tags: ['bestseller'] }),
    it('Rasmalai (6 pcs)', 'Spongy milk dumplings in chilled saffron-pistachio milk.', 1100, '1694402594431-23c594be1745', { tags: ['new'] }),
    it('Assorted Mithai Box (1 kg)', 'A gift box of our best mithai — perfect for Eid, weddings and visits.', 2000, '1649140041688-0f75446e707e', { tags: ['featured'] }),
  ] },
  { name: 'Bakery & Snacks', items: [
    it('Fresh Milk Bread', 'Soft sliced loaf, baked every morning.', 240, '1598373182133-52452f7691ef', {}),
    it('Sourdough Loaf', 'Slow-fermented sourdough with a crisp crust.', 420, '1534620808146-d33bb39128b2', { tags: ['new'] }),
    it('Butter Cookies Jar', 'Crunchy butter and chocolate-chip cookies in a gift jar.', 600, '1558961363-fa8fdf82db35', { off: 15 }),
    it('Chicken Samosa (6 pcs)', 'Crisp pastry parcels with a spiced chicken filling.', 360, '1601050690597-df0568f70950', { tags: ['bestseller'] }),
  ] },
];

const AREAS = [
  ['Karachi', 150, ['Saddar', 'Clifton', 'DHA', 'Gulshan-e-Iqbal', 'Gulistan-e-Jauhar', 'North Nazimabad', 'Nazimabad', 'PECHS', 'Bahadurabad', 'Tariq Road', 'Korangi', 'Malir']],
];

async function ensureRehmat(models, proPlan) {
  const made = [];
  const t = await models.Tenant.findOne({ slug: 'rehmatesheereen' });
  if (!t) return made;
  const set = {};
  if (t.status === 'deleted') { set.status = 'active'; made.push('restored (was deleted)'); }
  if (!t.branding?.logo) { set['branding.logo'] = rsLogo; made.push('logo'); }
  if (!t.branding?.tagline) set['branding.tagline'] = 'Fresh cakes, mithai and bakery — baked with love';
  if (!t.hero?.image) {
    set['hero.image'] = un('1587241321921-91a834d6d191', 1800, 1000); set['hero.title'] = 'Sweet moments, baked fresh';
    set['hero.subtitle'] = 'Celebration cakes, traditional mithai and fresh bakery — delivered to your door.';
  }
  if (!t.about) set.about = 'We bake fresh every morning: celebration cakes, pastries, traditional mithai and everyday bakery favourites.\n\nOrder online for delivery or pickup, and add a message to your cake in the order note.';
  if (!t.contact?.address) set['contact.address'] = 'Karachi, Pakistan';
  if (!t.openingHours?.length) set.openingHours = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({ day, open: '09:00', close: '23:00', closed: false }));
  if (!t.seo?.title) { set['seo.title'] = `${t.name} | Cakes, Mithai & Bakery`; set['seo.description'] = 'Order fresh cakes, pastries, mithai and bakery items online.'; }
  if (t.theme?.primary === '#c0392b' && t.theme?.fontHeading === 'Georgia, serif') {
    Object.assign(set, { 'theme.primary': '#d08c3c', 'theme.secondary': '#24120c', 'theme.fontHeading': 'var(--font-playfair), Georgia, serif', 'theme.fontBody': 'var(--font-jakarta), system-ui, sans-serif', 'theme.radius': '14px', 'theme.mode': 'dark' });
    made.push('dark premium theme');
  }
  if (!t.planId && proPlan) set.planId = proPlan._id;
  if (!t.ordering?.etaLabel && !t.ordering?.taxPercent) Object.assign(set, { 'ordering.taxPercent': 15, 'ordering.taxInclusive': true, 'ordering.etaMinutes': 60, 'ordering.freeDeliveryOver': 3000 });
  if (Object.keys(set).length) await models.Tenant.updateOne({ _id: t._id }, { $set: set, ...(t.status === 'deleted' ? { $unset: { deletedAt: '' } } : {}) });

  let branch = await models.Branch.findOne({ tenantId: t._id });
  if (!branch) { branch = await models.Branch.create({ tenantId: t._id, name: 'Main Branch', address: 'Karachi' }); made.push('branch'); }
  if (!(await models.ServiceArea.countDocuments({ tenantId: t._id }))) {
    const docs = [];
    for (const [city, fee, names] of AREAS) for (const name of names) docs.push({ tenantId: t._id, city, name, deliveryFee: fee, branchId: branch._id });
    await models.ServiceArea.insertMany(docs); made.push(`${docs.length} delivery areas`);
  }
  for (const cat of MENU) {
    let c = await models.MenuCategory.findOne({ tenantId: t._id, name: cat.name });
    if (!c) c = await models.MenuCategory.create({ tenantId: t._id, name: cat.name, order: await models.MenuCategory.countDocuments({ tenantId: t._id }) });
    for (const [i, item] of cat.items.entries()) {
      if (await models.MenuItem.exists({ tenantId: t._id, name: item.name })) continue;
      await models.MenuItem.create({ ...item, tenantId: t._id, categoryId: c._id, order: i });
      made.push(`product ${item.name}`);
    }
  }
  if (!(await models.Media.countDocuments({ tenantId: t._id }))) {
    await models.Media.insertMany([['1775637659246-a508a5baa4eb', 'Our bakery'], ['1568254183919-78a4f43a2877', 'Fresh bakery'], ['1623334044303-241021148842', 'Croissants'], ['1646615077267-97c6088b74d9', 'Donuts']]
      .map(([id, caption]) => ({ tenantId: t._id, url: un(id, 900, 700), type: 'image/jpeg', isGallery: true, caption })));
    made.push('gallery');
  }
  return made;
}

module.exports = { ensureRehmat };
