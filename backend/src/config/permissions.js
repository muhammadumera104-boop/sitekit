// Single source of truth for the permission matrix (SRS 4.2 + video script roles: Admin, Cashier, Vendor).
const R = {
  SA: 'super_admin', PS: 'platform_staff',
  TO: 'tenant_owner', TM: 'tenant_manager', TE: 'tenant_editor', TC: 'tenant_cashier', TV: 'tenant_vendor', TR: 'tenant_rider',
};
const PLATFORM_ROLES = [R.SA, R.PS];
const TENANT_ROLES = [R.TO, R.TM, R.TE, R.TC, R.TV, R.TR];
// Staff login doors on a store's public site: each door only accepts these roles.
const DOORS = { owner: [R.TO], manager: [R.TM], worker: [R.TE, R.TC, R.TV], rider: [R.TR] };
const ALL_STAFF = [R.SA, R.PS, R.TO, R.TM];

const matrix = {
  'tenant.create': [R.SA, R.PS],
  'tenant.delete': [R.SA],
  'tenant.suspend': [R.SA],
  'tenant.view': [R.SA, R.PS],
  'templates.manage': [R.SA],
  'features.manage': [R.SA],                       // global feature toggles
  'tenant.features': [R.SA, R.PS],                 // per-store feature toggles
  'tenant.changeTemplate': [R.SA, R.PS],
  'tenant.requestTemplate': [R.TO],
  'platformUsers.manage': [R.SA],
  'tenantUsers.manage': [R.SA, R.PS, R.TO],
  'settings.edit': ALL_STAFF,
  'content.manage': [...ALL_STAFF, R.TE],          // pages, gallery, preview
  'products.manage': [...ALL_STAFF, R.TE, R.TV],   // menu / products (Vendor: only their branch)
  'inventory.manage': [...ALL_STAFF, R.TV],        // stock levels
  'branches.manage': [R.SA, R.PS, R.TO, R.TM],
  'areas.manage': [R.SA, R.PS, R.TO, R.TM],        // delivery cities / areas, fees, tax
  'orders.assign': [...ALL_STAFF, R.TC],           // assign a delivery rider
  'deliveries.use': [R.TR],                        // rider: own deliveries
  'promos.manage': [R.SA, R.PS, R.TO, R.TM],
  'reviews.manage': [...ALL_STAFF],
  'customers.view': [R.SA, R.PS, R.TO, R.TM],
  'platform.settings': [R.SA],                     // platform name, maintenance, defaults
  'plans.manage': [R.SA],
  'payouts.manage': [R.SA],
  'announcements.manage': [R.SA, R.PS],
  'catalog.moderate': [R.SA, R.PS],                // hide products / reviews of any store
  'platformPromos.manage': [R.SA, R.PS],
  'orders.view': [...ALL_STAFF, R.TC],             // transactions
  'orders.manage': [...ALL_STAFF, R.TC],
  'pos.use': [...ALL_STAFF, R.TC],                 // point of sale
  'site.publish': ALL_STAFF,
  'audit.view': [R.SA, R.PS, R.TO],
  'analytics.view': ALL_STAFF,
  'messages.manage': ALL_STAFF,
};

const can = (role, perm) => !!matrix[perm] && matrix[perm].includes(role);
const permissionsFor = (role) => Object.keys(matrix).filter((p) => matrix[p].includes(role));

const RESERVED_SLUGS = ['admin', 'dashboard', 'login', 'api', 'static', '_next', 'assets', 'public', 'register', '404',
  'forgot-password', 'reset-password', 'uploads', 'favicon.ico', 'robots.txt', 'sitemap.xml'];

module.exports = { R, PLATFORM_ROLES, TENANT_ROLES, DOORS, matrix, can, permissionsFor, RESERVED_SLUGS };
