# Van Sales ERP — Enterprise Van Sales & Distribution PWA

Multi-tenant, offline-capable Van Sales / FMCG distribution platform.
React + TypeScript + Tailwind + Supabase.

## Status: Foundation + Inventory/Warehouse + Van Loading/Unloading + Sales/POS + Collections/Returns + Route Planning/Customer Visits + Purchases/Accounting + Reports/Dashboards + full SaaS platform admin

**Foundation (this phase):**
- Full multi-tenant Postgres/Supabase schema (companies, roles/permissions,
  users, products, warehouses, vans, stock, batches, customers, routes,
  sales, payments, collections, returns, purchases, accounting, GPS,
  notifications) — 7 migration files, ~50 tables, RLS on every tenant table.
- Transactional RPC functions for every stock/money-affecting action
  (van loading/unloading approval, sale processing, collections, stock
  adjustments, warehouse transfers) — atomic, no partial-write states.
- Auth: Supabase Auth + a company-scoped RBAC layer with 10 system roles
  and a module:action permission grid (17 modules × 6 actions).
- App shell: responsive sidebar (nav items filtered by the signed-in
  user's permissions), topbar, dark mode, dashboard KPIs.
- **Fully working module: Inventory & Warehouse** — products (full CRUD,
  validation, pricing tiers, batch/expiry/serial toggles), categories/
  brands/units/suppliers, warehouses, live stock-by-batch view with
  expiry alerts, and a stock count/damage/loss adjustment workflow with
  an approval step that atomically updates stock via the RPC layer.
- **Fully working module: Van Loading & Unloading** — van fleet CRUD
  (driver/salesman assignment, home warehouse); loading sheets built from
  live warehouse stock with over-stock validation, approved atomically via
  `approve_van_loading` (warehouse → van); unloading sheets that split
  returned van stock into remaining/customer-return (back to warehouse)
  vs damaged/expired (written off), approved via `approve_van_unloading`.
- **Fully working module: Sales / POS** — barcode/name search against
  live van stock, cart with per-line discount and free-item support,
  multi-method split payments, cash/credit/POS sale types, customer
  quick-add. The entire sale (header + items + payments + stock
  deduction + customer balance) is created by a single atomic
  `create_sale` Postgres function — either the whole thing commits or
  none of it does. Offline-first: if the network is down, the sale is
  queued in IndexedDB (Dexie) and auto-synced (idempotently, via a
  client-generated UUID) the moment connectivity returns.
- **Fully working module: Collections & Returns** — outstanding customer
  ledger with one-click receipt recording (cash/card/bank/cheque/PDC),
  optionally applied against a specific open invoice, via the
  `record_collection` RPC. Returns cover sales returns (restocks a
  warehouse or van and credits the customer via `approve_return`) and
  purchase returns (de-stocks a warehouse being sent back to a
  supplier) — both atomic and logged to `stock_movements`.
- **Fully working module: Route Planning & Customer Visits** — routes
  with an assigned van/salesman and a sequenced customer list; "Start
  today's visits" bulk-creates the day's planned stops from that
  sequence; GPS-verified check-in/check-out (via the browser
  Geolocation API, degrading gracefully with a warning toast if location
  access is denied) with visit notes and a missed-visit path.
- **Fully working module: Purchases & Accounting** — purchase orders with
  line items; goods receipts (standalone or against an open PO, with
  batch/expiry capture) that atomically increase warehouse stock via a
  new `receive_goods` RPC, auto-creating batch records and rolling the
  PO's status to partially/fully received; expense tracking; and a
  computed Profit & Loss summary (revenue, discounts, estimated COGS,
  operating expenses, net) over any date range.
- PWA: installable, offline-caches Supabase REST reads, auto-updates.
- **Company registration** is a full SaaS-style onboarding form —
  company profile (phone, address, currency, tax number) and admin
  account together in one step, with a graceful "check your email"
  state if email confirmation is required by your Supabase Auth
  settings.
- **Self-service registration is closed.** `/register` only works to
  bootstrap your own first account — the moment any platform admin
  exists, it closes to everyone else (enforced server-side, not just a
  hidden link). Every company after that is created by you, from
  `/platform-admin`, instantly active.
- **The platform admin console has its own separate login** at
  `/platform-admin/login` — a distinct screen from the tenant company
  login, on its own URL, that verifies the platform-admin flag after a
  real Supabase Auth sign-in and immediately signs out anyone who isn't
  one (never dropping a non-admin into the console or into another
  company's data).
- **Company Settings** (tenant-side, not platform admin): every company
  can now edit its own profile — name, legal name, phone, email,
  address, currency, tax/VAT number, and default tax rate — from
  Settings in the sidebar. Requires `settings:edit` (Company Admin has
  it by default); other roles see the same page read-only. These fields
  can be set once at creation (via `/register` or the platform admin's
  "New company"), but don't have to be final — the company edits them
  going forward from here.
- **Platform Admin console** now mirrors the salon SaaS master console's
  workflow — a real sidebar app (Dashboard, Companies, Branches, Staff
  Accounts) instead of one flat page:
  - **Dashboard**: cross-tenant KPIs (total/active/pending companies,
    total branches, total staff, total products).
  - **Companies**: the approve/suspend/new-company flow from before.
  - **Branches**: every warehouse across every company in one table,
    with an **Add Branch** button that lets you create a branch for any
    company directly — no need to log into that tenant — via a new
    `create_branch_for_company()` RPC (platform-admin-gated, same
    pattern as every other privileged RPC in this app).
  - **Staff Accounts**: every staff member across every company, for
    oversight (read-only — editing staff still happens inside each
    company).
- **Store ID**: every company gets a short, unique ID (e.g. `VS-3F9A2B`)
  generated automatically at creation — shown in the sidebar, Company
  Settings, the Platform Admin console, and the "New company" handoff
  screen. It's also one of the three fields used at login (see below).
  It can also be **customized** — both `/register` and "New company" have
  an optional Store ID field with live availability checking, so you can
  set something memorable (e.g. `MAIN-BRANCH`) instead of the random
  default.
- **Store ID + Username login, no email anywhere.** Every company gets a
  unique Store ID (e.g. `VS-3F9A2B`); staff sign in with **Store ID +
  Username + Password**. Usernames only need to be unique *within* a
  store, not across the platform, so two different companies can both
  have a "manager" login. Registration and the Platform Admin's "New
  company" form never ask for an email at all — Supabase Auth still
  needs an email-shaped string internally (that's what actually enforces
  per-company data isolation via RLS), so the client generates an
  invisible, unique placeholder at signup time that nobody ever sees.
  **Important:** since there's no real inbox behind that placeholder,
  your Supabase project must have "Confirm email" turned OFF
  (Authentication → Providers → Email) — otherwise new accounts get
  stuck waiting on a confirmation email that can never arrive.

- **Fully working module: Reports & Dashboards** — a date-range picker
  driving a sales trend chart (lazy-loaded, so recharts doesn't bloat
  the main bundle for people who never open Reports), top products, top
  customers, salesman performance, low-stock alerts, and a 30-day
  expiry-risk table — covering the report list from the original spec
  as filtered views over data that already exists (sales, sale_items,
  warehouse_stock, batches).

- **Fully working module: Payments** (supplier-side) — mirrors
  Collections on the AR side: `suppliers.outstanding_payable` is
  increased automatically by `receive_goods()` (the cost of what you
  just received), and a `pay_supplier()` RPC atomically records a
  payment and reduces it. Payments page shows every supplier with a
  balance due, a Pay flow, and payment history.
- **Fully working: PDT hardware layer**
  - **Barcode scanning** — camera-based (browser `BarcodeDetector` API),
    works on any device with a rear camera and Chrome/Edge, no native
    app needed. Wired into POS: tap the scan icon next to product
    search, point at a barcode, it adds straight to the cart. Falls
    back to a clear "type it instead" message on unsupported browsers
    (Safari/iOS, Firefox).
  - **Thermal receipt printing** — `src/lib/escpos.ts` builds real
    ESC/POS byte commands (58mm/80mm) for a formatted receipt;
    `src/lib/bluetoothPrint.ts` sends them over Web Bluetooth to a
    paired thermal printer. An A4 browser-print fallback (no pairing
    needed) is always available alongside it from Sales History →
    any invoice.
  - **Live GPS tracking** — a driver/salesman can toggle "Share my
    location" for their assigned van; position uploads are throttled to
    ~1 per 15 seconds via `watchPosition`, updating both `vans` (latest
    position) and `gps_logs` (full trail). The GPS Tracking page shows
    every van's last-known position with a live indicator and a
    one-tap Google Maps link.

- **Fully working: HR** — Staff Accounts within a company: add a new
  staff login (same ephemeral-client pattern as Platform Admin's "New
  company," so it never hijacks the creating admin's own session),
  assign any of the 10 roles, deactivate/reactivate, and a one-time
  credential handoff screen with Username + Password to give the new
  hire (they'll also need the company's Store ID to sign in).

Every module from the original spec is now built.

**Recent additions from the enterprise requirements pass:**
- **CSV export** on every major data table (Sales History, all five
  Reports tables, Collections, Payments, Products, Warehouse Stock) —
  one generic `exportFilename` prop on the shared `DataTable` component,
  so it's trivial to add to any future table too.
- **A real Dashboard** — `dashboard_stats()` aggregates today/month/year
  sales, cash vs. credit collected today, outstanding receivables/
  payables, warehouse + van stock value, low-stock/expiry counts, a
  pending-approvals queue across loading/unloading/adjustments/returns,
  today's loading/unloading/visit status with route-completion %, live
  van count, and returns/damages this month — all in one server-side
  call. Below that, a "This Month's Leaders" section reuses the Reports
  aggregation logic for top products/customers/salesmen/vans.

**Honestly still not built**, from the exhaustive enterprise spec —
flagging these rather than pretending they're covered:
- Full double-entry accounting (chart of accounts CRUD, journal entries,
  general/customer/supplier ledgers, trial balance, balance sheet, fixed
  assets/depreciation, payment/receipt/contra vouchers) — Accounting
  currently has a computed P&L summary and expense tracking, not a real
  ledger system.
- A generalized multi-level approval chain (Salesman → Supervisor →
  Manager → Accounts → Admin) — each transaction type currently has its
  own single-step approve/reject, not a configurable chain.
- 2FA, session management, login history, device registration
  enforcement (the columns exist on `app_users`, nothing reads/writes
  them yet).
- PDF/Excel export (CSV is done; PDF/XLSX would add real bundle weight
  — worth doing only for whichever specific reports you actually hand
  to clients/auditors).
- A populated Notifications system (table exists; nothing generates
  stock/expiry/approval notifications yet, and there's no inbox UI).
- Product Variants and Serial Number UI (schema exists, no screens).
- Scheme/Promotion-based automatic discounting at POS (manual per-line
  discount and free-item checkbox exist; no rule engine).
- Attendance/leave/payroll, employee documents, sales targets/incentives
  (need new tables — HR currently covers accounts/roles only).

**User Management Phase 1** (from your enterprise requirements doc):
- **Change Password** — Settings → Security, self-service.
- **Sessions** — "Sign out of all devices" (`supabase.auth.signOut({scope:'global'})`)
  invalidates every active session for the account, not just this one.
- **Login History** — every sign-in attempt (success and failure, with a
  device label) is logged via `log_login_attempt()`; viewable at
  Settings → Login History (`hr:edit` only).
- **Device registration** — `register_device()` records a persistent
  per-browser device ID and timestamp on `app_users` at successful login
  (shown on the Security tab as "this device").
- **Roles & Permissions editor** — Settings → Roles & Permissions: pick
  any of your company's roles (except `company_admin`/`super_admin`,
  which always keep full access so a company can never lock itself out)
  and toggle exactly which of the 17 modules × 6 actions it can do.
  Previously these grants were fixed at company creation and read-only.

**What's genuinely not possible with this architecture, explained rather
than glossed over:**
- **Self-service "Forgot Password" over email** — the login design (Store
  ID + Username + Password, no email collected anywhere) means every
  account's actual Supabase Auth email is an invisible placeholder
  nobody can read mail at. Supabase can only send a reset link to the
  address on file, so it would silently go nowhere. The workable
  alternative is **Change Password** (built above, for anyone still able
  to log in) — a true "I forgot and I'm locked out" recovery would need
  either (a) reintroducing a real, reachable email per account, which
  conflicts with the no-email login you asked for, or (b) a backend
  service (Supabase Edge Function with the service-role key) that can
  administratively reset a password without needing the old one — real
  infrastructure this project doesn't have yet.
- **Multiple roles per user** — `app_users` has a single `role_id`.
  Supporting several roles per person is a real schema change (a
  many-to-many `user_roles` join table) that also touches every
  permission check in the app (`current_role_code()`, `has_permission()`)
  — worth doing deliberately as its own pass, not folded in here.
- **Account lock/unlock** as a distinct concept from active/inactive
  isn't separately modeled — deactivating a Staff Account already
  prevents login, which covers the same practical need.

**Inventory Phase 2** (from your enterprise requirements doc) — every
item on the list is now built:
- **Stock Transfers** (Warehouse → Stock Transfers tab) — the atomic
  backend (`warehouse_transfers` + `approve_warehouse_transfer`) existed
  since Phase 1 but had no page; built now.
- **Warehouse Locations** (Warehouse → Locations tab) — Zone/Rack/Shelf/
  Bin CRUD with a generated location code, assignable to any warehouse
  stock row from the Stock page.
- **Product Variants** (Inventory → Products → Layers icon per row) —
  name, SKU suffix, price adjustment, barcode, image URL, plus a
  per-warehouse variant stock counter with its own adjust RPC. This is
  kept deliberately separate from the core `warehouse_stock`/`van_stock`
  tables and their FIFO/batch movement engine rather than threading
  `variant_id` through every existing stock RPC (loading, sales,
  adjustments, transfers, receiving) — that would be a much larger,
  riskier change to already-working code. Variant stock here is a
  simple counter; it doesn't get batch/expiry tracking or FIFO
  allocation the way plain product stock does.
- **Serial Number Management** (Inventory → Serial Numbers tab) —
  register serials with a warranty period, exact-match search showing
  full history (product, status, customer, invoice, sold-at), mark
  damaged/lost. `sell_serial()` stamps warranty expiry and links the
  sale/customer at time of sale (not yet called from the POS checkout
  flow itself — that wiring, linking a specific serial to a specific
  sale at checkout, is the one piece of this still worth doing next if
  you sell serialized items through the van).
- **Barcode/QR Label Printing** (Inventory → Label Printing tab) — a
  real Code 39 barcode encoder (self-contained, no dependency) and QR
  generation, in 58mm/80mm thermal-roll or A4 3-across sheet templates,
  for both **Product Labels** and **Batch Labels** (batch # + expiry).
  Printed via the browser's own print dialog — the standard approach
  for label printers (driver-based), unlike receipt printers which
  commonly talk raw Bluetooth ESC/POS.
- **Excel Import/Export** (alongside CSV, which was already done) —
  `excelIO.ts` via SheetJS; every table's Export button now offers both
  CSV and Excel, and product import accepts `.xlsx`/`.xls` alongside
  `.csv`. The `xlsx` library is genuinely heavy (~425KB) and is
  dynamically imported only at the moment it's actually used, so it
  never loads for anyone who doesn't touch that feature.
- **FIFO Enforcement / Automatic Batch Selection / Expiry Priority /
  Stock Allocation Engine** — `allocate_stock_fifo()` picks batches
  oldest-expiry-first (falling back to oldest-created for non-expiry
  stock) to satisfy a requested quantity. Wired into: **Van Loading**
  (an "Auto-add by quantity (FIFO)" section that splits a requested
  quantity across batches automatically, alongside the existing manual
  exact-batch picker for anyone who wants to override it) and **POS**
  (search results are sorted oldest-batch-first, so the default
  Enter-to-add action naturally sells expiring stock before fresher
  stock, without removing the salesperson's ability to see and choose
  a different batch if they need to).

Still not covered from the broader Phase 2 wishlist, and genuinely just
cosmetic/organizational rather than functionally blocking anything:
warehouse types/capacity/manager assignment, supplier ratings, brand
logos/country/website, category images/icons/sort order.

## Live deployment

- **GitHub Pages:** https://navarshabeer768-arch.github.io/vansales-erp-pwa/
  — deploys automatically on every push to `main` via
  `.github/workflows/deploy.yml`, using the `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` repository secrets. GitHub Pages has no
  server, so this build uses `HashRouter` (`VITE_USE_HASH_ROUTER=true`)
  and a `/vansales-erp-pwa/` base path (`GITHUB_PAGES=true`) — both are
  build-time env flags set only in the workflow, so a normal
  `npm run dev`/`npm run build` locally still uses clean URLs at `/`.
- **Netlify / Vercel:** `netlify.toml` and `vercel.json` are included
  with SPA rewrite rules for clean, server-rewritten URLs (recommended
  once you're off GitHub Pages, since it also plays nicer with
  Supabase's auth-callback URL hash than `HashRouter` does).

## Getting started

### 1. Create a Supabase project
Create a new project at supabase.com, then run the migrations in order:

```bash
# Using the Supabase CLI, from this project's root:
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file in `supabase/migrations/` into the Supabase SQL editor,
**in numeric order** (0001 → 0028). Each file is idempotent-safe to rerun
individually but the whole set must run in order once.

**Required:** in Supabase → Authentication → Providers → Email, turn
**off** "Confirm email". This app never collects a real email address
(login is Store ID + Username + Password) — Supabase Auth is given an
invisible placeholder address under the hood, and if email confirmation
is on, every new account will get stuck forever waiting for a
confirmation link that can never arrive at that address.

### 2. Configure environment
```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Supabase → Project Settings → API
```

### 3. Install and run
```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build to dist/
npm run preview   # preview the production build
```

### 4. Become the platform admin (do this once, then registration closes)

Self-service registration only exists to bootstrap **your own** first
account — the moment a platform admin exists, `/register` closes itself
to everyone else (checked server-side via `platform_has_admin()`, not
just hidden in the UI). From then on, **every new company is created by
you**, from `/platform-admin`, instantly active — no public sign-up path
at all.

The platform admin console has its **own separate login page**,
entirely distinct from the tenant company login — different URL,
different screen, and it explicitly rejects any account that isn't a
platform admin (signing them straight back out) rather than dropping
them into some other company's data.

One-time setup:
1. Visit `/register` directly (there's no link to it anywhere in the UI —
   go straight to the URL) and create your own company + account. Use
   this as your "platform owner" workspace, or your first real client —
   either works. **Note the Store ID and Username you set** — you'll
   need both in step 4.
2. In the Supabase dashboard, go to **Authentication → Users** and copy
   your user's UUID. (There'll be one user with an `@accounts.vansales.internal`
   placeholder address — that's it.)
3. In the SQL Editor, run:
   ```sql
   insert into platform_admins (user_id, note)
   values ('<your-user-uuid>', 'platform owner');
   ```
4. Sign in at the **platform admin login** — exact link:
   `https://navarshabeer768-arch.github.io/vansales-erp-pwa/#/platform-admin/login`
   (or `http://localhost:5173/platform-admin/login` in dev) — using just
   your **Username + Password** from step 1 (no Store ID needed here —
   that's only required on the regular company login, since platform
   admins are a small curated list, not thousands of per-store staff).
   Bookmark this; it's never linked from anywhere in the tenant app.
   `/register` is now closed for everyone but you'll never need it again.

From here on, click **"New company"** inside `/platform-admin` to create
every future tenant: it creates their login, bootstraps the company, and
auto-approves it in one step, then shows you a one-time password to hand
off. That signup happens through a throwaway Supabase client with no
session persistence, so it never touches your own signed-in session.

Being a platform admin bypasses the pending-approval screen for your own
account so you're never locked out of `/platform-admin`, but it does
**not** grant tenant-level permissions inside any company's data — those
still come from the roles/permissions system.

### 5. Setting up a company's data (yours or any client's)

Once a company exists (via your one-time `/register` bootstrap, or via
"New company" in `/platform-admin` for every company after that) and is
active, log in as that company and:

1. Inventory → Catalog settings: add at least one **Unit** (e.g. Piece/PC).
2. Warehouse → New warehouse.
3. Inventory → New product.
4. Warehouse → (your warehouse) → Stock adjustments → New adjustment
   → type **Correction** → add your opening stock quantities → submit
   → Approve. This is how you seed opening stock; there's deliberately
   no direct "set stock" button, since every stock change should leave
   an audit trail through `stock_movements`.

## Architecture notes

- **RLS everywhere.** Every business table has `company_id` and a policy
  requiring `company_id = current_company_id()`. `current_company_id()`,
  `has_permission()`, and `is_super_admin()` are `security definer`
  functions so RLS checks don't recurse into RLS-protected tables.
- **Never mutate stock tables directly from the client.** `warehouse_stock`
  and `van_stock` should only change via the RPC functions in
  `0006_transactional_functions.sql`. Each RPC validates availability,
  updates both sides of a transfer, and writes a `stock_movements` row —
  all inside one Postgres function, so it's all-or-nothing.
- **Soft-delete for master data.** Products and warehouses are deactivated
  (`is_active = false`), never hard-deleted, since sales history and
  stock movements reference them.
- **Path alias:** `@/*` → `src/*` (configured in both `tsconfig.json` for
  the type-checker and `vite.config.ts` for the bundler — both are
  required, they don't share config).
- **Types:** `src/types/database.ts` is a hand-authored subset covering
  the tables used so far. Once your schema is live, regenerate the
  authoritative version with
  `npx supabase gen types typescript --project-id <ref>` and merge in the
  domain types (joined-select shapes like `Product['category']`) from the
  current file.

## Phase 3A.2: Driver / Salesman / Route Management

Built against your enterprise requirements doc — every item on the list:

- **Driver Management** (HR → Drivers tab) — pick a driver from the list
  to see their license number/expiry, medical expiry, emergency contact,
  attendance log (mark present/absent/leave/half-day per date), and
  documents (license/medical/ID/contract/other, each with expiry and a
  file link). Assigned vehicle shows inline in the driver list.
- **Salesman Management** (HR → Salesmen tab) — assigned van and route
  shown inline; set monthly sales target, collection target, and
  commission rate per salesman; a live performance panel for the
  current month (revenue, orders, % of target) reuses the same
  aggregation as the Reports page, so the numbers are always
  consistent with what Reports shows.
- **Route Management** — routes extended with Area, Region, Priority
  (low/medium/high), Distance (km), and Estimated Time (minutes),
  alongside the existing van/salesman assignment and visit sequencing.
  Frequency now includes **Custom** alongside Daily/Weekly/Monthly.
- **Customer Routes** — each customer on a route now has its own visit
  frequency (Daily/Weekly/Monthly/Custom), settable per customer from
  the route's "Manage customers" screen — a route can mix a daily
  customer with a few weekly ones. Missed/completed visit tracking and
  history were already covered by the existing Customer Visits status
  system (`planned`/`checked_in`/`completed`/`missed`).
- **Reports** — Driver/Salesman/Route/Customer Route reporting is
  covered by the list views themselves (all exportable to CSV/Excel
  like every other table in the app) rather than separate report
  pages: the Drivers list surfaces license/medical expiry at a glance,
  the Salesmen list surfaces performance-vs-target, and Routes/route
  customers are fully exportable.

New tables: `driver_profiles`, `driver_documents`, `driver_attendance`,
`salesman_targets`. This also closes a gap flagged earlier in this
project — Employee Attendance from the original Dashboard requirements
list, which wasn't built until now.

## What's next

Every module from the original spec is built and working, including
the enterprise requirements passes (User Management, Inventory Phase 2,
and Fleet Management — see below). The only open item is the Platform
Admin / SaaS-side polish from earlier in this project's history,
whenever you're ready to revisit it. Beyond that, natural next steps if
you want to keep extending:
- Attendance/leave/payroll tables (not in the schema yet — HR currently
  covers accounts/roles, not time tracking).
- A live map view for GPS Tracking (currently a Google Maps link per
  van; an embedded map with all vans plotted together would need a
  maps API key and a small integration).
- Multi-language / RTL support for Arabic-speaking staff, if useful
  for GCC deployments.

**Phase 3A.1: Fleet Management** (from your enterprise requirements doc) —
every item on the list is built:
- **Van Management** — `vans` extended with VIN, chassis number, engine
  number, vehicle type, capacity, current odometer, purchase date, road
  permit number + expiry, registration expiry (alongside the existing
  insurance expiry), and notes. **Archive/Restore** is now a distinct
  action from Active/Inactive status — archiving fully removes a van
  from the active fleet list (not just marks it inactive), with a
  restore option in an "Archived vans" section underneath.
- **Van User Assignment** — a real `van_assignments` history table
  (driver/salesman/helper/collector, each permanent/temporary/
  replacement, with start/end dates). Assigning a new person to a role
  automatically ends whoever had it before, keeping full history rather
  than silently overwriting. `vans.driver_id`/`salesman_id` stay in sync
  automatically so existing code that reads those columns didn't need
  to change. "Only assigned users can access the van" is enforced at
  the picker level: the Van dropdown in **POS** and **Van Loading** only
  shows vans the signed-in person is actively assigned to — unless they
  hold `van_loading:approve` (managers/admins), who see the whole fleet,
  since the point is keeping salesmen/drivers scoped to their own van,
  not locking out the people who need fleet-wide oversight.
- **Vehicle Documents** — insurance/registration/permit/fitness/
  warranty/service book, each with a document number, issue/expiry
  dates, and a file link. Expiry shows a live days-remaining badge.
- **Vehicle Images** — a simple gallery per van (image URL + primary
  flag), on the van's Images tab.
- **Reports** — Van List and expiry alerts are visible directly on the
  Vans list (insurance/registration/permit badges, ≤30 days or expired);
  Assignment Report is the per-van Assignments tab's history table,
  exportable like every other table in the app.

Click any van's name from the Vans list to reach its detail page
(Assignments / Documents / Images tabs).

Each phase should follow the same pattern used so far: a typed hook per
entity, a form with `zod` validation, a `DataTable`-backed list page,
permission gates on every mutating action, and — for anything touching
stock or money — a single atomic `security definer` Postgres function
(see `create_sale` for the fullest example) rather than composing the
operation from several separate client-side calls.
