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
**in numeric order** (0001 → 0057). Each file is idempotent-safe to rerun
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

## Architecture correction: flexible Van Staff Assignment

Phase 3A.1 initially built van staffing around fixed `driver_id`/
`salesman_id` columns on `vans`, plus a `van_assignments` table that only
allowed one active person per role per van. That doesn't hold up against
real business shapes — one person doing everything, two salesmen sharing
a van, a salesman with no driver at all. This was corrected before
continuing rather than left as a known limitation:

- **`vans.driver_id`/`salesman_id` are gone entirely** — not deprecated,
  actually dropped. Every place that read them (Vans list, GPS Tracking's
  "my van" detection, Driver/Salesman Management's "assigned van" lookup)
  now reads from the new table instead.
- **`van_staff_assignments`** replaces the old rigid table: one row per
  (van, employee, role), uniqueness enforced only on the *active* triple.
  An employee can hold several roles on one van at once (Driver +
  Salesman + Collector, all one person); several employees can share a
  role (two Salesmen on one van); a van can have a Salesman with no
  Driver at all. Nothing assumes a fixed staffing shape.
- **`van_staff_roles`** — Driver/Salesman/Collector/Helper/Supervisor/
  Manager/Stock Keeper ship as system roles available to every company,
  plus company-specific custom roles.
- **One role marked primary** per employee per van, settable at
  assignment time via `assign_van_staff()` (also handles
  `remove_van_staff_role()` for dropping a single role while keeping
  others, and `remove_van_staff()` for removing someone from a van
  entirely).
- **Van Details → Staff tab** replaces the old Assignments tab: assign an
  employee, multi-select their roles, pick a primary, set an effective
  date, see current staff (grouped by employee, primary starred) and
  full history in one place.
- **"Auto-detect on login"** — `my_van_staff_assignments()` +
  `useMyVanContext()` give a person's current van/role/route in one
  call; GPS Tracking's "share my location" now defaults to a person's
  van this way, instead of matching on full name against a fixed column
  (the old approach silently broke the moment a name changed or two
  vans had similarly-named staff).
- **Van Staff Report** (Van Loading → Staff Report tab) covers Van Staff,
  Employee Assignment, Role Assignment, and Assignment History reporting
  in one filterable, exportable table, rather than four separate pages
  that would all be showing slices of the same underlying data.

**Honestly incomplete pieces of the permissions model** this doc asked
for: Van-based access (only-assigned-users-can-use-a-van) and Role-based
access (system permissions) are both real and enforced. **Branch-based
access** — restricting a person to specific warehouses beyond just
display — isn't enforced anywhere; `home_warehouse_id` is informational
only right now. Worth a dedicated pass if you need staff genuinely
walled off from other branches' data, not just their own.

## Phase 5A.2 Part 2: Stock Reservation, Credit Control, Order Approvals, Backorders, Amendments, Cancellation, Offline Revalidation

The largest phase in this build by line count (11 migrations, ~2,600 lines
of SQL) — full order-control lifecycle on top of Part 1's order entry.
Followed the doc's "inspect before implementing" instruction; real
findings from that inspection:

- **`warehouse_stock.reserved_quantity`** already existed as a column but
  **nothing wrote to it** — only `allocate_stock_fifo()` (0025) read it.
  Same dormant-field pattern caught in earlier phases (`wholesale_price`,
  `free_quantity_rules`). Now it's actually maintained by the new
  reservation functions. `van_stock` had no such column at all — added it.
- **`allocate_stock_fifo()`** (0025) is a real FIFO/expiry-priority
  allocator already used by Van Loading/POS — reused rather than
  duplicated, but inspection surfaced two real bugs fixed here: it never
  excluded already-expired batches (an expired batch would be allocated
  *first*, not skipped), and it hard-raised an exception on any shortfall
  instead of supporting the "Partial Stock Handling" this phase requires.
  Added explicit FIFO-vs-FEFO selection and a minimum-remaining-shelf-life
  parameter. A compatibility wrapper under the original signature keeps
  Van Loading/POS working unchanged.
- **`customer_available_credit()`** (4A.2 Part 1) had carried two
  hardcoded-to-zero variables since it was written — `v_pending_orders`
  and `v_reserved_credit` — with a comment reading "reserved for when one
  exists." Both now compute from real `sales_orders`/
  `sales_order_credit_reservations` data.
- **A foundational gap caught mid-build**: partway through writing the
  approval workflow, realized Part 1's `sales_orders.status` CHECK
  constraint and its transition table only covered the 7-state Part 1
  model — the approval/hold/reservation code already being written used
  statuses (`approved`, `pending_approval`, `rejected`, ...) that
  constraint would have rejected outright. Stopped and extended the
  constraint and transition table to the full Part 2 status set
  (migration 0053) before continuing, rather than shipping code that
  would fail its first real write.
- Two more bugs caught and fixed before they shipped: `check_backorder_availability()`
  originally referenced a `customers.priority` column that doesn't
  exist; `reopen_expired_order()` originally called the totals-recalculation
  function *before* clearing old order items, which would have left the
  order with either duplicated or zeroed-out lines depending on call order.

**Database** (migrations 0047–0057): all 26 tables named in the
requirements doc — stock validation/reservation (with batch and serial
breakdown as children of a reservation header, not a competing
allocation concept), backorders + stock transfer requests (linked to
the existing `warehouse_transfers`/`van_transfers` tables, not a new
transfer engine), credit validation/reservation/override (with
separation-of-duties enforcement), a multi-level order approval workflow
(trigger evaluation from real order/item data, sequential steps, partial
approval that can only reduce quantities/discounts, never increase
them), price/discount/free-quantity override requests, order hold/release,
approved-order amendments (JSON version snapshots, never overwriting
history), full and partial cancellation (atomically releasing every
active stock and credit reservation), order expiry/reopen, a conversion
foundation (tracking fields only — no invoice is created this phase),
offline revalidation after sync (reruns customer/product/pricing/stock/credit
checks against current server state, never trusts cached offline values),
sync conflict detection and resolution, a 34-action permission module,
audit triggers on every new table, `dashboard_stats()` extended with 20
real Part 2 KPI fields, and notifications wired through the existing
`notifications` table.

**Client**: `SalesOrderDetailPage` extended with three new tabs (Stock,
Credit, Approvals) showing live validation results, reservations, credit
overrides, and approval steps with inline approve/reject/return-for-correction
actions; Hold and Cancel buttons wired to the real Part 2 functions
(cancellation now properly releases every reservation rather than just
flipping a status flag); a new `ApprovalQueuePage` giving supervisors one
place to see every pending approval step across the company.

**Honest gaps** (updated after a follow-up pass — see note below):
- Serial number selection is auto-only (earliest-created-first); there's
  no manual-override picker UI for authorized users, though the
  permission (`select_serial_numbers`) and the underlying data model
  support it.
- Batch/FIFO-FEFO override UI doesn't exist — the allocation method is
  set at the order level, not adjustable per-item from the UI.
- Amendment creation is prompt-based (pick an item by number, type
  "reduce" or "remove", enter values) rather than a proper form — it
  works and calls the real `create_order_amendment()` RPC, but it's not
  polished UI.
- Backorder-allocation is display-only — `check_backorder_availability()`
  exists server-side but there's no "allocate now" action button.
- Of the 26 named reports, 6 are built (Stock Validation, Reservation,
  Credit Validation, Approval, Backorder, Cancellation); the remaining
  20 (listed in-page as a gap note) aren't.

**Follow-up pass** (same day): added `OrderControlReportsPage` (6 of the
26 reports, real data, search/sort/export via the existing `DataTable`),
`SyncConflictsPage` (lists every open conflict company-wide with a
resolution dropdown wired to `resolve_sync_conflict()`), and an
Amendments tab on the order detail page with a working (if prompt-based)
creation flow and an Approve button. Caught and fixed the same JSX
mistake twice while inserting new tabs into `SalesOrderDetailPage` — a
str_replace matching on `)}\n\n{tab === 'notes' && (` consumed the
`notes` tab's opening condition along with the surrounding text it was
meant to leave alone; verified via `grep` after each tab insertion from
then on and caught both occurrences before they shipped.

## Phase 5A.2 Part 1: Sales Order Entry, Pricing, Discounts, Mobile & PDT Order Entry

Followed this phase's own "inspect before implementing" instruction.
Findings and what got reused vs. built new:

- **`product_uoms`** (Phase 1) — Multiple UOM support (Piece/Pack/Box/
  Carton/Case/Bottle/Kg/Litre, with a `conversion_factor` back to the
  base unit, per-UOM barcode, per-UOM price, `is_default_sale_unit`)
  **already existed in full**. Nothing to build for this requirement —
  order items just reference it.
- **`resolve_customer_price()`** (4A.2 Part 2) — the centralized pricing
  engine this doc asks for. Reused as the single pricing authority.
  **Real bug found and fixed while inspecting it**: the documented and
  schema-supported priority chain is Customer → Customer Group → Price
  List → Route Price → Branch Price → Promotion → Standard
  (`product_price_rules.scope_type` already had a `'route'` option in
  its check constraint) — but the function's actual logic jumped
  straight from price list to branch, **never checking route price at
  all**. Fixed in migration 0043, since Sales Order Entry is the first
  real caller that would have silently hit this gap.
- **`free_quantity_rules`** (4A.2 Part 2 — at the time built as "schema
  + hook only, no UI page") — Buy-X-Get-Y / free quantity automation
  finally gets its first real caller: `recalculate_sales_order_totals()`
  applies it automatically per completed slab of the buy quantity.
- **`customer_discounts`** (4A.2 Part 2) — Customer/Product/Category
  discount auto-application reuses this table directly rather than
  inventing a new discount-rule concept.
- **`payment_methods`/`payment_terms`** (4A.2 Part 1), **`van_stock`/
  `warehouse_stock`** (display-only — no reservation/deduction happens
  this phase), **`routes`/`beat_plans`/`daily_visit_plans`/
  `daily_visit_plan_items`** (5A.1), **`next_document_no()`** pattern
  (Phase 1, extended with an order-type-aware prefix), and the existing
  barcode/scan stack (`useScanLookup`, `useHidScanListener`,
  `BarcodeScannerModal`, `useRecentAndFavouriteProducts`) — all reused
  as-is, nothing duplicated.

**Database** (migrations 0043–0046): `sales_order_types` (10 configurable
types — Van Sales/Pre-Sales/Warehouse/Cash/Credit/Hybrid/Replacement/
Promotional/Sample/Custom, each with its own default stock source,
default payment type, and reservation rule for Part 2 to read),
`sales_orders`, `sales_order_items`, `sales_order_notes`,
`sales_order_status_history`. `create_sales_order()` is the atomic
entry point — same never-trust-the-client principle as `create_sale()`:
prices, discounts, taxes, and totals are always recomputed server-side.
Its item-processing logic (pricing resolution, discount validation
against `max_discount_pct`/`min_selling_price`, free-item application,
totals) lives in one shared `recalculate_sales_order_totals()` function
that both `create_sales_order()` and `update_draft_sales_order_items()`
call — **caught myself duplicating this ~150-line block between the two
paths on the first pass and refactored it into the shared function**
before it could drift out of sync. `change_sales_order_status()` centrally
enforces valid transitions across the 7-state status set the doc names
(Draft/Pending Submission/Submitted/Cancelled/Expired/Sync Pending/
Sync Failed — approval and reservation statuses are explicitly Part 2).

**Client**: `SalesOrderEntryPage` (mobile-first, barcode/HID scanner
integration via the existing scan stack, live customer context showing
credit type/available credit/outstanding for display only), `SalesOrdersListPage`
(search/filter by date/status/van/route, inline submit/delete-draft),
`SalesOrderDetailPage` (tabbed: Overview/Items/Pricing/Discounts/Notes/
Visit/Audit History). Added as a new "Orders" tab inside the existing
Sales section rather than a separate top-level module.

**Honest gaps**:
- No dedicated PDT-optimized layout variant (large buttons, numeric
  keypad, battery-efficient minimal-animation mode) — the entry page is
  mobile-responsive but not PDT-specialized yet.
- No offline draft queue wired up — orders created while offline are
  stored with `status = 'sync_pending'` and the schema supports it, but
  there's no Dexie-backed queue/retry UI like Sales/Collections/Returns
  have from Phase 3B.3.
- Order List's Card View and Mobile View (doc asks for Table/Card/Mobile)
  — only Table view is built, via the existing `DataTable` component.
  Saved filters and bulk actions on the order list aren't built either.
- Combo Offer promotions (as distinct from Buy-X-Get-Y slabs) aren't
  implemented — `free_quantity_rules` only models the buy/free-quantity
  shape, not a multi-product bundle price.
- Price override and discount override are permission-gated and stored
  (original/requested/reason/requested_by) but there's no separate
  approval queue UI yet — Part 1 auto-applies an override the moment
  someone with the permission enters it, since a full approval workflow
  is Part 2 territory for order approval generally.

## Phase 5A.1 Part 1: Beat Plans, Daily Visit Planning & Route Execution

The largest phase in this build — 18 new tables plus a 13-frequency-type
recurrence engine and a route execution state machine. Followed this
phase's own "inspect before implementing" instruction; findings and
what got reused vs. built new:

- **`routes`/`route_customers`** (Phase 1) — frequency was only
  daily/weekly/monthly with a single `day_of_week` int, not rich enough
  for "every 15 days" or "first Monday of the month." Beat Plans
  **reference** `route_id` — they don't replace routes. The recurrence
  engine (`beat_plan_schedules` + `beat_plan_schedule_dates`) is the
  genuinely new layer.
- **`van_staff_roles`/`van_staff_assignments`** (Phase 3B.1) — the exact
  flexible multi-role model this phase asked for (no assumption of
  distinct Driver/Salesman/Collector) already existed and is reused
  verbatim for `daily_visit_plan_employees.role_code`.
- **`daily_van_operations`** (Phase 3B.1) — already has a van-day Start
  → Pause ⇄ Resume → End lifecycle with odometer/cash/stock tracking.
  **`route_execution_sessions` does not reimplement this** — it links
  1:1 to a `daily_van_operations` row and adds only the route-specific
  state that table doesn't have (current customer, completion counts,
  plan reference). Start/Pause/Resume/End all call the existing
  `daily_van_operations` RPCs.
- **`customer_visits`** (Phase 1, has GPS check-in/checkout/photos
  already) — deliberately not touched, since Part 1 explicitly excludes
  detailed check-in/checkout. `daily_visit_plan_items` is a new planning
  layer; how it relates to `customer_visits` during actual check-in is
  a Part 2 decision.

**Database** (migrations 0038–0042): `beat_plans`, `beat_plan_schedules`
(13 frequency types: daily/alternate days/weekly/biweekly/every-N-days/
monthly/specific weekdays/specific dates/first–last week of month/
custom calendar), `beat_plan_schedule_dates` (materialized, duplicate-
proof via a unique constraint), `beat_plan_customer_assignments` +
`beat_plan_assignment_history` (effective-dated, never overwritten),
`daily_visit_plans` (11-state status with a centralized valid-transition
function — e.g. Completed can't jump back to Draft), `daily_visit_plan_items`
(10-state visit status), the full approval workflow (submit/approve/
reject/return-for-correction), `route_execution_sessions` (wraps
`daily_van_operations`), `route_pause_logs`, `route_deviation_logs`,
`route_sequence_history`, `route_reschedule_logs`,
`route_unplanned_customer_logs`, `route_supervisor_actions`,
`daily_visit_plan_reopen_log` (snapshots the plan as JSON before
reopening), `route_sync_status`. All RLS-isolated by company, all
audited via the existing `log_audit_change()` trigger. `dashboard_stats()`
extended with real Beat Plan / Route Execution KPIs.

**Client**: `BeatPlansPage` + `BeatPlanDetailPage` (tabbed — Overview/
Schedule/Customers/Capacity/History, with a visual recurrence-rule
builder and capacity validation that checks real employee/van overlap,
not fabricated numbers), `DailyVisitPlansPage` (generate from an active
beat plan or filter by date, submit/approve/reject inline),
`DailyVisitPlanDetailPage` (sequence, included vs. excluded customers
with real exclusion reasons, Mark Ready → Start Route), `RouteExecutionPage`
(mobile-first: current/next customer cards, live progress bar,
pause/resume/end, skip/reschedule/add-unplanned, geolocation capture,
device-agnostic `geo:` navigation link so no single maps provider is
hardcoded), `SupervisorMonitoringPage` (live status across every route
for a given day), `RouteReportsPage` (Beat Plan Master, Daily Visit
Plan, Pending/Missed/Skipped/Rescheduled Customer, Route Pause, and
Route Deviation reports — searchable/sortable/exportable via the
existing `DataTable`).

**Honest gaps**:
- No holiday-calendar table exists in the required 18-table list, so
  `skip_holiday`/`holiday_handling` are stored on each schedule rule but
  have no actual holiday data to check against yet.
- Route optimization (auto-reordering by distance/time), drag-and-drop
  sequence reordering, and a Leaflet map embedded directly in the
  execution screen aren't built — the execution screen links out to the
  existing GPS Tracking page instead of duplicating map logic.
- Of the 19 named reports, 8 are built with real data (see the list
  above); the remaining 11 (Beat Plan Customer Assignment, Beat Plan
  Schedule, Route/Van/Employee Assignment, Route Start, Route End,
  Route Completion summary, Unplanned Customer, Route Sequence Change,
  Early Route Closure, Supervisor Action) aren't built yet.
- No push notifications for the 15 named notification triggers (plan
  generated, pending approval, route paused too long, etc.) — nothing
  wired up this phase.
- Offline sync for route execution has a `route_sync_status` table and
  an RPC to set it, but no Dexie-backed offline queue wired to the
  execution screen yet (Sales/Collections/Returns have this from Phase
  3B.3; Route Execution doesn't yet).
- Sequence Locking, bulk reordering, and route optimization respecting
  locked/fixed-time customers are schema-ready (`original_sequence` is
  preserved everywhere) but have no dedicated UI.

## Phase 4A.2 Part 2: Customer Pricing & Financial Foundation

Followed this phase's own "inspect before implementing" instruction:
`products.wholesale_price/retail_price/offer_price` and
`customers.price_level` have existed since Phase 1, but **neither is
actually read anywhere** — POS only ever fetches `products.selling_price`.
Dead schema, not live logic, so there was no existing price resolution
to break. `resolve_customer_price()` is the real, reusable Price
Priority Engine the doc asks for; it is **not** wired into POS/
`create_sale`'s actual fetch, since that's Sales Invoices territory
this phase explicitly excludes touching — same precedent as
`validate_customer_credit()` in Part 1. `customer_groups.default_discount_pct`
(existed since Phase 1, extended in 4A.1) is reused as-is for the
"Customer Group Price" priority tier rather than inventing a second
group-pricing mechanism.

**A real bug caught before it shipped:** the first draft of the opening-
balance accounting integration assumed a `'1100'` Chart-of-Accounts
code convention for Accounts Receivable. On checking, **no Chart of
Accounts is ever seeded anywhere in this codebase** — that assumption
would have silently posted nothing, ever, for any company. Fixed to
look up accounts by name pattern (`%receivable%`, `%opening%`/`%retained%`)
instead, with honest, visible degradation: the customer balance and
ledger effects always apply; the journal entry only posts if the
company has actually set up recognizably-named accounts.

- **Price Lists** (Customers → Pricing Dashboard → Manage price lists) —
  unlimited, with currency/priority/status/effective-expiry/branch.
- **Product Price Rules** — one generic table (`product_price_rules`)
  covering price-list, branch, route, and promotion pricing as
  different *scopes* on the same shape, rather than four separate
  tables for what's structurally the same rule.
- **Customer-specific prices** — highest priority in the engine.
- **Price Priority Engine** (`resolve_customer_price()`): Customer
  Price → Customer Group Price → Price List → Branch Price →
  Promotion → Standard Selling Price. Callable and correct; not yet
  the live price POS charges.
- **Customer Discounts** — percentage/fixed/product/category/invoice,
  with approval-required and temporary+auto-expiry support.
- **Free Quantity Rules** (`free_quantity_rules`) — Buy X Get Y schemes,
  schema and hook built; **no management UI yet** (see gaps below).
- **Opening Balances** — genuinely integrated with Accounting: approval
  posts a real journal entry (subject to the Chart-of-Accounts caveat
  above) and updates both `customers.outstanding_balance` and the new
  ledger in the same transaction.
- **Customer Ledger Foundation** — `customer_ledger` (running balance
  header, auto-maintained by a trigger) + `customer_ledger_transactions`
  (the append-only log). Only real transactions exist in it today
  (opening balances); Sales Invoices/Collections/Returns/Credit-Notes/
  Debit-Notes/Adjustments/Write-offs are explicitly future phases per
  this phase's own instructions — nothing fake was seeded.
- **Aging Structure** — configurable buckets seeded with the doc's own
  defaults (Current/1-30/31-60/61-90/91-120/120+), populated today from
  opening balances; future invoices feed the same structure automatically
  once that module exists.
- **Pricing Dashboard** (Customers → Pricing Dashboard) — every widget
  the doc listed.
- **Customer Profile → Pricing & Ledger tab** (new) — assign price
  lists, set customer-specific prices, manage discounts, record/approve
  opening balances, and view the account summary/aging/ledger, all in
  one place per customer.

**Real gaps, not silently dropped:**
- No standalone Free Quantity Rules management page — the schema, RLS,
  and hook exist and are usable via the API, but there's no UI screen
  for it yet.
- No consolidated Reports page for this phase (Price List/Customer
  Pricing/Special Price/Discount/Free Goods/Opening Balance/Customer
  Balance/Ledger Structure/Aging Structure reports) — the underlying
  data is all queryable (and the Pricing Dashboard covers several of
  these at a glance), but dedicated exportable report views weren't
  built.
- Offline viewing of assigned pricing/price lists/discount rules/opening
  balance summary was not built — real additional work on the existing
  offline queue, not a small addition.

## Phase 4A.2 Part 1: Customer Credit & Payment Management

Followed this phase's own "inspect before implementing" instruction:
`customers.credit_limit`/`outstanding_balance` have existed since Phase 1
and are actively read/written by Collections, the legacy quick-create
hook, and the Customer Profile Overview tab (Phase 4A.1). Rather than
creating a second, disconnected place for credit data, `customer_credit_profiles`
becomes the new authoritative source for `credit_limit` going forward,
with a sync trigger keeping `customers.credit_limit` mirrored — none of
those three existing screens needed to change.

- **Customer Credit Profile** — every field the doc listed, auto-created
  for every customer via a trigger on customer insert (and backfilled for
  every customer that already existed). "One credit profile per customer"
  is a database guarantee, not something the UI has to remember to do.
- **Configurable Payment Terms/Methods/Risk Levels** (Settings → Credit &
  Payment) — system defaults + per-company custom, same pattern as every
  other configurable lookup in this app.
- **Cash/Credit/Hybrid**, switchable only with permission, full history
  (`customer_credit_history`).
- **Temporary credit** with automatic restoration after expiry
  (`expire_temporary_credits()`, called on Credit Dashboard load — same
  honest "no real cron" pattern as vehicle alerts from an earlier phase).
- **Available Credit** — one reusable function
  (`customer_available_credit()`), correctly wired to subtract pending
  orders and reserved credit even though both resolve to 0 today (no
  Sales Orders module exists yet, and this phase explicitly excludes
  starting one) — the shape is right so nothing has to change when that
  module eventually arrives.
- **Credit Validation Engine** (`validate_customer_credit()`) — the
  reusable service future sales modules are meant to call. Built and
  callable; **not wired into `create_sale`'s enforcement**, since that's
  Sales Invoices territory and this phase's own instructions explicitly
  say not to start that module here.
- **Automatic credit status** (Normal/Warning/Near Limit/Over
  Limit/Blocked) — `refresh_customer_credit_status()` factors in
  outstanding balance, temporary credit, and overdue balances (using
  `sales.balance_amount`, already a generated column from Phase 1, against
  the customer's payment term credit+grace days).
- **Approval workflow** — `customer_credit_approvals` is a structured
  request queue with real old/new values (draft→pending→approved/
  rejected/cancelled/expired), intentionally separate from the generic
  `approval_history` action log from Phase 3B.2 (which was widened to
  also log credit actions, rather than building a second parallel log —
  that table was never designed to hold a before/after value pair, which
  a credit-limit approval genuinely needs).
- **Customer Credit Dashboard** (Customers → Credit Dashboard) — all the
  widgets the doc listed, plus a live pending-approvals queue with
  approve/reject actions right there.
- **Financial tab** on the Customer Profile (previously an explicit
  Part-2 placeholder) is now real: status/limit/available credit at a
  glance, type/payment-term/risk-level editing, credit-increase and
  temporary-credit requests, block/unblock, and both history tables.

**Explicitly out of scope, per this phase's own instructions** — not
started: Customer Pricing, Opening Balances, Customer Ledger, Sales
Orders, Sales Invoices, Collections, and Returns. The offline support
this phase asked for (view credit status/terms/limits offline, no
offline approval of overrides/temporary credit/risk changes) was not
built in this pass — it's real additional work on top of the Phase
3B.3 offline queue, not a small addition.

## Phase 4A.1 Part 1: Enterprise Customer Master

This phase's own instructions required an analysis step before any code —
inspecting existing customer tables, reusable components, and audit
infrastructure, and explaining conflicts before implementing. That
analysis is preserved in this project's conversation history; the
short version: `customers`/`customer_groups`/`customer_contacts` already
existed from Phase 1 but were thin (a single `address` text field, a
hardcoded 7-value `customer_type` enum, a plain `is_active` boolean, no
audit trail), and there was no dedicated Customer Master UI at all —
only read-only dropdowns in POS/Returns/Routes/Geofences.

- **One customer table, extended, not replaced.** Every new field the
  doc asked for was added to the existing `customers` table rather than
  creating a parallel one. The old `customer_type` enum and `is_active`
  boolean are kept (the latter as a generated column derived from the
  new `status` field) specifically so POS/Returns/Routes/Geofences kept
  working unmodified.
- **Configurable Types/Categories/Channels** (Settings → Customer
  Master) — system defaults + per-company custom entries, mirroring the
  `van_staff_roles` pattern from Phase 3B.1. No source code editing to
  add a new customer type.
- **Groups** (already existed) and **Tags**/**Territories** (new) — all
  manageable from the same settings screen.
- **Customer Addresses** — genuinely new (there was only one text
  field before). Editing **never overwrites**: `replace_customer_address()`
  supersedes the old row and inserts a new current version, so full
  history is preserved as required.
- **Customer Contacts** — extended in place with department, WhatsApp,
  authorized-buyer/receiver/payment-contact flags, status, notes.
- **Flexible employee assignments** — `customer_assignments` mirrors
  `van_staff_assignments` exactly: any customer can have any number of
  employees, any employee can hold any number of roles (salesman,
  collector, supervisor, ...), nothing assumes they're different
  people. Route/Van/Territory/Branch changes are tracked separately as
  reassignment history (`customer_reassignment_history`), since a
  customer normally has exactly one current route/van rather than
  several at once — a different shape from the employee side, and
  documented as a deliberate distinction, not an oversight.
- **Status lifecycle with history** — draft/pending approval/active/
  inactive/blocked/suspended/archived/deleted, every change logged to
  `customer_status_history`.
- **The first real, working audit-log trigger this codebase has ever
  had.** `audit_logs` existed since Phase 1 but nothing had ever written
  to it — a schema stub, not working infrastructure. `log_audit_change()`
  is generic and now backs customers, addresses, contacts, and
  assignments, reusable for any future table with one line.
- **Soft duplicate detection** — warns on matching phone/WhatsApp/email,
  save-anyway requires a permission, exactly as specified (a hard
  database constraint would make override impossible).
- **Customer Master list** (Customers in the sidebar) — search across
  code/name/phone/WhatsApp/email/route/area/employee, filters for every
  dimension the doc listed, table and card views, bulk activate/
  deactivate.
- **Customer Profile** — tabbed: Overview, General Information,
  Addresses, Contacts, Assignments, Notes, Activity & Audit History are
  fully real. **Documents, Bank Details, and Financial are placeholder
  tabs exactly as the doc specified** ("placeholder for Part 2") — not
  built out, and not faked with mock data.

**Honestly thinner than the full spec, stated rather than hidden:**
- Only two views were built (table, card) — no distinct "compact
  mobile view" as a third layout; the card view is responsive and
  usable on a phone, but that's not the same as a purpose-built compact
  layout.
- Bulk actions cover Activate/Deactivate; Assign Route/Van/Employee,
  Change Category/Group/Tags, and bulk Export/Print from the selection
  toolbar were not built — the toolbar is there, wired for the two that
  are.
- No column selector or saved filters.
- No print action for the customer list/profile yet.
- **Offline customer viewing for assigned routes and offline draft
  creation were not built in this pass.** The offline queue (Phase
  3B.3) currently covers Sales/Collections/Returns; extending it to
  customer master data is real, additional work, not a small addition.

## Phase 3B.3: PDT Device Support, Scanning, Printing, Offline & Sync

The requirements doc for this phase named specific hardware (Zebra
TC21/TC26, Chainway C61/C66, Urovo DT50/RT40, Sunmi, Newland,
Honeywell) and asked for native-level device integration, USB
scanner/printer support, encrypted local storage, and true offline
login. Before writing any code, it's worth being direct about what a
browser-based PWA genuinely can and can't do, because several of
those requirements are outside what a web page is allowed to touch —
not a scope decision, a platform wall:

- **Native SDK integration for any of those PDT brands' built-in scan
  engines is impossible from a PWA.** Those are proprietary Android
  SDKs (DataWedge, Chainway SDK, etc.) with zero browser access. The
  actual, correct answer — and the reason this still works for all of
  them — is that professional PDTs are normally configured in
  **keyboard-wedge (HID) mode** for exactly this kind of web
  deployment: the scan engine "types" the barcode into whatever field
  has focus, then sends Enter. One well-built input listener
  (`useHidScanListener`, timing keystroke bursts to tell a scan from
  human typing) genuinely covers every listed device, plus external
  Bluetooth/USB scanners, with no device-specific code at all.
- **True USB-level device integration** (WebUSB) is narrow, Chrome-only,
  and not how these devices are actually used — not built, and the HID
  approach above makes it unnecessary.
- **"Encrypted local database"** to native-app standards isn't
  achievable with IndexedDB; **selective single-device remote logout**
  isn't achievable without a backend service Supabase's client SDK
  doesn't expose. Neither is built; both are stated as real limits, not
  silently skipped.
- **Offline login** in the literal sense (validating credentials with
  zero network) doesn't fit Supabase Auth's model. What's built instead
  — a cached, previously-validated session that keeps the app usable
  offline, with a visible "offline mode" state — is a different,
  weaker guarantee, and is described as such rather than relabeled as
  full offline login.

**What's genuinely built and live:**
- **Device Management** (Settings → Devices) — devices register
  themselves automatically on sign-in (model/manufacturer/OS
  best-effort detected from the user agent), rename/assign to
  employee+van+branch/block/remove, full login history per device.
- **Universal Scanner** (Inventory → Quick Scan, plus usable anywhere
  `<UniversalScanner>` is dropped in) — HID listener + camera fallback,
  continuous/single mode, duplicate-scan suppression, auto lookup
  across product barcode/SKU, batch number, serial number, and (via a
  new `VSPQR:type:id` scheme for entity types that had no QR lookup
  before) customer/invoice/van/warehouse. Product/batch QR/barcode
  labels deliberately keep their original bare-code format so labels
  already printed and stuck on real stock keep scanning correctly.
  Every scan is logged (`scan_logs`) — the Scan Report.
- **Fast Product Search** — name/SKU/barcode search, Recent Products
  (auto-tracked per employee), Favourites (star toggle).
- **Print Settings** (Settings → Print Settings) — copies, logo,
  header/footer, QR/barcode/terms/signature toggles, paper size
  (58mm/80mm/A4), margins — genuinely applied by `documentPrint.ts` to
  every document from here on.
- **Print documents** — Invoice already existed (POS thermal receipts).
  This phase added Collection Receipt, Return Receipt, Customer
  Statement (running balance from sales + collections), Stock Count
  Report, and Daily Summary, plus Loading Slip/Unload Slip/Picking List
  from 3B.2. Every print is logged (`print_logs`) — the Print Report.
- **PIN lock** (Settings → Security) — a real per-device session lock:
  SHA-256-hashed PIN (Web Crypto, random salt, never leaves the
  device), auto-locks after 5 minutes idle or on demand, full-screen
  unlock overlay.
- **WebAuthn biometric unlock** — registers the device's platform
  authenticator (fingerprint/face where supported) as a second way to
  clear the same lock screen.
  Both the PIN and biometric are stated plainly, in the UI itself, as a
  quick-unlock for an *already-authenticated* session — the same trust
  model as a phone's lock screen — not a second real login.
- **Offline queue extended to Collections and Returns** (previously
  Sales-only). Two new atomic, idempotent RPCs
  (`create_collection_offline`, `create_return_offline`, both keyed by
  a client-generated UUID exactly like `create_sale` already was) mean
  a retried sync after a dropped connection can never double-charge a
  collection or double-file a return. Queued while offline, replayed
  automatically on reconnect.
- **Sync Management** (Settings → Sync Management) — manual sync,
  live online/offline status, pending-item count, failed items shown
  with their error (auto-retried on the next sync rather than needing
  a separate retry button, since every queued item is retried every
  flush). Every flush logs to `sync_history` — the Sync Report.
- **Device Login, Sync, Print, and Offline Activity Reports**
  (Settings → Device & Sync Reports), each exportable like every other
  table in this app.

**Honest gaps, not silently dropped:** Offline support does not extend
to Products, Customers, Warehouse Stock read-caching, Loading, or
Unloading — those still need a live connection. "Background sync"
here means "sync fires on reconnect and on manual trigger while the
app is open," not a true OS-level background sync while the app is
fully closed (patchy cross-browser support, and this project has no
server to drive one anyway). Voice search was marked optional in the
requirements and wasn't built.

## Phase 3B.2: Loading/Unloading Approval Workflow, Van-to-Van Transfers

Extends the existing Van Loading/Unloading modules (Phase 1) rather than
rebuilding them — several fields the schema already had (`signature_url`,
`quantity_verified`, `system_quantity`/`difference`) were sitting unused
until now.

- **Full status lifecycle** for both: `draft → pending_approval →
  approved / rejected → reopened → cancelled`, each transition logged to
  a shared `approval_history` table (who, when, what note, what
  signature) — click any loading/unloading number in the list to see
  the full timeline.
- **Picking verification** — the `quantity_verified` column already
  drove the actual stock movement on approval; this phase adds who
  picked it and when (`picked_by`/`picked_at`), exposed as an editable
  "Picked qty" column right in the loading detail view.
- **Unload variance** — `system_quantity`/`difference` (generated
  column) already existed; approval now captures the expected van
  quantity automatically if the creator didn't supply it, and a
  variance reason is required on the entry form whenever physical
  quantity differs from system quantity.
- **Digital signature** at approval for both loading and unloading
  (the same canvas signature pad built in 3B.1), notes, reject with a
  required reason, reopen back to draft, cancel with a required reason.
- **Van-to-Van Transfers** (Van Loading → Van Transfers) — a genuinely
  new capability. The existing `warehouse_transfers` table structurally
  can't express this direction (it only has `from_warehouse_id`/
  `to_warehouse_id`); this adds a parallel `van_transfers` table with
  its own approval + a "mark received" step, including an emergency-
  transfer flag for out-of-cycle moves (e.g. a van running out mid-route).
  `warehouse_transfers` also gained the same `received_by`/`received_at`
  tracking this doc asked for.
- **Serial number selection at loading** — `van_loading_item_serials`
  links specific serialized units to a loading line; approval relocates
  those exact serials to the van (`product_serials.current_location`).
- **Duplicate-line prevention** — enforced at the database level (a
  unique index on loading/unloading line items), not just a client-side
  nicety; the New Loading modal also now merges a re-added product+batch
  into its existing row instead of creating a second one.
- **Document generation** — Loading Sheet, Picking List, and Unload
  Verification are all one shared printable-document template
  (`printDocument()`) with different titles/columns rather than three
  separate systems, opened via the browser's print dialog (works with
  any printer, no paid API needed). Barcode/QR labels for products or
  batches already existed from an earlier phase (Inventory → Label
  Printing) — not rebuilt here.

**Real gap, stated plainly:** FIFO batch validation and negative-stock
validation both already existed structurally (the FIFO allocation engine
from Phase 2, and `approve_van_loading`'s stock-availability check from
Phase 1) — this phase didn't need to add new enforcement for those, only
wire the newly-added fields around them. What's *not* built: a
formal multi-level approval chain (e.g. Supervisor → Manager → Accounts)
— today it's a single approve/reject step per document, same as every
other approval workflow in this app.

## Phase 3B.1: Daily Van Operations, Stock Reconciliation

Built against your enterprise requirements doc. This deliberately does
**not** duplicate Van Loading/Unloading — those remain how stock
physically moves in and out of a van (opening stock transfer and
closing stock return already existed). What's genuinely new here:

- **Daily Van Operations** (Van Loading → Daily Operations) — a
  first-class per-van-per-day shift record with a real status
  lifecycle: **Start → Pause ⇄ Resume → End**, or **Cancel** with a
  required reason at any point. Auto-dated, assigned van/route,
  opening/closing time stamped automatically, opening/closing
  odometer and cash entered by the driver, and opening/closing **stock
  value** computed automatically from live `van_stock × cost_price` at
  the moment each transition happens — not entered manually. A
  vanilla-canvas **signature pad** (no external dependency) captures a
  digital signature at both open and close.
- **Stock Reconciliation** (inside an in-progress/paused operation) —
  physical count entered against every product currently on the van,
  live variance shown per line (system vs. counted), optional reason,
  submitted as pending reconciliation records. **Approval actually
  applies the adjustment** — `approve_stock_reconciliation()` updates
  `van_stock` to match the physical count and logs a real
  `stock_movements` row (`reconciliation_adjustment`), atomically, so
  nothing is just a report — approving genuinely changes what the
  system thinks is on the van.
- **Daily Van Summary** report — the operations list itself (opening/
  closing cash/odometer/stock value, duration, status), filterable and
  exportable like every other table in the app.

**What this deliberately reuses rather than rebuilding**, since
building it twice would be the "duplicate module" problem the doc
explicitly warned against:
- Opening Stock Transfer, barcode/QR scan, batch/expiry selection, and
  approval workflow → **Van Loading** (already built, Phase 1).
- Closing Stock (remaining/damaged/expired/returned) → **Van
  Unloading** (already built, Phase 1).
- Every stock movement already generates a `stock_movements` log row
  automatically (loading, unloading, sales, adjustments, transfers,
  receiving) — this phase adds the two new types this doc specifically
  called for (`reconciliation_adjustment`, and `closing_stock` as an
  available type for future use) rather than re-logging what already
  logs itself.

**Real gaps, stated rather than glossed over:**
- The physical-count table doesn't have a barcode/QR scan button wired
  in yet — counting is by typing a quantity next to each listed
  product. The camera scanner component already exists (built for POS)
  and wiring it in here is a small, contained follow-up, not a new
  capability to design.
- "Reserved stock" isn't tracked as a distinct state anywhere in this
  schema — `van_stock.quantity` is the only number that exists; there's
  no concept of stock being held/reserved separately from available.
- Serial-level breakdown at the daily-operation level isn't built —
  `product_serials` (from an earlier phase) tracks serials globally,
  not scoped into a specific day's shift.

## Phase 3A.3: GPS enhancements, Geofencing, Fuel, Maintenance

Built against your enterprise requirements doc:

- **GPS Tracking enhancements** (GPS → History & Playback) — real trip
  stats per van per day (distance, travel time, stop time, GPS point
  count) computed from `gps_logs` via haversine, plus **actual route
  playback**: a real interactive map (Leaflet + OpenStreetMap tiles —
  deliberately not Google Maps, since that needs a paid API key this
  project doesn't have) with a scrubber that moves a marker along the
  recorded path. Live Tracking (online/offline, last sync time) was
  already built in an earlier phase.
- **Geofencing** (GPS → Geofences) — Warehouse/Customer/Route/Custom
  zones (manual lat/lng + radius entry, or "use my current location").
  Arrival/exit detection is a **real Postgres trigger** that fires on
  every GPS ping (`detect_geofence_events`), not a client-side
  approximation — it works no matter which device or page sent the
  position. Sustained unauthorized movement (outside every fence for
  30+ minutes) raises a Vehicle Alert automatically.
- **Fuel Management** (Van Loading → Fuel) — entries with type/quantity/
  cost/odometer, and computed mileage (km per liter) from odometer
  deltas between fuel entries — the reliable source, since GPS-derived
  distance has gaps whenever location sharing wasn't on.
- **Vehicle Maintenance** (Van Loading → Maintenance) — service records
  with an approve/reject workflow and invoice links, plus recurring
  schedules (by km interval, day interval, or both) that drive the
  "maintenance due" alert.
- **Reminders / Notifications → Vehicle Alerts** (GPS → Alerts, also
  surfaced on the Dashboard) — maintenance due, insurance/registration/
  permit/driver-license expiry, and vehicle-offline detection, all
  computed by one RPC and acknowledgeable. **Important limitation,
  stated plainly rather than glossed over:** this is a static PWA + Supabase
  with no background server, so there is no real cron — alerts are
  recomputed each time the Dashboard or Alerts page loads, not pushed
  in real time the moment something becomes due. If you need true
  push notifications independent of anyone opening the app, that needs
  a Supabase Edge Function on a schedule (or an external cron hitting
  an endpoint) — genuine new infrastructure, not something addressable
  from the client alone.
- **Reports** — Fuel, Maintenance, GPS Trip Stats, and Vehicle Alerts
  each export from their own page (CSV/Excel, like every table in the
  app) rather than as separate dedicated report pages, since each one
  already *is* the underlying data in filterable, exportable form.

Three real bugs were caught and fixed in the migration for this phase
before it was ever run against the database — a broken composite
primary key, a wrong column name (`gps_logs.recorded_at`, not
`created_at`) that would have silently broken the geofence trigger and
trip-stats function, and a duplicate-alert bug for driver-linked
alerts. All three are detailed in the migration file's commit history.

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
