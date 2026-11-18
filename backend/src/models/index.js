const mongoose = require('mongoose');
const { Schema } = mongoose;
const { R } = require('../config/permissions');

const oid = Schema.Types.ObjectId;
const tenantId = { type: oid, ref: 'Tenant', required: true, index: true };
const opts = { timestamps: true };

const Tenant = mongoose.model('Tenant', new Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  previousSlugs: [{ type: String, index: true }],
  businessType: { type: String, default: 'restaurant' },
  status: { type: String, enum: ['draft', 'active', 'suspended', 'deleted'], default: 'draft', index: true },
  suspendReason: String,
  deletedAt: Date,
  templateId: { type: oid, ref: 'Template' },
  templateKey: { type: String, default: 'restaurant' },
  theme: {
    primary: { type: String, default: '#c0392b' },
    secondary: { type: String, default: '#2c3e50' },
    fontHeading: { type: String, default: 'Georgia, serif' },
    fontBody: { type: String, default: 'system-ui, sans-serif' },
    radius: { type: String, default: '10px' },
  },
  branding: { logo: String, favicon: String, tagline: String },
  hero: { title: String, subtitle: String, image: String },
  about: { type: String, default: '' },
  contact: { phone: String, email: String, address: String, map: String },
  socials: { facebook: String, instagram: String, twitter: String, whatsapp: String, youtube: String },
  openingHours: [{ day: String, open: String, close: String, closed: Boolean }],
  sections: {
    about: { type: Boolean, default: true },
    menu: { type: Boolean, default: true },
    gallery: { type: Boolean, default: true },
    contact: { type: Boolean, default: true },
  },
  seo: { title: String, description: String, ogImage: String },
  features: { type: Schema.Types.Mixed, default: {} },
  ordering: {
    taxPercent: { type: Number, default: 0, min: 0, max: 50 },
    taxInclusive: { type: Boolean, default: true }, // listed prices already include tax
    taxLabel: { type: String, default: 'Tax' },
    minOrder: { type: Number, default: 0, min: 0 },
    etaMinutes: { type: Number, default: 45, min: 5, max: 240 },
    payments: { type: [String], default: ['cod'] },
  },
  owner: { name: String, email: String, phone: String },
  createdBy: { type: oid, ref: 'User' },
}, opts));

const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: String,
  role: { type: String, enum: Object.values(R), required: true },
  tenantId: { type: oid, ref: 'Tenant', default: null, index: true },
  branchId: { type: oid, ref: 'Branch', default: null },
  phone: String,
  status: { type: String, enum: ['active', 'disabled', 'invited'], default: 'invited' },
  failedAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  resetTokenHash: String,
  resetExpires: Date,
  lastLogin: Date,
}, opts));

const Role = mongoose.model('Role', new Schema({
  name: { type: String, unique: true },
  scope: { type: String, enum: ['platform', 'tenant'] },
  permissions: [String],
}, opts));

const Template = mongoose.model('Template', new Schema({
  key: { type: String, unique: true, required: true },
  name: String,
  description: String,
  previewImage: String,
  version: { type: Number, default: 1 },
  supportedSections: [String],
  dataSchema: Schema.Types.Mixed,
  status: { type: String, enum: ['enabled', 'disabled'], default: 'enabled' },
}, opts));

const pageSchema = new Schema({
  tenantId,
  title: { type: String, required: true },
  slug: { type: String, required: true },
  sections: [{ type: { type: String, default: 'text' }, heading: String, body: String, image: String }],
  isPublished: { type: Boolean, default: false },
  showInNav: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, opts);
pageSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
const Page = mongoose.model('Page', pageSchema);

const MenuCategory = mongoose.model('MenuCategory', new Schema({
  tenantId, name: { type: String, required: true }, order: { type: Number, default: 0 }, isActive: { type: Boolean, default: true },
}, opts));

const MenuItem = mongoose.model('MenuItem', new Schema({
  tenantId,
  categoryId: { type: oid, ref: 'MenuCategory', index: true },
  name: { type: String, required: true },
  description: String,
  price: { type: Number, default: 0, min: 0 },
  image: String,
  isAvailable: { type: Boolean, default: true },
  discountPercent: { type: Number, default: 0, min: 0, max: 90 },
  stock: { type: Number, default: null, min: 0 }, // null = not tracked
  branchId: { type: oid, ref: 'Branch', default: null, index: true }, // null = all branches
  order: { type: Number, default: 0 },
}, opts));

const Media = mongoose.model('Media', new Schema({
  tenantId, url: { type: String, required: true }, publicId: String, type: String, size: Number,
  isGallery: { type: Boolean, default: false }, caption: String, uploadedBy: { type: oid, ref: 'User' },
}, opts));

const Message = mongoose.model('Message', new Schema({
  tenantId, type: { type: String, enum: ['contact', 'complaint'], default: 'contact' }, orderNumber: String,
  name: { type: String, required: true }, email: String, phone: String, message: { type: String, required: true },
  status: { type: String, enum: ['new', 'read', 'archived'], default: 'new' },
}, opts));

const AuditLog = mongoose.model('AuditLog', new Schema({
  userId: { type: oid, ref: 'User', index: true },
  tenantId: { type: oid, ref: 'Tenant', index: true, default: null },
  action: { type: String, index: true },
  details: Schema.Types.Mixed,
  ip: String,
}, opts));

const Session = mongoose.model('Session', new Schema({
  userId: { type: oid, ref: 'User', index: true },
  refreshTokenHash: { type: String, index: true },
  expiresAt: { type: Date, index: { expires: 0 } },
}, opts));

const Visit = mongoose.model('Visit', new Schema({
  tenantId, path: String, day: { type: String, index: true },
}, opts));

const Branch = mongoose.model('Branch', new Schema({
  tenantId, name: { type: String, required: true }, address: String, phone: String, isActive: { type: Boolean, default: true },
}, opts));

const ServiceArea = mongoose.model('ServiceArea', new Schema({
  tenantId, city: { type: String, required: true, trim: true }, name: { type: String, required: true, trim: true },
  branchId: { type: oid, ref: 'Branch', default: null },
  deliveryFee: { type: Number, default: 0, min: 0 }, minOrder: { type: Number, default: 0, min: 0 }, isActive: { type: Boolean, default: true },
}, opts));

const ORDER_STATUSES = ['new', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
const orderSchema = new Schema({
  tenantId,
  number: { type: String, index: true },
  source: { type: String, enum: ['online', 'pos'], default: 'online' },
  branchId: { type: oid, ref: 'Branch', default: null },
  orderType: { type: String, enum: ['delivery', 'pickup', 'dine_in'], default: 'delivery' },
  city: String, area: String, areaId: { type: oid, ref: 'ServiceArea', default: null },
  customer: { title: String, name: String, phone: String, altPhone: String, address: String, landmark: String, email: String, note: String },
  instructions: String, changeFor: Number,
  gift: { isGift: Boolean, recipientName: String, recipientPhone: String, message: String },
  items: [{ itemId: oid, name: String, price: Number, discountPercent: Number, unitPrice: Number, qty: Number, note: String }],
  subtotal: Number, discount: Number, tax: { type: Number, default: 0 }, deliveryFee: { type: Number, default: 0 }, total: Number, // total = what the customer pays
  riderId: { type: oid, ref: 'User', default: null, index: true },
  history: [{ status: String, at: { type: Date, default: Date.now }, by: String, _id: false }],
  status: { type: String, enum: ORDER_STATUSES, default: 'new', index: true },
  paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  paymentMethod: { type: String, enum: ['cash', 'card', 'online', 'cod'], default: 'cod' },
  createdBy: { type: oid, ref: 'User' },
}, opts);
orderSchema.index({ tenantId: 1, createdAt: -1 });
const Order = mongoose.model('Order', orderSchema);

const PlatformSetting = mongoose.model('PlatformSetting', new Schema({ key: { type: String, unique: true }, value: Schema.Types.Mixed }, opts));

module.exports = { ServiceArea, Branch, Order, PlatformSetting, Tenant, User, Role, Template, Page, MenuCategory, MenuItem, Media, Message, AuditLog, Session, Visit };
