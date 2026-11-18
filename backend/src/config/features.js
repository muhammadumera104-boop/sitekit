// Feature toggles: a feature can be switched off globally (platform-wide kill switch) or per store.
// effective = globalEnabled && (store override ?? template default)
const FEATURES = {
  cart: { label: 'Add to cart', description: 'Visitors can add items to a cart and check out.', defaults: { store: true, restaurant: true } },
  discounts: { label: 'Discounts', description: 'Show sale prices / % off badges and "Add to cart with discount".', defaults: { store: true, restaurant: true } },
  onlineOrders: { label: 'Online orders', description: 'Checkout creates a real order the staff can manage (otherwise it is sent as a message).', defaults: { store: true, restaurant: true } },
  search: { label: 'Product search', description: 'Search box and category filter on the catalog.', defaults: { store: true, restaurant: true } },
  locations: { label: 'Delivery locations', description: 'Visitors pick their city and area first; delivery fee and minimum order follow the area.', defaults: { store: true, restaurant: true } },
  pickup: { label: 'Pickup orders', description: 'Let customers choose pickup instead of delivery at checkout.', defaults: { store: true, restaurant: true } },
  orderTracking: { label: 'Order tracking', description: 'Customers can follow their order status with the order number and phone.', defaults: { store: true, restaurant: true } },
  complaints: { label: 'Complaint form', description: 'A page where customers can submit a complaint.', defaults: { store: true, restaurant: true } },
  gallery: { label: 'Photo gallery', description: 'Gallery section and page.', defaults: { store: true, restaurant: true } },
  contactForm: { label: 'Contact form', description: 'Contact form that stores messages for the business.', defaults: { store: true, restaurant: true } },
  whatsappButton: { label: 'WhatsApp button', description: 'Floating WhatsApp chat button (needs a WhatsApp number).', defaults: { store: true, restaurant: true } },
  inventory: { label: 'Inventory tracking', description: 'Track stock levels, show "low stock / sold out" and block overselling.', defaults: { store: true, restaurant: false } },
  pos: { label: 'Point of sale', description: 'Cashier POS screen in the dashboard.', defaults: { store: true, restaurant: true } },
};

const keys = Object.keys(FEATURES);

// globals: { key: boolean } (missing = enabled). overrides: tenant.features (missing = template default).
function effectiveFeatures(templateKey, globals = {}, overrides = {}) {
  const out = {};
  for (const k of keys) {
    const def = FEATURES[k].defaults[templateKey] ?? FEATURES[k].defaults.restaurant;
    const own = overrides && overrides[k] !== undefined && overrides[k] !== null ? !!overrides[k] : def;
    out[k] = globals[k] !== false && own;
  }
  return out;
}

module.exports = { FEATURES, keys, effectiveFeatures };
