# Van Sales ERP — Enterprise Van Sales & Distribution PWA

Multi-tenant, offline-capable Van Sales / FMCG distribution platform.
React + TypeScript + Tailwind + Supabase.

## Status: Phase 1 complete

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
- PWA: installable, offline-caches Supabase REST reads, auto-updates.

Every other module (Sales/POS, Van Loading/Unloading UI, Route Planning,
Customer Visits, Purchases, Payments, Collections, Returns, Accounting,
Reports, HR, GPS Tracking, Settings) has a route stubbed in `App.tsx` so
navigation never breaks, and the underlying schema + RPCs already exist —
only the UI remains. Build them one at a time, verifying each against
real Supabase data before moving to the next, the same way the Inventory
module was built.

## Getting started

### 1. Create a Supabase project
Create a new project at supabase.com, then run the migrations in order:

```bash
# Using the Supabase CLI, from this project's root:
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file in `supabase/migrations/` into the Supabase SQL editor,
**in numeric order** (0001 → 0007). Each file is idempotent-safe to rerun
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

1. **Van Loading / Van Unloading UI** — the schema and approval RPCs
   already exist; this unlocks stock ever reaching a van.
2. **Sales / POS** — cash/credit sales, barcode entry, split payments,
   offline queue (IndexedDB via Dexie is already a dependency).
3. **Collections & Returns** — outstanding ledger, receipt printing.
4. **Route Planning & Customer Visits** — GPS check-in/out, route sequencing.
5. **Purchases & Accounting** — supplier POs/GRNs, chart of accounts, P&L.
6. **Reports & Dashboards** — the KPI groundwork is in `DashboardPage.tsx`.
7. **PDT hardware layer** — barcode scanning (camera-based, works on any
   PDT with a rear camera without native code), Bluetooth/thermal
   printing (Web Bluetooth + ESC/POS command generation for 58mm/80mm
   and A4 templates), GPS polling into `gps_logs`.

Each phase should follow the same pattern used for Inventory: a typed
hook per entity, a form with `zod` validation, a `DataTable`-backed list
page, permission gates on every mutating action, and — for anything
touching stock or money — a `security definer` Postgres function rather
than raw client-side `update()` calls.
