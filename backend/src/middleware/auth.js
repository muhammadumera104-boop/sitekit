const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User, Tenant } = require('../models');
const { can, PLATFORM_ROLES } = require('../config/permissions');
const { HttpError, wrap } = require('../utils/helpers');
const { audit } = require('../services/audit');

exports.signAccess = (user) => jwt.sign(
  { sub: String(user._id), role: user.role, tenantId: user.tenantId ? String(user.tenantId) : null },
  env.accessSecret, { expiresIn: '15m' },
);

// 401 when not logged in.
exports.authenticate = wrap(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Not authenticated');
  let payload;
  try { payload = jwt.verify(token, env.accessSecret); } catch { throw new HttpError(401, 'Invalid or expired token'); }
  const user = await User.findById(payload.sub).select('-passwordHash -resetTokenHash');
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account unavailable');
  req.user = user;
  next();
});

// 403 (and an audit entry) when the role lacks the permission.
exports.requirePerm = (perm) => wrap(async (req, _res, next) => {
  if (!can(req.user.role, perm)) {
    await audit(req, 'access.denied', { details: { permission: perm, method: req.method, path: req.originalUrl } });
    throw new HttpError(403, 'You do not have permission to perform this action');
  }
  next();
});

exports.requirePlatform = wrap(async (req, _res, next) => {
  if (!PLATFORM_ROLES.includes(req.user.role)) {
    await audit(req, 'access.denied', { details: { reason: 'platform-only', path: req.originalUrl } });
    throw new HttpError(403, 'Platform access only');
  }
  next();
});

// Resolves req.tenantId. Tenant users: ALWAYS from their own account (never from client input).
// Platform users (support/impersonation): from the X-Tenant-Slug header, and each use is auditable.
exports.tenantContext = wrap(async (req, _res, next) => {
  let tenant;
  if (PLATFORM_ROLES.includes(req.user.role)) {
    const slug = String(req.headers['x-tenant-slug'] || '').toLowerCase();
    if (!slug) throw new HttpError(400, 'X-Tenant-Slug header required for platform users');
    tenant = await Tenant.findOne({ slug, status: { $ne: 'deleted' } });
  } else {
    tenant = req.user.tenantId && await Tenant.findById(req.user.tenantId);
    const slug = req.headers['x-tenant-slug'];
    if (slug && tenant && String(slug).toLowerCase() !== tenant.slug) {
      await audit(req, 'access.denied', { details: { reason: 'cross-tenant', requested: slug } });
      throw new HttpError(403, 'You cannot access another tenant');
    }
    if (tenant && ['suspended', 'deleted'].includes(tenant.status)) throw new HttpError(403, 'This tenant is suspended', 'SUSPENDED');
  }
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  req.tenant = tenant;
  req.tenantId = tenant._id;
  next();
});
