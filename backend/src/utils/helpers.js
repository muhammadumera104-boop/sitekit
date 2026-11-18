const crypto = require('crypto');
const { RESERVED_SLUGS } = require('../config/permissions');

const slugify = (s = '') => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '').slice(0, 40);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('hex');
const isReserved = (slug) => RESERVED_SLUGS.includes(slug);

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clientIp = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pageParams = (q) => {
  const page = Math.max(1, parseInt(q.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { slugify, sha256, randomToken, isReserved, HttpError, wrap, clientIp, escapeRegex, pageParams };
