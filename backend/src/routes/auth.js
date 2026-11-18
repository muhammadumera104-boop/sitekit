const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const env = require('../config/env');
const { User, Tenant, Session } = require('../models');
const { permissionsFor, PLATFORM_ROLES } = require('../config/permissions');
const { authenticate, signAccess } = require('../middleware/auth');
const { HttpError, wrap, sha256, randomToken } = require('../utils/helpers');
const { audit } = require('../services/audit');
const { sendMail } = require('../services/email');

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts, try again later' } });
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const REFRESH_DAYS = 7;
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: env.isProd, path: '/api/auth', maxAge: REFRESH_DAYS * 864e5 };

async function userPayload(user) {
  let tenantSlug = null;
  if (user.tenantId) tenantSlug = (await Tenant.findById(user.tenantId).select('slug'))?.slug || null;
  return {
    id: user._id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, tenantSlug, branchId: user.branchId || null,
    isPlatform: PLATFORM_ROLES.includes(user.role), permissions: permissionsFor(user.role),
  };
}

async function startSession(res, user) {
  const refresh = randomToken();
  await Session.create({ userId: user._id, refreshTokenHash: sha256(refresh), expiresAt: new Date(Date.now() + REFRESH_DAYS * 864e5) });
  res.cookie('rt', refresh, cookieOpts);
  return { accessToken: signAccess(user), user: await userPayload(user) };
}

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const { email, password, tenantSlug } = z.object({ email: z.string().email(), password: z.string().min(1), tenantSlug: z.string().max(60).optional() }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  const fail = () => new HttpError(401, 'Invalid email or password');
  if (!user || !user.passwordHash) throw fail();
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new HttpError(423, `Account locked. Try again in ${Math.ceil((user.lockUntil - Date.now()) / 60000)} minute(s).`);
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    user.failedAttempts += 1;
    if (user.failedAttempts >= MAX_FAILS) { user.lockUntil = new Date(Date.now() + LOCK_MIN * 60000); user.failedAttempts = 0; }
    await user.save();
    await audit(req, 'login.failed', { userId: user._id, tenantId: user.tenantId, details: { email } });
    throw fail();
  }
  // Separate entry points: /login is for the platform team only, /{slug}/login only for that business's staff.
  // A wrong door gets the same message as a wrong password, so nothing leaks about other accounts.
  let scopeOk;
  if (tenantSlug) {
    const t = await Tenant.findOne({ slug: tenantSlug.toLowerCase() }).select('_id');
    scopeOk = !!t && !!user.tenantId && String(user.tenantId) === String(t._id);
  } else scopeOk = PLATFORM_ROLES.includes(user.role);
  if (!scopeOk) {
    await audit(req, 'login.wrong-door', { userId: user._id, tenantId: user.tenantId, details: { door: tenantSlug || 'platform' } });
    throw fail();
  }
  if (user.status !== 'active') throw new HttpError(403, 'Account is disabled or not yet activated');
  if (user.tenantId) {
    const t = await Tenant.findById(user.tenantId);
    if (!t || ['suspended', 'deleted'].includes(t.status)) throw new HttpError(403, 'This website account is suspended. Contact support.');
  }
  user.failedAttempts = 0; user.lockUntil = undefined; user.lastLogin = new Date();
  await user.save();
  await audit(req, 'login', { userId: user._id, tenantId: user.tenantId });
  res.json(await startSession(res, user));
}));

router.post('/refresh', wrap(async (req, res) => {
  const token = req.cookies?.rt;
  if (!token) throw new HttpError(401, 'No session');
  const session = await Session.findOneAndDelete({ refreshTokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  if (!session) { res.clearCookie('rt', { path: '/api/auth' }); throw new HttpError(401, 'Session expired'); }
  const user = await User.findById(session.userId);
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account unavailable');
  res.json(await startSession(res, user));
}));

router.post('/logout', wrap(async (req, res) => {
  const token = req.cookies?.rt;
  if (token) await Session.deleteOne({ refreshTokenHash: sha256(token) });
  res.clearCookie('rt', { path: '/api/auth' });
  res.json({ ok: true });
}));

router.get('/me', authenticate, wrap(async (req, res) => res.json({ user: await userPayload(req.user) })));

router.post('/forgot-password', loginLimiter, wrap(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && user.status !== 'disabled') {
    const token = randomToken();
    user.resetTokenHash = sha256(token); user.resetExpires = new Date(Date.now() + 60 * 60000);
    await user.save();
    const link = `${env.clientUrl}/reset-password?token=${token}`;
    await sendMail({ to: user.email, subject: 'Reset your password', text: `Reset your password: ${link}\nThis link expires in 1 hour.`, html: `<p>Reset your password: <a href="${link}">${link}</a></p><p>Link expires in 1 hour.</p>` });
    await audit(req, 'password.forgot', { userId: user._id, tenantId: user.tenantId });
  }
  res.json({ message: 'If that email exists, a reset link has been sent.' }); // never reveal whether the email exists
}));

// Also used for the invitation "set your password" link.
router.post('/reset-password', loginLimiter, wrap(async (req, res) => {
  const { token, password } = z.object({
    token: z.string().min(10),
    password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  }).parse(req.body);
  const user = await User.findOne({ resetTokenHash: sha256(token), resetExpires: { $gt: new Date() } });
  if (!user) throw new HttpError(400, 'Reset link is invalid or has expired');
  user.passwordHash = await bcrypt.hash(password, 12);
  user.resetTokenHash = undefined; user.resetExpires = undefined; user.failedAttempts = 0; user.lockUntil = undefined;
  if (user.status === 'invited') user.status = 'active';
  await user.save();
  await Session.deleteMany({ userId: user._id });
  await audit(req, 'password.reset', { userId: user._id, tenantId: user.tenantId });
  const slug = user.tenantId ? (await Tenant.findById(user.tenantId).select('slug'))?.slug : null;
  res.json({ message: 'Password updated. You can now log in.', loginPath: slug ? `/${slug}/login` : '/login' });
}));

// Frontend reports a blocked page visit so direct-URL attempts are logged (UC-4).
router.post('/access-denied', authenticate, wrap(async (req, res) => {
  await audit(req, 'access.denied', { details: { path: String(req.body?.path || '').slice(0, 200), via: 'ui' } });
  res.json({ ok: true });
}));

module.exports = router;
