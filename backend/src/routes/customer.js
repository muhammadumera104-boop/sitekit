// Customer accounts (per store): sign up / sign in, saved addresses, order history and reorder.
// Separate from staff login: the token has typ "customer" and is bound to ONE store.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const env = require('../config/env');
const { Tenant, Customer, Order } = require('../models');
const { HttpError, wrap } = require('../utils/helpers');
const { featuresFor } = require('../services/features');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.LOGIN_RATE_LIMIT || 40), standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts, try again later' } });
const sign = (c) => jwt.sign({ typ: 'customer', sub: String(c._id), tid: String(c.tenantId) }, env.accessSecret, { expiresIn: '30d' });
const pub = (c) => ({ id: c._id, name: c.name, phone: c.phone, email: c.email, addresses: c.addresses || [] });
const digits = (p) => String(p || '').replace(/\D/g, '');

async function storeFor(slug) {
  const t = await Tenant.findOne({ slug: String(slug || '').toLowerCase(), status: 'active' });
  if (!t) throw new HttpError(404, 'Store not found', 'NOT_FOUND');
  if (!(await featuresFor(t)).accounts) throw new HttpError(403, 'Customer accounts are not available', 'FEATURE_OFF');
  return t;
}

const auth = wrap(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in');
  let p;
  try { p = jwt.verify(h.slice(7), env.accessSecret); } catch { throw new HttpError(401, 'Please sign in again'); }
  if (p.typ !== 'customer') throw new HttpError(401, 'Please sign in');
  const tenant = await storeFor(req.headers['x-store']);
  if (String(p.tid) !== String(tenant._id)) throw new HttpError(401, 'Please sign in');
  const customer = await Customer.findOne({ _id: p.sub, tenantId: tenant._id });
  if (!customer) throw new HttpError(401, 'Please sign in');
  req.tenant = tenant; req.customer = customer;
  next();
});

router.post('/register', limiter, wrap(async (req, res) => {
  const d = z.object({
    slug: z.string(), name: z.string().trim().min(2, 'Name is required').max(100), phone: z.string().trim().min(7, 'Mobile number is required').max(30),
    email: z.string().email('Valid email required').optional().or(z.literal('')), password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  }).parse(req.body);
  const tenant = await storeFor(d.slug);
  const phone = digits(d.phone);
  if (await Customer.exists({ tenantId: tenant._id, phone })) throw new HttpError(409, 'An account with this mobile number already exists. Please sign in.', 'EXISTS');
  const c = await Customer.create({ tenantId: tenant._id, name: d.name, phone, email: d.email || undefined, passwordHash: await bcrypt.hash(d.password, 10), lastLogin: new Date() });
  res.status(201).json({ token: sign(c), customer: pub(c) });
}));

router.post('/login', limiter, wrap(async (req, res) => {
  const d = z.object({ slug: z.string(), phone: z.string().trim().min(3), password: z.string().min(1) }).parse(req.body);
  const tenant = await storeFor(d.slug);
  const id = d.phone.includes('@') ? { email: d.phone.toLowerCase() } : { phone: digits(d.phone) };
  const c = await Customer.findOne({ tenantId: tenant._id, ...id });
  if (!c || !c.passwordHash || !(await bcrypt.compare(d.password, c.passwordHash))) throw new HttpError(401, 'Invalid mobile number or password');
  c.lastLogin = new Date(); await c.save();
  res.json({ token: sign(c), customer: pub(c) });
}));

router.get('/me', auth, wrap(async (req, res) => res.json({ customer: pub(req.customer) })));
router.put('/me', auth, wrap(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email().optional().or(z.literal('')), password: z.string().min(6).max(100) }).partial().parse(req.body);
  if (d.name) req.customer.name = d.name;
  if (d.email !== undefined) req.customer.email = d.email || undefined;
  if (d.password) req.customer.passwordHash = await bcrypt.hash(d.password, 10);
  await req.customer.save();
  res.json({ customer: pub(req.customer) });
}));

// Saved addresses
const addrSchema = z.object({
  label: z.string().trim().max(30).optional(), city: z.string().trim().max(60).optional(), areaId: z.string().optional(), areaName: z.string().trim().max(100).optional(),
  address: z.string().trim().min(3, 'Address is required').max(300), landmark: z.string().trim().max(150).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional(),
});
router.post('/addresses', auth, wrap(async (req, res) => {
  if (req.customer.addresses.length >= 10) throw new HttpError(400, 'You can save up to 10 addresses');
  req.customer.addresses.push(addrSchema.parse(req.body));
  await req.customer.save();
  res.status(201).json({ customer: pub(req.customer) });
}));
router.put('/addresses/:id', auth, wrap(async (req, res) => {
  const a = req.customer.addresses.id(req.params.id);
  if (!a) throw new HttpError(404, 'Address not found');
  a.set(addrSchema.parse(req.body));
  await req.customer.save();
  res.json({ customer: pub(req.customer) });
}));
router.delete('/addresses/:id', auth, wrap(async (req, res) => {
  const a = req.customer.addresses.id(req.params.id);
  if (!a) throw new HttpError(404, 'Address not found');
  a.deleteOne();
  await req.customer.save();
  res.json({ customer: pub(req.customer) });
}));

// Order history: orders placed while signed in, plus earlier ones with the same phone number.
router.get('/orders', auth, wrap(async (req, res) => {
  const orders = await Order.find({
    tenantId: req.tenant._id, source: 'online',
    $or: [{ customerId: req.customer._id }, { 'customer.phone': { $regex: `${digits(req.customer.phone).slice(-9)}$` } }],
  }).sort({ createdAt: -1 }).limit(50).populate('riderId', 'name phone').lean();
  res.json({
    orders: orders.map((o) => ({
      id: o._id, number: o.number, status: o.status, orderType: o.orderType, createdAt: o.createdAt, total: o.total, area: o.area, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus,
      reviewed: o.reviewed, rider: o.status === 'out_for_delivery' && o.riderId ? { name: o.riderId.name, phone: o.riderId.phone } : null,
      items: o.items.map((i) => ({ itemId: i.itemId, name: i.name, qty: i.qty, unitPrice: i.unitPrice, note: i.note, options: i.options || [] })),
    })),
  });
}));

module.exports = router;
