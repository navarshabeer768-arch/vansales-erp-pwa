# Van Sales ERP — Enterprise Van Sales & Distribution PWA

Multi-tenant, offline-capable Van Sales / FMCG distribution platform.
React + TypeScript + Tailwind + Supabase.

## Status: Phase 6 complete (Foundation + Inventory/Warehouse + Van Loading/Unloading + Sales/POS + Collections/Returns + Route Planning/Customer Visits + Purchases/Accounting)

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

Every other module (Payments, Reports, HR, GPS Tracking, Settings) has
a route stubbed in `App.tsx` so navigation never breaks. Payments is
largely covered already by Collections (customer-side) and Goods
Receipts (supplier-side cost is captured there); a dedicated Payments
module would mainly add supplier-payment tracking against
`supplier_payments`, which already exists in the schema.

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
**in numeric order** (0001 → 0016). Each file is idempotent-safe to rerun
individually but the whole set must run in order once.

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
   either works.
2. In the Supabase dashboard, go to **Authentication → Users** and copy
   your user's UUID.
3. In the SQL Editor, run:
   ```sql
   insert into platform_admins (user_id, note)
   values ('<your-user-uuid>', 'platform owner');
   ```
4. Sign in at the **platform admin login** — exact link:
   `https://navarshabeer768-arch.github.io/vansales-erp-pwa/#/platform-admin/login`
   (or `http://localhost:5173/platform-admin/login` in dev) — using the
   same email/password from step 1. Bookmark this; it's never linked
   from anywhere in the tenant app. `/register` is now closed for
   everyone but you'll never need it again.

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

## What's next (build order recommendation)

1. **Reports & Dashboards** — the KPI groundwork is in `DashboardPage.tsx`;
   extend it with the report list from the original spec (sales by
   salesman/route/customer, inventory/expiry/damage reports, stock
   movement ledger) as filtered views over tables that already exist.
2. **Payments** (supplier-side) — a thin CRUD over the existing
   `supplier_payments` table, plus reducing whatever payable balance you
   choose to track (the schema doesn't currently accrue an AP balance
   the way `customers.outstanding_balance` does for AR — add that column
   if you want supplier payments to net against it automatically).
3. **PDT hardware layer** — barcode scanning (camera-based, works on any
   PDT with a rear camera without native code), Bluetooth/thermal
   printing (Web Bluetooth + ESC/POS command generation for 58mm/80mm
   and A4 templates), GPS polling into `gps_logs` (the Geolocation
   pattern from Customer Visits extends directly to a background
   watchPosition poll for live van tracking).

Each phase should follow the same pattern used so far: a typed hook per
entity, a form with `zod` validation, a `DataTable`-backed list page,
permission gates on every mutating action, and — for anything touching
stock or money — a single atomic `security definer` Postgres function
(see `create_sale` for the fullest example) rather than composing the
operation from several separate client-side calls.
