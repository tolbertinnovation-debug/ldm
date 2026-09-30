# REAP Farms — digital business platform

A complete, mobile-first platform for **REAP** (Bentol City, Montserrado County, Liberia — [reapwestafrica.org](https://www.reapwestafrica.org)): an online farm shop *and* the back office that runs the business.

Customers browse and order **live pigs, dressed pigs, pork by the pound, live fish, fingerlings, aquaponic produce, eggs, feed and other farm goods**, book **services and training**, choose **delivery or pickup**, pay with **cash, Orange Money, MTN MoMo, bank transfer or card**, and **track their order live**.

Staff get one dashboard for **orders, POS, deliveries, inventory, livestock, customers (CRM), payments, invoices, expenses, financial reports, analytics, WhatsApp/SMS/email, broadcasts, social media, ad campaigns, promotions, staff access, audit log and settings**.

> The business name, contact details, currency, prices, delivery areas and payment numbers are all editable in **Admin → Settings**. The demo data uses "REAP Farms"; if you trade under a different name (for example "RIP"), change it there. There's no code to edit.

---

## Contents

- [Feature tour](#feature-tour)
- [Quick start (local)](#quick-start-local)
- [Demo logins](#demo-logins)
- [Deploying](#deploying)
- [Connecting WhatsApp, SMS, email, payments & social](#connecting-services)
- [Security](#security)
- [Architecture](#architecture)
- [Testing](#testing)
- [Project layout](#project-layout)

---

## Feature tour

### Customer shop (`/`), built for phones and slow networks
| | |
|---|---|
| **Catalog** | Categories, search, sorting, sale prices, stock badges, product options (e.g. *Slaughter & clean +$20*, *Smoked*, *Halved*), prices in USD with an optional ≈ L$ line |
| **Sold by weight** | Meat and fish are ordered by estimated lb/kg in configurable steps; staff enter the actual weight and the order re-totals |
| **Cart & checkout** | Guest or account checkout, delivery areas with fees and free-over thresholds, landmark-based addresses plus an optional GPS pin, pickup locations, date and time slots, promo codes, WhatsApp/SMS opt-in |
| **Payments** | Cash on delivery or at pickup; Orange Money / MoMo transfer with a transaction ID (verified by staff); **MTN MoMo API** push prompt; **Flutterwave** card checkout; bank transfer |
| **Order tracking** | Live timeline, driver name and phone, the **driver's live map location**, pay-later with mobile money, auto-refresh. Lookup works by order number + phone, with no account needed |
| **Accounts** | Sign in with a **one-time code by WhatsApp/SMS** or a password; order history, **one-tap reorder**, saved addresses, notification and marketing preferences |
| **Services** | Slaughter & processing, pig farming and aquaponics training, installations, vet visits and farm tours, booked online |
| **PWA** | Installable app, offline page, cached assets, an offline banner and phone-side image resizing for low-bandwidth networks |

### Admin (`/admin`): everything behind the counter
| Area | Highlights |
|---|---|
| **Dashboard** | Today's to-do list (orders to confirm, deliveries without a driver, payments to verify, bookings, unread messages, low stock), KPIs with period-over-period change, sales vs cash chart, category and best-seller breakdowns |
| **Orders** | Filters and search, status workflow with automatic customer messages, weight entry, partial payments and refunds, driver assignment, notes timeline, quick-reply messages, printable receipts, one-click invoices |
| **POS / new order** | Take WhatsApp, phone and walk-in orders fast: product grid, customer lookup, account discounts, delivery-fee override, payment on the spot |
| **Deliveries + driver app** (`/driver`) | Dispatch board; drivers get a mobile app with call/WhatsApp/map buttons, live location sharing, delivered/failed with cash collection, and self-assignment |
| **Products & inventory** | Rich editor (options builder, photos, weighed items, lead time, delivery/pickup rules), categories, stock ledger (receive, harvest, spoilage, mortality, stock counts), low-stock alerts, stock valuation |
| **Livestock & ponds** | Pig register and fish batches: weights, vaccinations and treatments, moves, *list for sale* (adds to stock), **slaughter → carcass weight into meat stock**, **harvest fish → stock**, losses |
| **Customers (CRM)** | Segments (top spenders, lapsed, repeat, businesses, opted-in), lifetime value, tags, standing discounts, consent, full conversation history, balances owed |
| **Messaging** | Unified WhatsApp/SMS/email inbox with inbound webhooks, sent log with delivery receipts, editable automatic templates, STOP opt-out handling |
| **Broadcasts** | Segmented campaigns (type, tags, recency, spend, bought-from-category), live recipient count, SMS segment counter, schedule or send now; opt-in only |
| **Ad campaigns** | Facebook, Instagram, radio, flyers, WhatsApp and more: budget and daily spend, reach and clicks, **UTM tracking links**, offline promo-code attribution, **ROAS and cost per order** |
| **Promotions** | Percent, fixed or free-delivery codes; minimum order, caps, date windows, usage and per-customer limits, first-order-only, category/product targeting |
| **Social media** | Compose once, auto-publish to **Facebook Page, Instagram and X**, schedule, or share manually to WhatsApp Status with copy and one-tap share links; tracked product links |
| **Bookkeeping** | Payments with verification queue, invoices (manual or from orders; send, print/PDF, public link), expenses by category, **P&L** (sales basis with COGS), **cash flow**, **receivables aging**, inventory value |
| **Reports & analytics** | Sales by product and category, channels, traffic sources, customer types, first-time vs returning, top customers, campaign performance, **CSV exports** (orders, payments, expenses, P&L, inventory, customers) |
| **Staff & security** | 9 roles with a visible permission matrix, **TOTP 2FA** with QR setup, account lockout, session management, and an **audit log** of sensitive actions |
| **Settings** | Business profile, currency and exchange rate, tax, order prefix, time slots, delivery areas, pickup points, payment methods, alerts, invoice terms, integration status and webhook URLs |

---

## Quick start (local)

Requirements: **Node 20.9+** (22 recommended) and **PostgreSQL 14+**.

```bash
npm install
cp .env.example .env            # set DATABASE_URL, APP_SECRET, CRON_SECRET
npm run db:migrate              # create tables
npm run db:seed                 # optional: realistic demo data
npm run dev                     # http://localhost:3000
npm run worker                  # in another terminal: sends messages, runs schedules
```

With no messaging keys, WhatsApp, SMS and email run in **log mode**: messages are stored and printed to the server console, including sign-in codes in development.

## Demo logins

After `npm run db:seed`:

| Role | Email | Password |
|---|---|---|
| Owner (everything) | `owner@reap.farm` | `ReapFarm#2026` |
| Manager / Sales / Accountant / Marketing / Farm | `manager@` · `sales@` · `accounts@` · `marketing@` · `farm@reap.farm` | `ReapStaff#2026` |
| Driver (opens `/driver`) | `driver1@reap.farm` | `ReapStaff#2026` |
| Customer | `customer@reap.farm` | `Customer#2026` |

**Change or delete these before going live.** For a real deployment, skip the seed and create your owner account with:

```bash
npm run create-admin -- --email you@reapwestafrica.org --name "Your Name" --password "a long unique password"
```

## Deploying

### Option A: Docker Compose (any VPS; recommended)
```bash
cp .env.example .env     # set APP_URL=https://shop.yourdomain, APP_SECRET, CRON_SECRET, POSTGRES_PASSWORD
docker compose up -d --build
docker compose run --rm migrate
docker compose run --rm migrate npm run create-admin -- --email you@example.org --name "You" --password "…"
```
This runs Postgres, the web app (port 3000) and the background worker. Put Caddy or nginx in front for HTTPS; HTTPS is required for secure cookies, geolocation and PWA install.

### Option B: Vercel, Render, Railway, Fly.io and similar
- Build `npm run build`; start `npm start` (or use the `standalone` output / Dockerfile).
- Use a managed Postgres and set `DATABASE_URL` (plus `DATABASE_SSL=true` if required).
- Run `npm run db:migrate` on each release.
- Background jobs: either run `npm run worker` as a separate process, **or** call `GET /api/cron/jobs` every minute with the header `Authorization: Bearer $CRON_SECRET` (for example with Vercel Cron or a cron job running curl).

Scaling: the web tier is stateless. Sessions, carts, rate limits, the job queue and uploaded images all live in Postgres, so you can run several app and worker instances behind a load balancer. Workers coordinate with `SELECT … FOR UPDATE SKIP LOCKED`.

## Connecting services

All credentials are **environment variables**; see [`.env.example`](.env.example). Admin → Settings → Integrations shows what's connected and the webhook URLs to paste into each provider.

| Service | Variables | Notes |
|---|---|---|
| **WhatsApp Cloud API** (Meta) | `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | Webhook `/api/webhooks/whatsapp` (signature-verified). Free-form messages only work within 24h of the customer's last message. |
| **Twilio** SMS / WhatsApp | `SMS_PROVIDER=twilio` and/or `WHATSAPP_PROVIDER=twilio`, `TWILIO_*` | Webhook `/api/webhooks/twilio` (signature-verified) |
| **Africa's Talking** SMS | `SMS_PROVIDER=africastalking`, `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`, `INBOUND_WEBHOOK_TOKEN` | Webhook `/api/webhooks/africastalking?token=…` |
| **Email** | `EMAIL_PROVIDER=smtp` (+`SMTP_*`) or `resend` (+`RESEND_API_KEY`), `EMAIL_FROM` | Branded HTML with a List-Unsubscribe header |
| **MTN MoMo** Collections | `MTN_MOMO_*` | Push payment prompt; status is polled by the worker and confirmed server-side |
| **Flutterwave** (cards) | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | Hosted checkout; every payment is re-verified with the API |
| **Orange Money** | Admin → Settings → Payments | Customers pay your merchant number and submit the transaction ID; staff confirm in **Payments → To verify** |
| **Facebook / Instagram** | `META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `META_IG_USER_ID` | Auto-publishing; Instagram needs an image |
| **X** | `X_ACCESS_TOKEN` | OAuth 2.0 user token with `tweet.write` |

## Security

- **Authentication:** scrypt password hashing (OWASP parameters); opaque session tokens stored only as SHA-256 hashes; `HttpOnly`, `Secure`, `SameSite=Lax` and `__Host-` cookies in production; sliding expiry.
- **Two-factor (TOTP)** for staff, with secrets encrypted at rest (AES-256-GCM). Phone-code login is limited to customers.
- **Brute-force protection:** Postgres-backed rate limits on sign-in, codes, checkout, promo codes, order lookup and uploads; account lockout after repeated failures.
- **Authorization:** role-based permissions checked on **every** server action and API route, not just hidden in the UI. Drivers only see their own deliveries.
- **Headers:** a strict nonce-based **Content-Security-Policy** (`strict-dynamic`, `frame-ancestors 'none'`), HSTS, `nosniff`, a restrictive Permissions-Policy and COOP.
- **Input handling:** Zod validation on every action; parameterized SQL (Drizzle); prices and discounts always recomputed server-side; uploads checked by magic bytes and size; CSV exports defused against formula injection.
- **Webhooks:** Twilio and Meta signatures verified; payment callbacks are never trusted and always re-checked against the provider API; idempotent processing.
- **Audit log** of sign-ins, price changes, payments, refunds, stock adjustments, exports, settings and staff changes.
- **Privacy:** marketing goes only to opted-in customers; STOP replies and unsubscribe links are honoured automatically.

## Architecture

```
Next.js 16 (App Router, React 19, Server Components + Server Actions)
 ├─ src/app/(shop)       customer storefront (PWA)
 ├─ src/app/(auth)       sign-in (password, phone code, 2FA), registration
 ├─ src/app/admin        back office (RBAC-guarded)
 ├─ src/app/driver       driver mobile app
 ├─ src/app/api          webhooks, cron, exports, uploads, health
 ├─ src/lib/services     domain logic: orders, payments, inventory, invoices, analytics, cart, audience
 ├─ src/lib/pricing.ts   pure pricing/promotions engine (unit-tested)
 ├─ src/lib/messaging    providers (Twilio, Africa's Talking, Meta, SMTP, Resend), templates, inbox
 ├─ src/lib/jobs         Postgres job queue (transactional outbox, retries with backoff)
 └─ src/lib/db           Drizzle schema + migrations (PostgreSQL)
```

- **Money** is stored as integer cents; quantities as `numeric(12,3)`; weighed-item totals use exact integer maths.
- **Stock** changes are row-locked (`SELECT … FOR UPDATE`) and written to an append-only movement ledger, so orders cannot oversell under concurrency.
- **Messages and social posts** go through the job queue: written in the same transaction as the order, sent right after the response, and retried by the worker if a provider is down.
- **Images** are stored in Postgres, pre-resized on the uploader's phone, and served with immutable caching. Any instance can serve them without shared disk.

## Testing

```bash
npm run lint
npm run typecheck
npm test                 # unit + integration (uses TEST_DATABASE_URL, default …/reap_test)
npm run test:e2e         # Playwright: phone + desktop, customer, staff, driver & security flows (needs seeded DB)
```

CI (GitHub Actions) runs all of the above against a fresh Postgres on every push and pull request.

## Project layout

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for day-to-day workflows: taking phone orders, weighing meat, verifying mobile money, dispatching drivers, month-end reports and backups.
