-- ============================================================================
-- 0002_products_warehouses_vans.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CATALOG: categories, brands, units, products, variants
-- ---------------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  parent_id uuid references categories(id) on delete set null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_categories_company on categories(company_id);

create table brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_brands_company on brands(company_id);

create table units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,        -- e.g. Carton, Piece, Kg, Liter
  symbol text not null,      -- e.g. CTN, PC, KG, L
  created_at timestamptz not null default now(),
  unique(company_id, symbol)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms_days int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_suppliers_company on suppliers(company_id);

create table products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  brand_id uuid references brands(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  base_unit_id uuid not null references units(id),
  sku text not null,
  name text not null,
  description text,
  barcode text,
  qr_code text,
  image_url text,
  weight numeric(10,3),
  volume numeric(10,3),
  cost_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0,
  wholesale_price numeric(12,2),
  retail_price numeric(12,2),
  offer_price numeric(12,2),
  tax_rate numeric(5,2) not null default 0,
  min_stock numeric(12,3) not null default 0,
  max_stock numeric(12,3),
  track_batches boolean not null default false,
  track_expiry boolean not null default false,
  track_serials boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, sku)
);
create index idx_products_company on products(company_id);
create index idx_products_barcode on products(company_id, barcode);
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

-- Alternate units of measure per product (e.g. Carton = 24 Pieces)
create table product_uoms (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  unit_id uuid not null references units(id),
  conversion_factor numeric(12,4) not null default 1, -- qty of base_unit per this unit
  barcode text,
  selling_price numeric(12,2),
  is_default_sale_unit boolean not null default false,
  unique(product_id, unit_id)
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_name text not null, -- e.g. "500ml", "Red"
  sku_suffix text,
  price_delta numeric(12,2) not null default 0,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- WAREHOUSES
-- ---------------------------------------------------------------------------
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  manager_id uuid references app_users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);
create index idx_warehouses_company on warehouses(company_id);

-- Batch / lot tracking (shared by warehouse & van stock)
create table batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_no text not null,
  lot_no text,
  manufacture_date date,
  expiry_date date,
  cost_price numeric(12,2),
  created_at timestamptz not null default now(),
  unique(company_id, product_id, batch_no)
);
create index idx_batches_expiry on batches(company_id, expiry_date);

create table product_serials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  serial_no text not null,
  status text not null default 'in_stock' check (status in ('in_stock','sold','damaged','lost','returned')),
  current_location_type text check (current_location_type in ('warehouse','van')),
  current_location_id uuid,
  created_at timestamptz not null default now(),
  unique(company_id, product_id, serial_no)
);

-- Warehouse stock (on-hand, per product per batch)
create table warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  quantity numeric(14,3) not null default 0,
  reserved_quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique(warehouse_id, product_id, batch_id)
);
create index idx_warehouse_stock_product on warehouse_stock(company_id, product_id);
create trigger trg_warehouse_stock_updated_at before update on warehouse_stock
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- VANS
-- ---------------------------------------------------------------------------
create table vans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  registration_no text,
  insurance_expiry date,
  home_warehouse_id uuid references warehouses(id) on delete set null,
  driver_id uuid references app_users(id) on delete set null,
  salesman_id uuid references app_users(id) on delete set null,
  status text not null default 'active' check (status in ('active','maintenance','inactive')),
  current_latitude numeric(9,6),
  current_longitude numeric(9,6),
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, code)
);
create index idx_vans_company on vans(company_id);
create trigger trg_vans_updated_at before update on vans
  for each row execute function set_updated_at();

create table van_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  log_type text not null check (log_type in ('maintenance','fuel')),
  odometer_km numeric(10,1),
  cost numeric(12,2),
  liters numeric(10,2),
  description text,
  logged_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- Van stock (mirrors warehouse_stock structure, per van)
create table van_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique(van_id, product_id, batch_id)
);
create index idx_van_stock_product on van_stock(company_id, product_id);
create trigger trg_van_stock_updated_at before update on van_stock
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- STOCK MOVEMENTS (single source of truth ledger for every stock change)
-- ---------------------------------------------------------------------------
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  movement_type text not null check (movement_type in (
    'purchase_in','warehouse_transfer','van_load','van_unload','sale_out',
    'sales_return_in','purchase_return_out','adjustment','damage','loss','opening_stock'
  )),
  from_location_type text check (from_location_type in ('warehouse','van','supplier','customer','none')),
  from_location_id uuid,
  to_location_type text check (to_location_type in ('warehouse','van','supplier','customer','none')),
  to_location_id uuid,
  quantity numeric(14,3) not null,
  reference_table text,   -- e.g. 'sales', 'van_loadings', 'stock_adjustments'
  reference_id uuid,
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_stock_movements_company_product on stock_movements(company_id, product_id, created_at desc);
create index idx_stock_movements_reference on stock_movements(reference_table, reference_id);

-- ---------------------------------------------------------------------------
-- STOCK ADJUSTMENTS / COUNTING / DAMAGE / LOST
-- ---------------------------------------------------------------------------
create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_type text not null check (location_type in ('warehouse','van')),
  location_id uuid not null,
  adjustment_type text not null check (adjustment_type in ('count','damage','loss','correction')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,
  created_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table stock_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references stock_adjustments(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  system_quantity numeric(14,3) not null default 0,
  counted_quantity numeric(14,3) not null default 0,
  difference numeric(14,3) generated always as (counted_quantity - system_quantity) stored
);

-- ---------------------------------------------------------------------------
-- WAREHOUSE-TO-WAREHOUSE TRANSFERS
-- ---------------------------------------------------------------------------
create table warehouse_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  transfer_no text not null,
  from_warehouse_id uuid not null references warehouses(id),
  to_warehouse_id uuid not null references warehouses(id),
  status text not null default 'pending' check (status in ('pending','in_transit','completed','cancelled')),
  created_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(company_id, transfer_no)
);

create table warehouse_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references warehouse_transfers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0)
);

-- ---------------------------------------------------------------------------
-- RLS: standard "company_id = current_company_id()" policy for every table above
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories','brands','units','suppliers','products','warehouses','batches',
    'product_serials','warehouse_stock','vans','van_maintenance_logs','van_stock',
    'stock_movements','stock_adjustments','warehouse_transfers'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_isolation on %I for all using (company_id = current_company_id()) with check (company_id = current_company_id())', t, t);
  end loop;
end $$;

-- child tables without their own company_id: scope via parent
alter table product_uoms enable row level security;
create policy product_uoms_isolation on product_uoms for all
  using (exists (select 1 from products p where p.id = product_id and p.company_id = current_company_id()))
  with check (exists (select 1 from products p where p.id = product_id and p.company_id = current_company_id()));

alter table product_variants enable row level security;
create policy product_variants_isolation on product_variants for all
  using (exists (select 1 from products p where p.id = product_id and p.company_id = current_company_id()))
  with check (exists (select 1 from products p where p.id = product_id and p.company_id = current_company_id()));

alter table stock_adjustment_items enable row level security;
create policy stock_adjustment_items_isolation on stock_adjustment_items for all
  using (exists (select 1 from stock_adjustments a where a.id = adjustment_id and a.company_id = current_company_id()))
  with check (exists (select 1 from stock_adjustments a where a.id = adjustment_id and a.company_id = current_company_id()));

alter table warehouse_transfer_items enable row level security;
create policy warehouse_transfer_items_isolation on warehouse_transfer_items for all
  using (exists (select 1 from warehouse_transfers wt where wt.id = transfer_id and wt.company_id = current_company_id()))
  with check (exists (select 1 from warehouse_transfers wt where wt.id = transfer_id and wt.company_id = current_company_id()));
