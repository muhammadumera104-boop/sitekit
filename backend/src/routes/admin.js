const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { Tenant, User, Branch, Order, Template, Message, MenuItem, AuditLog, Session, MenuCategory, Page, Media } = require('../models');
const { authenticate, requirePlatform, requirePerm } = require('../middleware/auth');
const { can, R, PLATFORM_ROLES, TENANT_ROLES } = require('../config/permissions');
const { HttpError, wrap, slugify, escapeRegex, pageParams, sha256, randomToken } = require('../utils/helpers');
const { audit } = require('../services/audit');
const { sendMail } = require('../services/email');
const { tenantInput, createTenant, validateSlug, makeInviteLink } = require('../services/tenants');
const { FEATURES, effectiveFeatures } = require('../config/features');
const { getGlobalFeatures, setGlobalFeatures } = require('../services/features');

router.use(authenticate, requirePlatform);

// ---------- Image upload for the onboarding wizard (tenant does not exist yet) ----------
const multer = require('multer');
const { saveImage } = require('../services/storage');
const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype) ? cb(null, true) : cb(new HttpError(400, 'Only JPG, PNG, WEBP or GIF images are allowed'))),
});
router.post('/upload', requirePerm('tenant.create'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  const saved = await saveImage(req.file, 'onboarding');
  res.status(201).json({ url: saved.url });
}));

// ---------- Dashboard stats (FR-P2) ----------
router.get('/stats', wrap(async (_req, res) => {
  const counts = await Tenant.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const by = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  const [recent, activity] = await Promise.all([
    Tenant.find({ status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).limit(5).select('name slug status createdAt').lean(),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('userId', 'name email').populate('tenantId', 'name slug').lean(),
  ]);
  res.json({
    total: (by.draft || 0) + (by.active || 0) + (by.suspended || 0),
    active: by.active || 0, suspended: by.suspended || 0, draft: by.draft || 0, deleted: by.deleted || 0,
    recent, activity,
  });
}));

// ---------- All websites at a glance (gallery for the Admin Portal) ----------
router.get('/sites', requirePerm('tenant.view'), wrap(async (req, res) => {
  const q = { status: req.query.status ? String(req.query.status) : { $ne: 'deleted' } };
  if (req.query.q) { const rx = new RegExp(escapeRegex(String(req.query.q)), 'i'); q.$or = [{ name: rx }, { slug: rx }]; }
  const tenants = await Tenant.find(q).sort({ name: 1 }).limit(200)
    .select('name slug status templateKey businessType branding hero theme contact owner features createdAt').lean();
  const ids = tenants.map((t) => t._id);
  const [items, orders, users] = await Promise.all([
    MenuItem.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { tenantId: { $in: ids }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$tenantId', n: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
    User.aggregate([{ $match: { tenantId: { $in: ids } } }, { $group: { _id: '$tenantId', n: { $sum: 1 } } }]),
  ]);
  const by = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  const [i, o, u] = [by(items), by(orders), by(users)];
  res.json({
    sites: tenants.map((t) => ({
      ...t, stats: { items: i.get(String(t._id))?.n || 0, orders: o.get(String(t._id))?.n || 0, revenue: o.get(String(t._id))?.revenue || 0, users: u.get(String(t._id))?.n || 0 },
    })),
  });
}));

// ---------- Tenants ----------
router.get('/tenants/check-slug', wrap(async (req, res) => {
  const slug = String(req.query.slug || '').toLowerCase();
  res.json({ slug, ...(await validateSlug(slug, req.query.exclude)) });
}));

router.get('/tenants/suggest-slug', wrap(async (req, res) => res.json({ slug: slugify(req.query.name) })));

router.get('/tenants', wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = {};
  if (req.query.status) q.status = String(req.query.status);
  else q.status = { $ne: 'deleted' };
  if (req.query.q) { const rx = new RegExp(escapeRegex(String(req.query.q)), 'i'); q.$or = [{ name: rx }, { slug: rx }, { 'owner.email': rx }]; }
  const sortKey = ['name', 'createdAt', 'status', 'slug'].includes(req.query.sort) ? req.query.sort : 'createdAt';
  const dir = req.query.dir === 'asc' ? 1 : -1;
  const [items, total] = await Promise.all([
    Tenant.find(q).sort({ [sortKey]: dir }).skip(skip).limit(limit).select('name slug status templateKey businessType owner branding createdAt').lean(),
    Tenant.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

router.post('/tenants', requirePerm('tenant.create'), wrap(async (req, res) => {
  const input = tenantInput.parse(req.body);
  const { tenant, inviteLink } = await createTenant(input, req.user);
  await audit(req, 'tenant.create', { tenantId: tenant._id, details: { slug: tenant.slug, status: tenant.status } });
  res.status(201).json({ tenant, ...(process.env.NODE_ENV !== 'production' ? { inviteLink } : {}) });
}));

router.get('/tenants/:id', requirePerm('tenant.view'), wrap(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  const [users, messages, items, logs] = await Promise.all([
    User.find({ tenantId: tenant._id }).select('name email role status lastLogin').lean(),
    Message.countDocuments({ tenantId: tenant._id }),
    MenuItem.countDocuments({ tenantId: tenant._id }),
    AuditLog.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name').lean(),
  ]);
  const globals = await getGlobalFeatures();
  res.json({
    tenant, users, stats: { messages, items }, logs,
    features: { catalog: catalog(), globals, overrides: tenant.features || {}, effective: effectiveFeatures(tenant.templateKey, globals, tenant.features) },
  });
}));

router.get('/tenants/:id/branches', requirePerm('tenant.view'), wrap(async (req, res) => {
  res.json({ branches: await Branch.find({ tenantId: req.params.id }).sort({ name: 1 }).select('name').lean() });
}));

// Per-store feature toggles: { key: true | false | null }  (null = back to the template default).
router.put('/tenants/:id/features', requirePerm('tenant.features'), wrap(async (req, res) => {
  const body = z.object({ features: z.record(z.string(), z.boolean().nullable()) }).parse(req.body).features;
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant || tenant.status === 'deleted') throw new HttpError(404, 'Tenant not found');
  const next = { ...(tenant.features || {}) };
  for (const [k, v] of Object.entries(body)) {
    if (!FEATURES[k]) throw new HttpError(400, `Unknown feature: ${k}`);
    if (v === null) delete next[k]; else next[k] = v;
  }
  tenant.features = next; tenant.markModified('features');
  await tenant.save();
  await audit(req, 'tenant.features', { tenantId: tenant._id, details: body });
  const globals = await getGlobalFeatures();
  res.json({ features: { catalog: catalog(), globals, overrides: tenant.features, effective: effectiveFeatures(tenant.templateKey, globals, tenant.features) } });
}));

const updateSchema = tenantInput.omit({ owner: true, categories: true, pages: true, status: true }).partial();
router.put('/tenants/:id', requirePerm('tenant.view'), wrap(async (req, res) => {
  const data = updateSchema.parse(req.body);
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant || tenant.status === 'deleted') throw new HttpError(404, 'Tenant not found');
  if (data.slug && data.slug !== tenant.slug) {
    const v = await validateSlug(data.slug, tenant._id);
    if (!v.ok) throw new HttpError(400, v.reason, 'BAD_SLUG');
    tenant.previousSlugs = [...new Set([...tenant.previousSlugs.filter((s) => s !== data.slug), tenant.slug])]; // FR-T12 redirect
  }
  if (data.templateKey && data.templateKey !== tenant.templateKey) {
    if (!can(req.user.role, 'tenant.changeTemplate')) throw new HttpError(403, 'Cannot change template');
    const tpl = await Template.findOne({ key: data.templateKey, status: 'enabled' });
    if (!tpl) throw new HttpError(400, 'Template not available');
    tenant.templateId = tpl._id;
  }
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && tenant[k] && typeof tenant[k] === 'object') Object.assign(tenant[k], v);
    else tenant.set(k, v);
  }
  await tenant.save();
  await audit(req, 'tenant.update', { tenantId: tenant._id, details: { fields: Object.keys(data) } });
  res.json({ tenant });
}));

// suspend / activate / draft / restore. Only roles with the right permission may do each transition.
router.patch('/tenants/:id/status', wrap(async (req, res) => {
  const { status, reason } = z.object({ status: z.enum(['draft', 'active', 'suspended']), reason: z.string().max(500).optional() }).parse(req.body);
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  const needsSuspend = status === 'suspended' || ['suspended', 'deleted'].includes(tenant.status);
  if (!can(req.user.role, needsSuspend ? 'tenant.suspend' : 'site.publish')) {
    await audit(req, 'access.denied', { tenantId: tenant._id, details: { action: `status:${status}` } });
    throw new HttpError(403, 'You do not have permission to change this status');
  }
  if (status === 'suspended' && !reason) throw new HttpError(400, 'A reason is required to suspend a tenant');
  const from = tenant.status;
  tenant.status = status; tenant.suspendReason = status === 'suspended' ? reason : undefined; tenant.deletedAt = undefined;
  await tenant.save();
  await audit(req, `tenant.${status === 'suspended' ? 'suspend' : from === 'suspended' || from === 'deleted' ? 'activate' : 'status'}`, { tenantId: tenant._id, details: { from, to: status, reason } });
  await sendMail({ to: tenant.owner?.email, subject: `Your ${tenant.name} website status: ${status}`, text: `Your website status is now "${status}".${reason ? `\nReason: ${reason}` : ''}` });
  res.json({ tenant });
}));

// Soft delete (SRS 5.2); permanent purge happens after the retention window.
router.delete('/tenants/:id', requirePerm('tenant.delete'), wrap(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  tenant.status = 'deleted'; tenant.deletedAt = new Date();
  await tenant.save();
  await Session.deleteMany({ userId: { $in: (await User.find({ tenantId: tenant._id }).select('_id')).map((u) => u._id) } });
  await audit(req, 'tenant.delete', { tenantId: tenant._id, details: { slug: tenant.slug } });
  res.json({ ok: true });
}));

router.post('/tenants/:id/impersonate', requirePerm('tenant.view'), wrap(async (req, res) => {
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant || tenant.status === 'deleted') throw new HttpError(404, 'Tenant not found');
  await audit(req, 'impersonate.start', { tenantId: tenant._id, details: { slug: tenant.slug } });
  res.json({ slug: tenant.slug });
}));

// ---------- Feature toggles ----------
const catalog = () => Object.entries(FEATURES).map(([key, f]) => ({ key, label: f.label, description: f.description, defaults: f.defaults }));

// Global switches (platform-wide kill switch). Every platform user can read them; only the Super Admin changes them.
router.get('/features', wrap(async (_req, res) => res.json({ catalog: catalog(), globals: await getGlobalFeatures() })));
router.put('/features', requirePerm('features.manage'), wrap(async (req, res) => {
  const body = z.object({ features: z.record(z.string(), z.boolean()) }).parse(req.body).features;
  for (const k of Object.keys(body)) if (!FEATURES[k]) throw new HttpError(400, `Unknown feature: ${k}`);
  const next = { ...(await getGlobalFeatures()), ...body };
  await setGlobalFeatures(next);
  await audit(req, 'features.global', { tenantId: null, details: body });
  res.json({ catalog: catalog(), globals: next });
}));

// ---------- Templates (FR-P7) ----------
router.get('/templates', wrap(async (_req, res) => {
  const [templates, usage] = await Promise.all([
    Template.find().sort({ key: 1 }).lean(),
    Tenant.aggregate([{ $match: { status: { $ne: 'deleted' } } }, { $group: { _id: '$templateKey', n: { $sum: 1 } } }]),
  ]);
  const u = Object.fromEntries(usage.map((x) => [x._id, x.n]));
  res.json({ templates: templates.map((t) => ({ ...t, tenantCount: u[t.key] || 0 })) });
}));

router.post('/templates', requirePerm('templates.manage'), wrap(async (req, res) => {
  const d = z.object({ key: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2), description: z.string().optional(), previewImage: z.string().optional(), supportedSections: z.array(z.string()).optional(), dataSchema: z.any().optional() }).parse(req.body);
  const t = await Template.create(d);
  await audit(req, 'template.create', { tenantId: null, details: { key: t.key } });
  res.status(201).json({ template: t });
}));

router.put('/templates/:id', requirePerm('templates.manage'), wrap(async (req, res) => {
  const d = z.object({ name: z.string().min(2), description: z.string(), previewImage: z.string(), status: z.enum(['enabled', 'disabled']), supportedSections: z.array(z.string()), dataSchema: z.any() }).partial().parse(req.body);
  const t = await Template.findByIdAndUpdate(req.params.id, { $set: d }, { returnDocument: 'after' });
  if (!t) throw new HttpError(404, 'Template not found');
  await audit(req, 'template.update', { tenantId: null, details: { key: t.key, fields: Object.keys(d) } });
  res.json({ template: t });
}));

// ---------- Users (FR-P6) ----------
router.get('/users', wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = {};
  // Platform staff may only see tenant users; Super Admin sees everyone.
  if (!can(req.user.role, 'platformUsers.manage')) q.role = { $in: TENANT_ROLES };
  else if (req.query.scope === 'platform') q.role = { $in: PLATFORM_ROLES };
  else if (req.query.scope === 'tenant') q.role = { $in: TENANT_ROLES };
  if (req.query.tenantId) q.tenantId = req.query.tenantId;
  if (req.query.q) { const rx = new RegExp(escapeRegex(String(req.query.q)), 'i'); q.$or = [{ name: rx }, { email: rx }]; }
  const [items, total] = await Promise.all([
    User.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).select('name email role status tenantId lastLogin createdAt').populate('tenantId', 'name slug').lean(),
    User.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

const userSchema = z.object({
  name: z.string().trim().min(2), email: z.string().email(), role: z.enum(Object.values(R)),
  tenantId: z.string().optional().nullable(), status: z.enum(['active', 'disabled', 'invited']).optional(),
  password: z.string().min(8).optional(), branchId: z.string().nullable().optional(),
});
// Cashiers / vendors belong to one branch of their store.
async function branchFor(role, tenantId, branchId, current) {
  const id = ![R.TC, R.TV].includes(role) ? null : branchId === undefined ? current || null : branchId;
  if (role === R.TV && !id) throw new HttpError(400, 'A vendor must be assigned to a branch', 'BRANCH_REQUIRED');
  if (id && !(await Branch.exists({ _id: id, tenantId }))) throw new HttpError(400, 'Branch not found for this tenant');
  return id;
}
function assertCanManage(req, role) {
  const perm = PLATFORM_ROLES.includes(role) ? 'platformUsers.manage' : 'tenantUsers.manage';
  if (!can(req.user.role, perm)) throw new HttpError(403, 'You do not have permission to manage this kind of user');
}

router.post('/users', wrap(async (req, res) => {
  const d = userSchema.parse(req.body);
  assertCanManage(req, d.role);
  let tenantId = null;
  if (!PLATFORM_ROLES.includes(d.role)) {
    if (!d.tenantId || !(await Tenant.exists({ _id: d.tenantId }))) throw new HttpError(400, 'A valid tenant is required for tenant users');
    tenantId = d.tenantId;
  }
  const user = new User({ name: d.name, email: d.email.toLowerCase(), role: d.role, tenantId, status: d.password ? 'active' : 'invited', branchId: await branchFor(d.role, tenantId, d.branchId) });
  let inviteLink = null;
  if (d.password) user.passwordHash = await bcrypt.hash(d.password, 12);
  else {
    const token = randomToken(); user.resetTokenHash = sha256(token); user.resetExpires = new Date(Date.now() + 7 * 864e5);
    inviteLink = makeInviteLink(token);
    await sendMail({ to: user.email, subject: 'You have been invited', text: `Set your password: ${inviteLink}` });
  }
  await user.save();
  await audit(req, 'user.create', { tenantId, details: { email: user.email, role: user.role } });
  res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role }, ...(process.env.NODE_ENV !== 'production' ? { inviteLink } : {}) });
}));

router.put('/users/:id', wrap(async (req, res) => {
  const d = userSchema.partial().parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  assertCanManage(req, user.role);
  if (d.role) { assertCanManage(req, d.role); if (d.role !== user.role) await audit(req, 'role.change', { tenantId: user.tenantId, details: { user: user.email, from: user.role, to: d.role } }); user.role = d.role; }
  if (d.branchId !== undefined || d.role) user.branchId = await branchFor(user.role, user.tenantId, d.branchId, user.branchId);
  if (d.name) user.name = d.name;
  if (d.status) { if (String(user._id) === String(req.user._id) && d.status === 'disabled') throw new HttpError(400, 'You cannot disable yourself'); user.status = d.status; }
  if (d.password) user.passwordHash = await bcrypt.hash(d.password, 12);
  await user.save();
  await audit(req, 'user.update', { tenantId: user.tenantId, details: { email: user.email } });
  res.json({ ok: true });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  assertCanManage(req, user.role);
  if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot delete yourself');
  await user.deleteOne(); await Session.deleteMany({ userId: user._id });
  await audit(req, 'user.delete', { tenantId: user.tenantId, details: { email: user.email } });
  res.json({ ok: true });
}));

// ---------- Audit log ----------
router.get('/audit', requirePerm('audit.view'), wrap(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = {};
  if (req.query.action) q.action = String(req.query.action);
  if (req.query.tenantId) q.tenantId = req.query.tenantId;
  const [items, total] = await Promise.all([
    AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'name email role').populate('tenantId', 'name slug').lean(),
    AuditLog.countDocuments(q),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

module.exports = router;
