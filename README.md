# SiteForge – Multi-Tenant Website Platform

Built from `SRS_Multi_Tenant_Website_Platform.docx`. One codebase serves many customer websites.

- **frontend/** – Next.js 14 (public tenant sites, Admin Portal, Tenant Dashboard)
- **backend/** – Node.js + Express API, MongoDB Atlas via Mongoose

## Run it

```powershell
# 1) API  (http://localhost:5000)
cd backend
npm install
npm run seed        # creates the 4 example tenants + accounts (add -- --reset to wipe first)
npm run dev

# 2) Web  (http://localhost:3000)
cd frontend
npm install
npm run dev
```

Config lives in `backend/.env` (already filled with your Atlas URI and generated JWT secrets) and `frontend/.env.local`.

## Separate doors (nothing is listed in one place)

| Who | Address | Login |
|---|---|---|
| Platform team (Super Admin / Staff) | /admin | /login (platform accounts only) |
| Kababjees | /kababjees | /kababjees/login -> /dashboard/kababjees |
| United King | /unitedking | /unitedking/login -> /dashboard/unitedking |
| Foodin | /foodin | /foodin/login -> /dashboard/foodin |
| Kravemart | /kravemart | /kravemart/login -> /dashboard/kravemart |

- The home page (/) never lists customer websites, and there is no API that lists tenants.
- Each login page accepts only its own people. A business owner who tries /login, or another business's login, gets the same "Invalid email or password" message.

## Accounts

- **Super Admin / Platform Staff:** secret random passwords in `backend/.env` (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD, STAFF_*). Keep that file private. To change a password, edit it and run `npm run seed -- --reset` (this also resets demo data).
- **Demo business accounts:** `owner@`, `manager@`, `editor@`, `cashier@` and `vendor@<slug>.test` use SEED_PASSWORD. Change before going live.
- Re-running `npm run seed` (without `--reset`) is safe: it tops up branches, cashier/vendor accounts and demo discounts/stock on existing stores.

## Roles (RBAC)

| Role | Can do |
|---|---|
| Super Admin / Platform Staff | Provision stores, per-store feature toggles (Super Admin also: global toggles, suspend/delete) |
| Owner / Manager | Everything inside their store: content, products, orders, POS, inventory, branches, team |
| Editor | Pages, media, products |
| **Cashier** | Point of sale + orders (only their branch, if one is assigned) |
| **Vendor** | Products and stock of **their own branch only** (must be assigned to a branch) |

## Feature toggles

Admin Portal -> **Feature toggles** (global kill switch, Super Admin) and Tenants -> *store* -> **Feature toggles for this store** (Default / Always on / Always off).
Effective value = global switch AND (store override, else template default). Features: cart, discounts ("Add to cart with discount"), online orders, search, gallery, contact form, WhatsApp button, inventory, point of sale. The public site, dashboard menu and API all follow the toggles.

## Ordering (delivery-site flow)

Customer: pick **city -> area** (header shows "Delivering to ...") -> add items (special instructions per item) -> cart with **tax + delivery fee** -> guest checkout (delivery or pickup, landmark, alternate phone, gift, change request, cash on delivery) -> **/{slug}/track** with order number + phone. Also `/{slug}/complaint` and `/{slug}/locations`.
Owner/Manager: Dashboard -> **Delivery areas** (cities, areas, fees, minimum order, branch, tax %, ETA). Orders flow `new -> confirmed -> preparing -> ready -> out for delivery -> delivered` (pickup/POS end at `completed`); assign a **rider** on the order.
**Staff login button** on every store site -> role chooser: Owner, Manager, Worker (cashier/vendor/editor), Delivery Rider. Each door only accepts its own roles; the rider lands on *My deliveries* and only sees orders assigned to them.
Demo accounts per store: `owner@`, `manager@`, `editor@`, `cashier@`, `vendor@`, `rider@<slug>.test`. Online card payments are not built (cash on delivery / pay at pickup only).

## Commerce

- **Online checkout:** `POST /api/public/tenants/:slug/orders` (cash on delivery). Prices and stock are always computed on the server.
- **Dashboard:** Orders (status flow, mark paid, cancel returns stock), Point of sale, Inventory, Branches.

## Data sources

Kravemart: logo, colours, tagline, cities, support email, address and social links from kravemart.com. United King: name, tagline, phone, head-office address and history from public sources. Kababjees: menu items and Do Darya location from public listings. Foodin: no official site could be found, so it holds sample content. Prices and anything not confirmed publicly are sample data for the owner to replace.

## Architecture notes

- **Tenant resolver** – `/{slug}` → `GET /api/public/tenants/:slug`. Isolated in `backend/src/routes/public.js#resolveTenant` so it can later become subdomain/custom-domain lookup.
- **Isolation** – shared collections, `tenantId` on every tenant-owned document (logical isolation per store; the same pattern as a collection per store, but one codebase/index set to maintain). `/api/tenant/*` derives `tenantId` from the logged-in user (never from the request body). Platform users act on a tenant via `X-Tenant-Slug`, and each use is written to the audit log (impersonation).
- **RBAC** – single permission matrix in `backend/src/config/permissions.js`; the UI receives the user's permission list from `/api/auth/me`.
- **Auth** – bcrypt, 15-min JWT access token, rotating refresh token in an HTTP-only cookie, lockout after 5 failed logins, password reset/invite links.
- **Templates** – `restaurant` and `store` (with cart). Defined in code (`backend/src/services/templates.js`, `frontend/components/site/`) and registered in the `templates` collection.
- **Images** – Cloudinary when configured, otherwise saved to `backend/uploads`.
- **Email** – SMTP when configured, otherwise printed to the API console (invite / reset links).
- **Soft delete** – deleting a tenant sets `status=deleted` and can be restored.

## Tests

```powershell
cd backend
npm run dev     # in one terminal (needs SUPER_ADMIN_* in .env)
npm test        # in another – tenant isolation, RBAC, reserved slugs, suspension
```

## Not built yet (SRS "phase 2 / optional")

Custom role editor (FR-R3), online *payments* (checkout is cash on delivery), multi-language (FR-W10), the Flutter mobile app from the video script.
