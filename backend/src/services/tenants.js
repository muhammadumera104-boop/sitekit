const bcrypt = require('bcryptjs');
const { z } = require('zod');
const env = require('../config/env');
const { Tenant, User, Template, MenuCategory, MenuItem, Page } = require('../models');
const { HttpError, slugify, isReserved, sha256, randomToken } = require('../utils/helpers');
const { sendMail } = require('./email');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #c0392b');
const str = z.string().trim().max(2000).optional().or(z.literal(''));

exports.tenantInput = z.object({
  name: z.string().trim().min(2, 'Business name is required').max(80),
  slug: z.string().trim().toLowerCase().optional(),
  businessType: z.string().max(40).optional(),
  templateKey: z.string().max(40).optional(),
  status: z.enum(['draft', 'active']).optional(),
  owner: z.object({ name: z.string().trim().min(2, 'Owner name is required'), email: z.string().email('Valid owner email required'), phone: str }),
  branding: z.object({ logo: str, favicon: str, tagline: str }).partial().optional(),
  theme: z.object({ primary: color, secondary: color, fontHeading: str, fontBody: str, radius: str, mode: z.enum(['dark', 'light']) }).partial().optional(),
  announcement: z.object({ text: str, enabled: z.boolean() }).partial().optional(),
  slides: z.array(z.object({ eyebrow: str, title: str, subtitle: str, image: str, cta: str, link: str })).max(6).optional(),
  flashSale: z.object({ enabled: z.boolean(), title: str, endsAt: z.string().nullable() }).partial().optional(),
  hero: z.object({ title: str, subtitle: str, image: str }).partial().optional(),
  about: z.string().max(10000).optional(),
  contact: z.object({ phone: str, email: str, address: str, map: str }).partial().optional(),
  socials: z.object({ facebook: str, instagram: str, twitter: str, whatsapp: str, youtube: str }).partial().optional(),
  openingHours: z.array(z.object({ day: z.string(), open: str, close: str, closed: z.boolean().optional() })).max(7).optional(),
  seo: z.object({ title: str, description: str, ogImage: str }).partial().optional(),
  sections: z.object({ about: z.boolean(), menu: z.boolean(), gallery: z.boolean(), contact: z.boolean() }).partial().optional(),
  categories: z.array(z.object({
    name: z.string().min(1),
    items: z.array(z.object({
      name: z.string().min(1), description: str, price: z.coerce.number().min(0).optional(), image: str, isAvailable: z.boolean().optional(),
    })).optional(),
  })).optional(),
  pages: z.array(z.object({ title: z.string().min(1), slug: z.string().optional(), body: z.string().optional() })).optional(),
});

exports.validateSlug = async (slug, excludeId) => {
  if (!slug) return { ok: false, reason: 'Slug is required' };
  if (isReserved(slug)) return { ok: false, reason: `"${slug}" is a reserved word` };
  if (!SLUG_RE.test(slug)) return { ok: false, reason: 'Use 3-40 lowercase letters, numbers or hyphens' };
  const existing = await Tenant.findOne({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('_id');
  if (existing) return { ok: false, reason: 'This slug is already taken' };
  // Old slugs keep redirecting to their tenant, so they stay reserved unless they belong to this tenant.
  const old = await Tenant.findOne({ previousSlugs: slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }).select('_id');
  if (old) return { ok: false, reason: 'This slug was used by another website and redirects to it' };
  return { ok: true };
};

exports.makeInviteLink = (token, invite = true) => `${env.clientUrl}/reset-password?token=${token}${invite ? '&invite=1' : ''}`;

// Creates the tenant, its owner account and starter content. Used by the Admin wizard AND the seed script.
exports.createTenant = async (input, createdBy, { password, sendInvite = true } = {}) => {
  const slug = (input.slug || slugify(input.name)).toLowerCase();
  const v = await exports.validateSlug(slug);
  if (!v.ok) throw new HttpError(400, v.reason, 'BAD_SLUG');
  const emailTaken = await User.findOne({ email: input.owner.email.toLowerCase() }).select('_id');
  if (emailTaken) throw new HttpError(409, 'A user with the owner email already exists');

  const templateKey = input.templateKey || 'restaurant';
  const template = await Template.findOne({ key: templateKey, status: 'enabled' });
  if (!template) throw new HttpError(400, 'Selected template is not available');

  const { categories, pages, ...tenantData } = input;
  const tenant = await Tenant.create({
    ...tenantData, slug, templateKey, templateId: template._id, status: input.status || 'draft', createdBy: createdBy?._id,
  });

  let inviteLink = null;
  const owner = { name: input.owner.name, email: input.owner.email.toLowerCase(), role: 'tenant_owner', tenantId: tenant._id };
  if (password) {
    await User.create({ ...owner, passwordHash: await bcrypt.hash(password, 12), status: 'active' });
  } else {
    const token = randomToken();
    await User.create({ ...owner, status: 'invited', resetTokenHash: sha256(token), resetExpires: new Date(Date.now() + 7 * 864e5) });
    inviteLink = exports.makeInviteLink(token);
    if (sendInvite) {
      await sendMail({
        to: owner.email, subject: `Your ${tenant.name} website is ready`,
        text: `Hi ${owner.name}, your website is ready at ${env.clientUrl}/${slug}.\nSet your password to manage it: ${inviteLink}`,
        html: `<p>Hi ${owner.name},</p><p>Your website is ready at <a href="${env.clientUrl}/${slug}">${env.clientUrl}/${slug}</a>.</p><p><a href="${inviteLink}">Set your password</a> to manage it.</p>`,
      });
    }
  }

  let order = 0;
  for (const c of categories || []) {
    const cat = await MenuCategory.create({ tenantId: tenant._id, name: c.name, order: order++ });
    if (c.items?.length) {
      await MenuItem.insertMany(c.items.map((i, idx) => ({
        tenantId: tenant._id, categoryId: cat._id, name: i.name, description: i.description, price: i.price || 0,
        image: i.image, isAvailable: i.isAvailable !== false, order: idx,
        discountPercent: i.discountPercent || 0, stock: i.stock ?? null, tags: i.tags || [], optionGroups: i.optionGroups || [],
      })));
    }
  }
  let po = 0;
  for (const p of pages || []) {
    await Page.create({
      tenantId: tenant._id, title: p.title, slug: slugify(p.slug || p.title) || `page${po}`, isPublished: true, order: po++,
      sections: [{ type: 'text', heading: p.title, body: p.body || '' }],
    });
  }
  return { tenant, inviteLink };
};
