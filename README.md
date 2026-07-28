# Van Sales ERP — Enterprise Van Sales & Distribution PWA

Multi-tenant, offline-capable Van Sales / FMCG distribution platform.
React + TypeScript + Tailwind + Supabase.

## Status: Phase 4 complete (Foundation + Inventory/Warehouse + Van Loading/Unloading + Sales/POS + Collections/Returns)

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
- PWA: installable, offline-caches Supabase REST reads, auto-updates.

Every other module (Route Planning, Customer Visits, Purchases,
Payments, Accounting, Reports, HR, GPS Tracking, Settings) has a route
stubbed in `App.tsx` so navigation never breaks, and the underlying
schema + RPCs already exist — only the UI remains. Build them one at a
time, verifying each against real Supabase data before moving to the
next, the same way every module so far was built.

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
**in numeric order** (0001 → 0009). Each file is idempotent-safe to rerun
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

### 4. Create your first company
Go to `/register` — this calls `bootstrap_company()`, which creates the
tenant row, clones the 10 system roles with their default permission
grants, and makes you `company_admin`. From there:

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

1. **Route Planning & Customer Visits** — GPS check-in/out, route sequencing.
2. **Purchases & Accounting** — supplier POs/GRNs, chart of accounts, P&L.
3. **Reports & Dashboards** — the KPI groundwork is in `DashboardPage.tsx`.
4. **PDT hardware layer** — barcode scanning (camera-based, works on any
   PDT with a rear camera without native code), Bluetooth/thermal
   printing (Web Bluetooth + ESC/POS command generation for 58mm/80mm
   and A4 templates), GPS polling into `gps_logs`.

Each phase should follow the same pattern used so far: a typed hook per
entity, a form with `zod` validation, a `DataTable`-backed list page,
permission gates on every mutating action, and — for anything touching
stock or money — a single atomic `security definer` Postgres function
(see `create_sale` for the fullest example) rather than composing the
operation from several separate client-side calls.
