# API reference

Base URL `http://localhost:5000/api` (the Next.js app proxies `/api/*`). Auth: `Authorization: Bearer <accessToken>`.
Errors are `{ message, errors?, code? }` with status 400 (validation), 401, 403, 404, 409, 423 (locked), 429.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{email,password}` → `{accessToken,user}`; sets HTTP-only `rt` cookie |
| POST | `/auth/refresh` | rotates the refresh cookie |
| POST | `/auth/logout` | |
| GET | `/auth/me` | user + permission list |
| POST | `/auth/forgot-password` | `{email}` (never reveals if it exists) |
| POST | `/auth/reset-password` | `{token,password}`; also activates invited users |
| POST | `/auth/access-denied` | UI reports a blocked page so it is audited |

## Public (no auth)
| Method | Path |
|---|---|
| GET | `/public/tenants` – live sites |
| GET | `/public/tenants/:slug` – config + menu + pages + gallery (404 unknown, 403 `SUSPENDED`/`DRAFT`, 404 `MOVED` → new slug in `message`) |
| GET | `/public/tenants/:slug/menu` |
| GET | `/public/tenants/:slug/pages/:page` |
| POST | `/public/tenants/:slug/contact` – rate limited |
| POST | `/public/tenants/:slug/visit` |

## Admin (`/admin/*`, platform roles only)
`GET /stats` · `GET|POST /tenants` · `GET /tenants/check-slug?slug=` · `GET|PUT|DELETE /tenants/:id` ·
`PATCH /tenants/:id/status` · `POST /tenants/:id/impersonate` · `GET|POST /templates` · `PUT /templates/:id` ·
`GET|POST /users` · `PUT|DELETE /users/:id` · `GET /audit` · `POST /upload`

## Tenant (`/tenant/*`; tenant from the token, platform users send `X-Tenant-Slug`)
`GET /me` · `GET|PUT /settings` · `POST /publish` · `GET /preview` · `POST /template-request` ·
`GET /menu` · `POST|PUT|DELETE /menu/categories[/:id]` · `POST|PUT|DELETE /menu/items[/:id]` · `POST /menu/import` ·
`GET|POST|PUT|DELETE /pages[/:id]` · `GET|POST /media` · `PATCH|DELETE /media/:id` ·
`GET /messages` · `PATCH /messages/:id` · `GET|POST|PUT|DELETE /users[/:id]` · `GET /audit` · `GET /analytics`

Permissions per role: `backend/src/config/permissions.js`.
