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
**in numeric order** (0001 → 0112). Each file is idempotent-safe to rerun
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

## Phase 5B.4 Part 1: Credit Notes, Debit Notes, Customer Adjustment Entry

12 migrations, ~2,190 lines, plus a working client layer. This is a
new, general-purpose manual financial-adjustment module — draft only,
mirroring the exact Part 1/Part 2 split established for Sales Returns
(approval/posting/balance-adjustment for these documents belongs to a
future 5B.4 Part 2).

**Reused, not duplicated**: `customer_ledger_transactions` already had
`'credit_note'`/`'debit_note'` transaction types (4A.2 Part 2) —
reserved for Part 2's posting, not needed for this draft-only phase.
`sales_return_credit_notes` (5B.3 Part 2, auto-generated during return
posting) is untouched and continues working exactly as before —
this phase's `credit_notes` is a separate, general-purpose table a
user can create manually (optionally referencing a return/invoice),
coexisting rather than replacing it. `invoice_eligible_for_adjustment()`
generalizes the eligibility rule already established for Sales Returns.
"Branch" reuses `warehouses`, same as every other document header in
this build. The already-existing `AccountingHomePage`/`/accounting`
route (found during inspection, not created) is this module's home.

**Database**: `financial_document_types` (15 named sub-types,
categorized by `credit_note`/`debit_note`/`customer_adjustment`),
`financial_adjustment_reasons` (16 reasons). Shared polymorphic
`adjustment_status_history`/`adjustment_notes`/`adjustment_sync_status`/
`adjustment_sync_conflicts` tables keyed by `(document_table,
document_id)` — matching the doc's own singular naming rather than
building three duplicated copies. Core `credit_notes`/`credit_note_items`,
`debit_notes`/`debit_note_items` (customer-level, invoice optional,
support amount-only entry), and `customer_adjustments`/
`customer_adjustment_items` (always invoice-anchored, no amount-only
mode) — every atomic draft-creation function computes line amounts from
whichever correction pair (price/quantity/discount/tax) or direct
amount was supplied, verified for a consistent credit/debit sign
convention across all four correction types. Customer adjustment
corrections are validated against the actual invoice item's stored
figures, not accepted blind. Draft editing (customer/invoice change
clears items), cancellation, delete-unsynced, offline sync integration,
24-action permission module, audit triggers, dashboard widgets (full
prior 115-widget set preserved and appended to) and notifications for
all three document types.

**Client**: list/entry/detail pages for all three document types, each
detail page with the doc's specified 8 tabs (Overview/Items/Customer/
Invoice/References/Notes/Sync History/Audit History). Credit and debit
note entry support both amount-only and per-invoice-item entry; customer
adjustment entry has a per-line correction-type picker (price/quantity/
discount/tax/direct amount) against the actual invoiced figures.

**Honest gaps**:
- No Reports UI (Credit Note Draft Register, Debit Note Draft Register,
  Customer Adjustment Register, and the 7 other named reports) — same
  gap every other Part 1 phase in this build has had at this stage
  before its follow-up pass.
- No mobile/PDT-specific touch optimizations on the entry pages yet.
- No dedicated offline sync-conflict resolution UI (the shared
  `resolve_adjustment_sync_conflict()` RPC exists and is callable;
  no screen surfaces open conflicts for these three document types).

## Phase 5B.4 Part 1: Credit Notes, Debit Notes, Customer Adjustment Entry

8 migrations, ~1,608 lines, plus a full working client layer (9 pages
across 3 document types).

**Reused, not duplicated**: `customer_ledger_transactions` already had
`'credit_note'`/`'debit_note'` transaction types (4A.2 Part 2) —
untouched this phase since Part 1 is draft-only, ready for Part 2 to
use directly. This module coexists with (does not replace)
`sales_return_credit_notes` (5B.3 Part 2), which is auto-generated
during return posting — a user can manually create a credit note
(optionally referencing a return/invoice) independently. "Branch"
reuses `warehouses`, same as every other document header in this
build. `invoice_eligible_for_adjustment()` reuses the exact eligibility
rule established for Sales Returns, generalized since it isn't
return-specific.

**Database**: `financial_document_types` (15 named sub-types,
categorized by `credit_note`/`debit_note`/`customer_adjustment`),
`financial_adjustment_reasons` (16 reasons). Shared polymorphic tables
— `adjustment_status_history`/`adjustment_notes`/`adjustment_sync_status`/
`adjustment_sync_conflicts` — keyed by `(document_table, document_id)`
rather than three duplicated copies per document type, matching the
doc's own singular naming. Core `credit_notes`/`credit_note_items`,
`debit_notes`/`debit_note_items` (customer-level, invoice optional) and
`customer_adjustments`/`customer_adjustment_items` (always
invoice-anchored — the generic price/quantity/discount/tax/promotion
correction document). All three atomic draft-creation functions
support both amount-only entry and item-based entry with correction
pairs, computing line amounts from whichever pair or direct amount was
supplied — customer-adjustment corrections are validated against the
actual invoice item's stored figures rather than accepted blind, and
the credit/debit sign convention was verified consistent across all
four correction types (price/quantity/discount/tax). Draft editing
(customer/invoice change clears items), cancellation,
delete-unsynced-draft, offline sync integration (reusing the shared
polymorphic tables), 11-action permission module, audit triggers, and
dashboard/notifications (full prior 115-widget set preserved and
verified before 6 new grouped ones were appended).

**Client**: found and reused the existing `/accounting` module
(`AccountingHomePage`) as the natural home for this phase rather than
creating a new top-level nav section. Credit Notes, Debit Notes, and
Customer Adjustments each get a list page (search/filter/submit/cancel),
an entry page, and an 8-tab detail page
(Overview/Items/Customer/Invoice/References/Notes/Sync History/Audit
History). Credit/debit note entry supports both amount-only and
per-invoice-item correction entry; customer adjustment entry is always
invoice-anchored with a per-item correction picker that adapts its
input (price/quantity/discount/tax) to the selected adjustment type.

**Honest gaps**:
- No Reports UI (Credit Note Draft Register, Debit Note Draft
  Register, Customer Adjustment Register, Price/Quantity/Discount/
  Promotion/Tax Adjustment Reports, Employee/Van Adjustment Reports) —
  same category of gap other phases in this build closed in a
  follow-up pass.
- No offline sync conflict-resolution UI for this module specifically
  (the `resolve_adjustment_sync_conflict()` RPC exists and works; no
  dedicated page surfaces open conflicts yet, mirroring the same gap
  pattern seen in earlier phases before their follow-up passes).
- No dashboard widget display — the `dashboard_stats()` values exist
  and are queryable, but no dashboard card renders them yet for this
  module specifically.

## Phase 5B.3 Part 2: Return Approval, Quality Inspection, Return Stock Posting, Customer Balance Adjustment, Credit Note Generation, Replacement Workflow, Return Printing, Offline Revalidation, Reversals

9 migrations, ~2,109 lines, plus a working client layer. This phase
turns Part 1's draft returns into real, posted transactions — actual
stock restocking (or damaged/expired/quarantine handling), actual
customer credit, a genuine return-generated credit note, and a
replacement order workflow.

**Reused, not duplicated**: `customer_ledger_transactions` already had
`'sales_return'` and `'credit_note'` transaction types (4A.2 Part 2) —
reused directly for balance adjustment and credit-note posting.
`stock_movements.movement_type` was extended with damaged/expired/
quarantine/rejected/reversal variants rather than building a parallel
ledger. `warehouse_stock`/`van_stock` are the exact restocking targets
for saleable quantity — but damaged/expired/quarantine destinations are
**deliberately never written to their `quantity` column**, only to
`stock_movements` + the new `sales_return_stock_postings` audit table,
since that quantity column is exactly what ATP and van-loading read
from — this is how the doc's "quarantine stock must not be sold,
reserved, or used in ATP" and "do not mix damaged stock into usable
available stock" requirements are actually enforced, not just described.

**Database**: the full 31-state return status model. **Quality
inspection** — the core new concept this phase introduces —
`sales_return_inspections`/`sales_return_inspection_items` with the
doc's own quantity rules enforced as real CHECK constraints (accepted
can't exceed requested, accepted+rejected can't exceed inspected), plus
`complete_return_inspection()` rolling up real recorded quantities into
accepted/partially_accepted/rejected. **Atomic stock posting**:
`post_return_item_stock()` splits accepted quantity across
saleable/damaged/expired/quarantine destinations, proportionally across
batches when multi-batch, and updates serial status + Part 1's
`return_status` per serial. **Customer balance adjustment + credit
note**: `create_return_credit_adjustment()` and
`generate_return_credit_note()` — only accepted (never rejected, never
free-item) quantity generates financial credit, per the doc's own
decision table. A **real cross-module consistency fix**: added
`sales_invoices.credited_amount` and updated 5B.2 Part 2's
`revalidate_invoice_allocation()` so a receipt can never be allocated
against an amount a credit note already covered. `post_return()`: the
atomic centerpiece, wrapped in `begin...exception` for automatic
rollback. Return approval workflow with real trigger evaluation. Return
hold/release. Full replacement order workflow — its own record type
linked to the return, never an unrelated free Sales Order, with
replacement invoices/deliveries scoped to link against the normal
invoice/stock-posting controls rather than duplicating them. Reversal —
request/approval plus an atomic `execute_return_reversal()` that
un-restocks saleable quantity, restores the invoice's credited amount
and customer balance, and cancels any credit note or pending
replacement. Offline revalidation extended with the fuller Part 2
conflict list, controlled offline acceptance (local quarantine receipt
only, never financial posting), return printing reusing existing
infrastructure, a 32-action permission module, audit triggers, and
dashboard/notifications with the full prior 93-widget set verified and
preserved before 22 new ones were appended.

**Two things were caught and fixed before shipping**: the approval-
trigger evaluator's first draft would have pushed raw return-type/reason
codes (e.g. `'quality_complaint_return'`) directly as `approval_type`
values, which don't match that column's check constraint — fixed by
normalizing every trigger to a fixed enum value before the migration was
finalized. Separately, an early draft of the final-number logic in
`post_return()` referenced a column that was never added to the schema
— caught during review and simplified to use the existing
`return_number` directly, since Part 1 never distinguishes a draft
number from a final one for returns.

**Client**: `SalesReturnDetailPage` extended with five new tabs
(Approvals, Inspection, Stock Posting, Credit Note, Posting History)
and Submit-for-Approval/Start-Inspection/Complete-Inspection/Post/
Retry/Hold/Generate-Credit-Note/Request-Reversal buttons — posting
shows a confirmation before restocking and generating credit, and a
quick "Accept as Saleable" action on each inspection line for the
common case.

**Follow-up pass** (same day): added `ReturnReversalQueuePage` —
supervisor queue mirroring the invoice/receipt void/reversal pattern,
approving calls `execute_return_reversal()` directly and reports how
many stock movements were reversed. Added return print rendering — a
`PrintReturnModal` reusing the exact same print infrastructure as
invoices and receipts, with a Print button now on posted/accepted
returns.

**Second follow-up pass** (same day): added `ReplacementOrdersPage`
(approve/reject/mark-waiting-for-stock/mark-ready/cancel on active
replacement orders), `CashRefundRequestsPage` (approve/reject —
recording approval only; actual disbursement stays outside the
system), and `CreditNoteAllocationPage` (lists posted, unallocated
return credit notes with an inline pick-invoice/enter-amount/allocate
action, reusing the same outstanding-invoices hook built for
Collections).

**Third follow-up pass** (same day): added `ReturnOfflineAcceptancePage`
— shows the current device's offline-acceptance eligibility (reusing
the app's existing `getDeviceId()` device-identity pattern, already
used by the offline sync manager elsewhere in the app) and a log of
recent offline acceptance/reconciliation activity, explicit that
offline acceptance is a quarantine receipt only and never posts stock
or credit locally. Expanded `ReturnReportsPage` with 4 real posted-data
reports: Posted Sales Return Register, Return Stock Destination Report,
Return Credit Note Report, and Replacement Order Report.

At this point every gap noted across all three follow-up passes for
this phase has been closed with working functionality; remaining
reports (batch/serial/route/approval/inspection-specific breakdowns)
are the same secondary-polish category noted at this stage for every
other phase in this build.

## Phase 5B.3 Part 1: Sales Return Entry, Return Validation, Damaged & Expired Return Entry, Replacement Request Foundation, Mobile & PDT Return Entry

5 migrations, ~1,249 lines, plus a working client layer.

**Reused, not duplicated**: the existing `returns`/`return_items` (Phase
1) do immediate, simple approval-based returns tied to the old `sales`
table and are completely untouched — `sales_returns` is a new draft-only
layer tied to `sales_invoices`, the same relationship established twice
before in this build (`sales_invoices`↔`sales`, `receipt_vouchers`↔
`collections`). `product_uoms`/`units` (Phase 1) are reused directly for
multi-UOM validation — no new UOM catalog. `sales_invoice_items`'
already-stored `discount_amount`/`tax_amount`/`applied_price` are the
source for reversal previews, computed from the **original invoice
figures**, never current pricing or the current tax rate, per the doc's
explicit instruction. `customer_visits.visit_outcome` was extended
(not duplicated) with return-related values.

**Database**: `sales_return_types` (18 configurable types),
`sales_return_reasons` (17 reasons, each with its own approval/
inspection/stock-destination/notes-required rules — not hardcoded in
the frontend), `sales_return_conditions` (17 conditions). Core
`sales_returns`/`sales_return_items`/`sales_return_item_batches`/
`sales_return_item_serials` schema, draft-only with the full Part 2
foundation columns present but unwritten. `invoice_returnable_items()`
computing remaining returnable quantity as original invoice quantity
minus everything already returned in an active draft — correctly
excluding draft/unposted/voided invoices from ever appearing as
returnable. `calculate_return_reversal_preview()` — proportional
discount/tax reversal from the invoice item's own stored figures.
`create_sales_return_draft()` — the atomic entry point creating header,
items, and batch/serial breakdown together, with guards throughout
(can't exceed remaining returnable quantity, batch quantities must sum
to the item total, serial count must match base quantity, free-item
mismatch caught, no duplicate serial return). `check_duplicate_return_warning()`
(serial/batch/invoice-item/product+quantity match within 14 days,
warns without rejecting). Replacement request foundation, return value
override request foundation, draft editing (customer/invoice change
clears every stale batch/serial/replacement reference), cancellation,
offline sync + conflict detection (10 conflict types), 21-action
permission module, audit triggers, dashboard widgets (13 new, appended
to the full existing 80-widget set), notifications.

**Client**: return entry with customer → invoice → returnable-items
selection (checkbox per line, quantity/condition/reason per item),
`SalesReturnsListPage`, `SalesReturnDetailPage` (Overview/Return Items/
Batches/Serials/Pricing Preview/Notes/Audit History — the Pricing
Preview tab explicitly notes this is a preview only, no credit note or
balance change happens this phase).

**Honest gaps**:
**Follow-up pass** (same day): **caught and fixed a real bug** in the
detail hook/page — `batch_number`/`serial_number` were used where the
actual columns are `batch_no`/`serial_no` (Phase 1's `batches`/
`product_serials` tables), which would have silently rendered blank
batch/serial numbers on every return. Wired the duplicate-return
warning into the entry page (checks per selected line, warns with a
confirm dialog). Added a return-period-violation warning (flags
invoices older than 30 days with a note that approval may be required).
Added an inline batch/serial picker per line — pulls the batches/
serials actually sold on that invoice item (via
`sales_invoice_stock_allocations`) rather than letting the user pick
anything. Added `ReturnSyncConflictsPage` and `ReturnReportsPage` (7 of
20 named reports). PDT touches: larger touch targets, numeric keypad
inputs.

Remaining: no barcode/QR scan entry point, no offline draft queue
screen, 13 of 20 reports.

## Phase 5B.2 Part 2: Receipt Posting, Customer Balance Settlement, Invoice Allocation, Advance Payments, Cheque Control, Collection Approvals, Reversals, Receipt Printing, Offline Revalidation

10 migrations, ~1,926 lines, plus a working client layer. This phase
turns Part 1's draft receipt vouchers into real, posted collections —
actual invoice settlement, actual customer balance reduction, a real
cheque lifecycle, and controlled reversal.

**Key finding, documented in the migrations themselves**: `customer_ledger.current_balance`
is auto-maintained by a trigger (`apply_ledger_transaction()`, live
since 4A.2 Part 2), but `customers.outstanding_balance` — the column
the existing credit engine (`customer_available_credit()`/
`validate_customer_credit()`) has actually read since Phase 1 — is a
**separate column that trigger never touches**. Every balance-changing
function in this phase (`post_receipt()`, `allocate_customer_advance()`,
`allocate_unallocated_credit()`, `return_cheque()`,
`execute_receipt_reversal()`) writes both explicitly: an entry into
`customer_ledger_transactions` (reusing the existing `'collection'`
transaction type) for history, and a direct adjustment to
`customers.outstanding_balance` so the credit engine sees the payment
immediately. `sales_invoices.payment_status`/`paid_amount`/
`settlement_date` were genuinely missing and added as columns, not
tables. Part 1's `cheque_receipt_details` was extended with lifecycle
fields rather than duplicated into a second `cheque_receipts` table.

**Database** (migrations 0081–0090): the full 22-state receipt status
model with a centralized transition function. `revalidate_invoice_allocation()`
row-locks the invoice and never trusts the Part 1 draft snapshot —
`post_invoice_allocation()` creates the permanent `posted_receipt_allocations`
record and correctly distinguishes partial (`partially_paid`) from full
(`paid`) settlement. Full advance-payment and unallocated-credit balance
tracking with later-allocation functions. A collection approval workflow
with real trigger evaluation (high-value cash, cheque, post-dated
cheque, unverified bank, unauthorized card, advance, unallocated,
backdated/future-dated, blocked customer, unassigned route, offline).
Receipt hold/release. Payment-method posting records (cash/card/bank/
digital), including parsing the Part 1 entry page's denomination note
back into structured `cash_denomination_records` rows. A full cheque
lifecycle — verification, deposit batches, clearance, and an atomic
`return_cheque()` that reopens whatever invoice outstanding the cheque
had settled and restores the customer balance. **`post_receipt()`**: the
atomic centerpiece, wrapped in `begin...exception` so any failure rolls
back every posted component, allocation, and ledger entry automatically.
Receipt reversal — request/approval plus an atomic `execute_receipt_reversal()`
that reopens invoices, reverses advance/unallocated balances, and writes
an offsetting ledger entry, never deleting the original posting records.
Duplicate-match audit trail, controlled offline posting mirroring the
invoice pattern, receipt printing reusing the existing print
infrastructure, a 28-action permission module, audit triggers on 24
tables, and dashboard/notifications extending the full prior widget set.

**A real bug was caught by the TypeScript compiler and fixed before
shipping**: `post_receipt()`'s exception handler writes
`status = 'posting_failed'` to `receipt_vouchers`, but the status check
constraint in the same migration set didn't originally include that
value — a check-constraint violation waiting to happen the first time a
posting attempt failed. Caught because the frontend's `ReceiptStatus`
type (which is meant to mirror the constraint) didn't include it either,
and `tsc` flagged the resulting comparison as an impossible type overlap.
Fixed by adding `'posting_failed'` to the constraint.

**Client**: `ReceiptVoucherDetailPage` extended with four new tabs
(Approvals, Cheques, Posting, plus the reversal request surfaced in the
header) and Submit-for-Approval/Post/Retry/Hold/Request-Reversal
buttons — posting shows a confirmation before settling invoices and
reducing the customer balance, cheques can be verified/cleared/returned
inline, and a failed posting attempt surfaces its error with a Retry
button.

**Follow-up pass** (same day): added `ReversalQueuePage` — a
supervisor queue mirroring the invoice void-request pattern, approving
calls `execute_receipt_reversal()` directly and reports how many
invoices got reopened. Added receipt print rendering — a
`PrintReceiptModal` reusing the exact same print infrastructure the
invoice print modal uses (`printReceiptViaBrowser`/`Bluetooth` for
thermal, `printDocument` for A4), with a Print button now on posted
receipts.

**Second follow-up pass** (same day): added `AdvanceUnallocatedPage` —
lists every customer's available advance/unallocated balance from
posted receipts with an inline "pick an invoice, enter an amount,
allocate" action calling `allocate_customer_advance()`/
`allocate_unallocated_credit()` directly. Added `ChequeDepositBatchPage`
— lists verified cheques awaiting deposit, multi-select with a running
total, and creates a batch via `create_cheque_deposit_batch()`.

Remaining: no controlled-offline-posting UI, no Reports UI, no cheque
replacement UI.

## Phase 5B.2 Part 1: Collection Entry, Receipt Vouchers, Customer Payment Allocation, Mobile & PDT Collection Entry

5 migrations, ~1,184 lines, plus a working client layer.

**Reused, not duplicated**: `payment_methods` (4A.2 Part 1) already had
exactly the codes the doc wanted — cash/card/bank_transfer/cheque/
online/wallet/credit_account — reused directly despite being listed as
a "new table" in the doc. The existing `collections` table (Phase 1)
does immediate single-payment collection tied to the old `sales` table
and is completely untouched — `receipt_vouchers` is a new draft-only
layer for the richer multi-invoice-allocation workflow tied to
`sales_invoices`, same architectural relationship `sales_invoices` had
to `sales` in 5B.1 Part 1. `sales_invoices.posting_status='posted'` is
the exact eligibility filter for "outstanding invoices" — draft/
unposted/voided invoices correctly never appear as collectible.
`customer_visits.visit_outcome` was genuinely missing and added as a
small column, not a new table.

**Database**: `collection_types` (18 configurable types),
`receipt_vouchers`/`receipt_payment_components`/
`receipt_invoice_allocations` (draft-only, posting_status structurally
locked to `'not_posted'`), structured method-specific detail tables
(`cheque_receipt_details`, `card_receipt_details`,
`bank_transfer_receipt_details`, `wallet_receipt_details` — not one
unstructured text blob, per the doc's explicit instruction).
`customer_outstanding_summary()` (full aging buckets: current/1-30/
31-60/61-90/91-120/120+) and `customer_outstanding_invoices()`, both
computing real outstanding as `net_amount` minus active draft
allocations — this correctly prevents two different draft receipts from
over-committing the same invoice without marking anything actually
settled, since real settlement is Part 2's job.
`calculate_allocation_preview()` (4 strategies: oldest invoice, oldest
due date, most overdue, smallest/largest balance) as a read-only
proposal. `create_receipt_draft()` — the atomic entry point creating the
header, every payment component with its method-specific details, and
every invoice allocation together, with over-allocation guards at every
level. Draft editing (customer change correctly clears stale
allocations), cancellation, `check_duplicate_payment_warning()`
(matches on amount/method/reference/cheque-number/card-auth/bank-
reference within a 7-day window — warns, never auto-rejects),
`payment_promises` as a separate concept from receipt vouchers, offline
sync status/conflicts, 23-action permission module, audit triggers,
notifications. **Caught and fixed a real regression** while writing the
dashboard-widgets migration: the first draft of the updated
`dashboard_stats()` accidentally dropped nearly every widget from every
earlier phase instead of appending to them — rewrote it with the full
accumulated widget set preserved before it shipped.

**Client**: new "Collections" top-level nav section. `ReceiptEntryPage`
— customer selector with a live outstanding summary, mixed payment
components (add/remove multiple methods per receipt, each with its own
method-specific fields), a three-mode allocation panel (Allocate to
Invoices with auto-allocation preview across 4 strategies plus manual
override / Advance Payment / Unallocated Receipt), `ReceiptVouchersListPage`
(search/filter/inline submit/cancel), `ReceiptVoucherDetailPage`
(Overview/Payment Components/Invoice Allocations/Notes/Audit History).

**Honest gaps**:
**Follow-up pass** (same day): wired `check_duplicate_payment_warning()`
into the entry page (checks amount/reference/cheque-number/card-auth/
bank-reference before saving, warns with a confirm dialog rather than
blocking). Added `ReceiptSyncConflictsPage` (mirrors the invoice/order
pattern), `PaymentPromisesPage` (list open promises with Kept/Broken
actions plus a quick-create form), and `ReceiptReportsPage` (5 of 16
named reports: Receipt Draft Register, Cash/Cheque Collection Draft,
Employee/Van Collection Draft).

**Second follow-up pass** (same day): added `RouteCollectionPage` —
finds the current employee's approved daily visit plan for today and
lists its customers in sequence with outstanding balance, days since
last payment, and a one-tap "Collect" button that launches the receipt
entry pre-filled with the customer and visit plan. Added cash
denomination entry to `ReceiptEntryPage` — an optional per-cash-component
breakdown (500/200/100/50/20/10/5/1/0.50/0.25) that computes a running
total, warns on mismatch against the entered amount, and folds the
breakdown into the payment component's notes on save.

Remaining: 11 of 16 reports, no PDT-specific optimizations.

**Third follow-up pass** (same day): expanded `ReceiptReportsPage` from
5 to 14 of the 16 named reports — added Invoice Allocation Draft,
Card/Bank Transfer/Advance Payment/Unallocated Receipt/Mixed Payment/
Route Collection/Offline Receipt Draft, and Payment Promise reports.
Added PDT-friendly touches to `ReceiptEntryPage`: a "Full" quick-pay
button per outstanding invoice row, 44–48px minimum touch targets on
the amount/allocation inputs and the Save Draft/Submit buttons, and
`inputMode="decimal"` on numeric fields so mobile keyboards default to
the numeric pad.

Remaining: 2 of 16 reports (Customer Collection Draft, Duplicate Payment
Warning — the check itself runs live in the entry page but isn't
aggregated into a standalone report). PDT optimizations are now partial
(quick-pay button, larger touch targets, numeric keypad) rather than
absent — a dedicated large-icon/minimal-animation PDT mode is still not
built.

## Phase 5B.1 Part 2: Stock Posting, Credit Posting, Invoice Approvals, Final Invoice Posting, Printing, Offline Invoice Control

10 migrations, ~1,600 lines. This phase turns Part 1's draft invoices
into real, posted transactions — actual stock deduction, actual credit
consumption, an actual customer ledger entry.

**Reused, not duplicated** — the doc's own instruction, followed
concretely: `stock_movements` (Phase 1, `movement_type='sale_out'`) for
every stock movement this phase creates; `allocate_stock_fifo()` and
`calculate_available_to_promise()` (5A.2 Part 2) for FIFO/FEFO and stock
validation — no second allocator; `validate_customer_credit()`/
`customer_available_credit()` (4A.2 Part 1) for credit checks — no
second credit engine; `sales_order_stock_reservations`/
`sales_order_credit_reservations` (5A.2 Part 2) are *consumed* here, not
re-implemented. **Key finding mid-build**: the doc's required
`customer_balance_transactions` table would have exactly duplicated the
already-existing `customer_ledger_transactions` (4A.2 Part 2), which
already supports `transaction_type='sales_invoice'` and already has a
trigger (`apply_ledger_transaction()`, live since migration 0037) that
automatically maintains `customer_ledger.current_balance` on insert.
Posting an invoice writes one row there and lets that trigger do the
balance math — a second manual `UPDATE customer_ledger` would have
double-counted the balance, and this was caught and fixed before it
shipped by actually reading that table's real column names (`debit`/
`credit`/`description`, not the `debit_amount`/`credit_amount`/`notes`
first guessed from the table name alone). For printing, reused
`print_settings` (3B.3) for template config (logo, paper size, footer,
terms) rather than a new template table — only built the invoice-specific
original/duplicate/reprint tracking that the existing generic `print_logs`
didn't have.

**Database** (migrations 0066–0075): extended `sales_invoices.status` to
the full 21-state Part 2 model with a centralized transition function
(held/cancelled/posted invoices can't be re-posted). Stock validation
against real ATP or the linked order reservation. Stock allocation that
performs **real physical deduction** — `warehouse_stock`/
`van_stock.quantity` itself, not just `reserved_quantity` the way 5A.2
Part 2's reservation layer did — consuming an existing order reservation's
batch/serial breakdown when linked, or going through FIFO/FEFO directly
otherwise. Credit validation and reservation consumption, with credit
override requests enforcing separation of duties. A multi-level invoice
approval workflow with real trigger evaluation (credit, price/discount
override, high-value, stock-short, manual numbering), and — the part
Part 1 explicitly deferred — price/discount/free-quantity override
*approval* that actually applies the approved value to the invoice item
and recomputes totals. Invoice hold/release. **`post_sales_invoice()`**:
the atomic centerpiece — re-validates stock/credit/approval against
current state (never trusts an earlier snapshot), generates the final
invoice number, allocates stock per item, creates `stock_movements`
rows, consumes the credit reservation and posts the ledger transaction,
and marks the invoice posted, all inside one `begin...exception` block
so any failure rolls back everything automatically — PL/pgSQL's
exception block is an implicit savepoint, so this needed no manual
transaction management to satisfy the doc's "if any step fails, rollback
everything" requirement. Due date calculation, retry-failed-posting,
void request foundation (snapshot-only, no reversal — reversal is
explicitly deferred to Sales Returns/Credit Notes), cancel-before-posting
extended to cancel pending approvals too. Invoice-specific print history/
error tracking. Controlled offline van posting — device/van/employee
exclusivity checks, an idempotent `reconcile_offline_van_posting()` that
calls `post_sales_invoice()` itself rather than a second posting path.
Sync conflict types extended to the fuller Part 2 list (stock, batch,
serial, credit, reservation, device-assignment, already-posted) with
`revalidate_synced_invoice()` checking all of them. 32-action permission
module, audit triggers on all 16 new tables, dashboard widgets excluding
drafts from any "finalized revenue" figure, notifications for the 20
named triggers via `*_notified()` wrappers.

**Client**: `SalesInvoiceDetailPage` extended with four new tabs (Stock,
Credit, Approvals, Posting) plus Submit-for-Approval/Post/Retry/Hold
buttons wired to the real functions above — posting shows a confirmation
before deducting real stock, and a failed posting attempt surfaces its
error and a Retry button rather than silently disappearing.

**Honest gaps**:
- No thermal/A4 print rendering — the print history/error tracking
  functions (`record_invoice_print()`, `record_invoice_print_error()`)
  exist and are callable, but no actual print template UI or physical
  print flow was built this pass.
- No controlled-offline-posting UI — `check_offline_posting_eligibility()`
  and `reconcile_offline_van_posting()` exist server-side; no client
  screen surfaces the eligibility check or triggers a local posting flow.
- No sync-conflict-resolution UI update for the new Part 2 conflict
  types (the existing `SyncConflictsPage` from 5A.2 Part 2 handles
  order conflicts; invoice conflicts have no equivalent page yet).
- No Reports UI for this phase's 30 named reports.
- Manual batch/serial override during posting isn't exposed — allocation
  always runs its default FIFO/FEFO/reservation-consumption path.

**Second follow-up pass** (same day): closed most of the remaining gaps.
- Expanded `InvoiceReportsPage` from 5 to 12 reports — added Posted Sales
  Invoice Register, Unposted Invoice, Invoice Approval, Posting Failure,
  Invoice Hold, Void Request, and Invoice Stock Movement reports, all
  built on real posted/unposted invoice data.
- New `InvoiceSyncConflictsPage`, mirroring the Sales Order version but
  for invoices, with the full Part 2 resolution set (replace batch,
  replace serial, reduce quantity with approval, convert credit to cash).
- **Print rendering** — found the app already has complete print
  infrastructure (`printReceiptViaBrowser`/`printReceiptViaBluetooth` in
  `bluetoothPrint.ts` for 58mm/80mm thermal, `printDocument()` in
  `documentPrint.ts` for A4, `usePrintSettings()` reading the existing
  `print_settings` table) built for other documents — reused all of it
  rather than building new print logic. New `PrintInvoiceModal` offers
  Browser Thermal, Bluetooth Thermal (when supported), and A4, logging
  every attempt via `record_invoice_print()`/
  `record_invoice_print_error_notified()`.

Remaining: 18 of the 30 named reports (Cash/Credit/Hybrid Invoice,
Invoice Item Draft, Route Draft, Offline Draft/Conflict, Stock
Validation, Reservation/Batch/Serial consumption reports, Credit
Validation/Conversion/Override, Print History, Reprint, Warehouse Sales,
Customer Invoice, Product/Category/Brand Sales, Tax, Discount,
Promotion), controlled-offline-posting UI (the eligibility check and
reconciliation functions exist server-side; no client screen surfaces
them), and manual batch/serial override during posting.

## Phase 5B.1 Part 1: Sales Invoice Creation, POS Billing, Invoice Entry, Order-to-Invoice Conversion, Mobile & PDT Billing

Followed the doc's "inspect before implementing" instruction. Key finding:
`sales_invoices` (this phase) is a **new, draft-only layer**, deliberately
separate from the existing `sales`/`sale_items` tables (Phase 1) which
already do immediate, stock-deducting cash van sales — that flow is
completely untouched. The two coexist: fast cash van sales keep using
`sales`; anything needing order conversion, partial conversion, or
richer multi-UOM/promotion-staged draft review uses the new
`sales_invoices`, which will be posted in a later phase.

**What's reused, not duplicated**: `resolve_customer_price()` and
`customer_discounts`/`free_quantity_rules` (the exact same pricing/
discount/promotion engine Sales Orders already use — no second pricing
engine); the Sales Order approval/reservation data itself, since
converting an order copies its **approved** price and discount verbatim
rather than re-pricing; `product_uoms`, the barcode/scan stack, and the
offline `client_uuid` idempotency pattern (all already built for Sales
Orders); `next_document_no()`'s numbering pattern, extended with an
invoice-type-aware prefix. Two small additive columns were genuinely
missing and added here: `customers.is_tax_exempt` and
`products.is_tax_exempt` — tax turned out to be a flat per-product rate
with no dedicated tax-rules table, so exemption needed its own field.

**Database** (migrations 0059–0064, 1,385 lines): `sales_invoice_types`
(17 configurable types), `sales_invoices`/`sales_invoice_items` (draft-
only, with Part-2 approval/posting/stock/credit status columns present
as a schema foundation but never written to a real value this phase —
`posting_status` even has a check constraint that only allows
`'not_posted'`, so it's structurally impossible for this phase to fake a
posted invoice). `create_sales_invoice()` + a shared
`recalculate_sales_invoice_totals()` (pricing, discount, tax-inclusive/
exclusive calculation, tax exemption, configurable round-off rules) used
by both the create and edit paths, same pattern established in 5A.2 Part
1. Full and partial Sales Order → Invoice conversion
(`convert_sales_order_to_invoice()`, `order_item_remaining_to_convert()`
guarding against over-conversion, `sales_order_conversion_summary()` for
the picker UI), correctly rolling the order to `partially_converted`/
`fully_converted`. Draft editing, cancellation (preserves history, never
deletes), unsynced-draft deletion, and repeat-invoice creation (re-
resolves current prices rather than copying stale ones, per the doc's
explicit instruction not to copy old posting/payment/approval state).
Price/discount/free-quantity request foundations (recorded, never auto-
approved — no invoice-level approval engine exists yet, that's Part 2).
Offline sync status + conflict detection/resolution mirroring the Sales
Order pattern. 23-action permission module, audit triggers, dashboard
widgets (explicitly excluded from any "finalized sales revenue" figure).

**Client**: `SalesInvoiceEntryPage` (mobile-first, walk-in customer
toggle, barcode/HID scanning reused from Sales Order Entry),
`SalesInvoicesListPage` (search/filter, inline submit/cancel/repeat),
`SalesInvoiceDetailPage` (Overview/Items/Pricing/Totals/Notes/Audit
History tabs), and a `ConvertToInvoiceModal` on the Sales Order detail
page — shows ordered/converted/cancelled/remaining per item with a
"Use Remaining" shortcut, so partial conversion is a real, informed
choice rather than a guess.

**Follow-up pass** (same day): wired notifications for all 10 named
triggers (`notify_invoice_event()` + `*_notified()` wrapper functions
around `create_sales_invoice`, `change_sales_invoice_status`, the three
override-request functions, sync failure, and conflict detection — the
client hooks now call the notified variants). Added `InvoiceReportsPage`
covering 5 of the 15 named reports (Invoice Draft Register, Order
Conversion Draft, Direct Invoice Draft, Employee Draft, Van Draft), each
explicitly labeled as draft/unposted data, never mixed with the
finalized `sales` table.

**Second follow-up pass** (same day): added a "Requests" tab to
`SalesInvoiceDetailPage` — prompt-based (matching the same pragmatic
pattern used for Sales Order amendments) flows to request a price
override, discount override, or manual free quantity per item, each
listing its own request history with status. Wired to the `*_notified()`
variants from the previous pass, so creating a request now also fires
its named notification. This time inserted the new tab with the exact
surrounding text verified via `grep` beforehand — a str_replace mistake
on this same tab-insertion pattern bit me twice earlier in this phase,
so checked the boundary text precisely before editing rather than after.

Remaining: 10 of 15 reports (Cash/Credit/Hybrid Invoice Draft, Invoice
Item Draft, Route Draft Invoice, Offline Draft Invoice, Promotion
Application, Tax Calculation Preview), PDT-specific optimizations,
Card/Mobile invoice list views, and a side-by-side multi-invoice-from-
order view.

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

**Second follow-up pass** (same day): expanded `OrderControlReportsPage`
from 6 to 11 of the 26 named reports (added Credit Reservation, Credit
Override, Price Override, Discount Override, Order Hold), and added a
"Check Availability & Allocate" action on the Stock tab's backorder list
— calls the existing `check_backorder_availability()`, and if enough
stock now exists, reserves it via `create_stock_reservation()` and marks
the backorder allocated, rather than leaving it display-only. Caught a
couple of str_replace slips again while editing (a variable assignment
and an error-type mismatch), both caught by the typecheck before commit
this time rather than needing a manual grep pass.

**Third follow-up pass** (same day): replaced the prompt-based amendment
flow with a proper `AmendOrderModal` — per-item dropdowns to reduce
quantity or remove entirely (validated so a "reduced" quantity can't be
zero or exceed the current amount), toggleable delivery-date and
payment-type changes, a required reason field, building the same
`changes` JSON payload the `create_order_amendment()` RPC always
expected, just from real form controls instead of a sequence of
`prompt()` calls.

**Fourth follow-up pass** (same day): while building the manual batch/serial
picker, found a real functional gap — the Stock tab had no way at all to
trigger reservation for a normal (non-backorder) order item; only the
backorder-allocation path ever called `create_stock_reservation()`.
Added an "Items Needing Reservation" list with an Auto Reserve action
for every unreserved item, plus a Manual Selection action for batch- or
serial-tracked products. New migration (0058) adds
`create_manual_batch_reservation()`/`create_manual_serial_reservation()`
and their `available_batches_for_item()`/`available_serials_for_item()`
lookups — a manual pick still excludes expired/blocked batches and
already-reserved serials the same way the automatic FIFO/FEFO path does,
and still requires the `select_batch`/`select_serial_numbers`/
`override_fifo_fefo` permissions the requirements doc named for this
specifically.

Remaining: 15 of 26 reports.

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
