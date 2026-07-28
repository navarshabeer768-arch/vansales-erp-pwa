-- ============================================================================
-- 0003_customers_routes_van_loading.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
create table customer_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  default_discount_pct numeric(5,2) not null default 0
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_code text not null,
  business_name text not null,
  customer_type text not null default 'retail' check (customer_type in
    ('retail','wholesale','supermarket','hypermarket','restaurant','hotel','pharmacy')),
  group_id uuid references customer_groups(id) on delete set null,
  credit_limit numeric(14,2) not null default 0,
  outstanding_balance numeric(14,2) not null default 0,
  price_level text not null default 'retail' check (price_level in ('retail','wholesale','selling','offer')),
  latitude numeric(9,6),
  longitude numeric(9,6),
  address text,
  tax_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, customer_code)
);
create index idx_customers_company on customers(company_id);
create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();

create table customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  contact_name text not null,
  phone text,
  email text,
  designation text,
  is_primary boolean not null default false
);

-- ---------------------------------------------------------------------------
-- ROUTES
-- ---------------------------------------------------------------------------
create table routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  frequency text not null default 'daily' check (frequency in ('daily','weekly','monthly')),
  van_id uuid references vans(id) on delete set null,
  salesman_id uuid references app_users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);

create table route_customers (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  visit_sequence int not null default 0,
  day_of_week int, -- 0=Sun..6=Sat, null = every scheduled day
  unique(route_id, customer_id)
);

-- ---------------------------------------------------------------------------
-- CUSTOMER VISITS
-- ---------------------------------------------------------------------------
create table customer_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  customer_id uuid not null references customers(id) on delete cascade,
  salesman_id uuid references app_users(id) on delete set null,
  visit_date date not null default current_date,
  check_in_at timestamptz,
  check_in_lat numeric(9,6),
  check_in_lng numeric(9,6),
  check_in_photo_url text,
  check_out_at timestamptz,
  check_out_lat numeric(9,6),
  check_out_lng numeric(9,6),
  status text not null default 'planned' check (status in ('planned','checked_in','completed','missed')),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_customer_visits_company_date on customer_visits(company_id, visit_date);

-- ---------------------------------------------------------------------------
-- VAN LOADING
-- ---------------------------------------------------------------------------
create table van_loadings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  loading_no text not null,
  van_id uuid not null references vans(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected')),
  signature_url text,
  created_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, loading_no)
);

create table van_loading_items (
  id uuid primary key default gen_random_uuid(),
  loading_id uuid not null references van_loadings(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  expiry_date date,
  quantity_requested numeric(14,3) not null,
  quantity_verified numeric(14,3)
);

-- ---------------------------------------------------------------------------
-- VAN UNLOADING
-- ---------------------------------------------------------------------------
create table van_unloadings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  unloading_no text not null,
  van_id uuid not null references vans(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected')),
  created_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, unloading_no)
);

create table van_unloading_items (
  id uuid primary key default gen_random_uuid(),
  unloading_id uuid not null references van_unloadings(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  item_type text not null check (item_type in ('remaining','damaged','expired','customer_return')),
  quantity numeric(14,3) not null,
  system_quantity numeric(14,3),
  difference numeric(14,3) generated always as (quantity - coalesce(system_quantity, quantity)) stored
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'customer_groups','customers','routes','customer_visits','van_loadings','van_unloadings'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_isolation on %I for all using (company_id = current_company_id()) with check (company_id = current_company_id())', t, t);
  end loop;
end $$;

alter table customer_contacts enable row level security;
create policy customer_contacts_isolation on customer_contacts for all
  using (exists (select 1 from customers c where c.id = customer_id and c.company_id = current_company_id()))
  with check (exists (select 1 from customers c where c.id = customer_id and c.company_id = current_company_id()));

alter table route_customers enable row level security;
create policy route_customers_isolation on route_customers for all
  using (exists (select 1 from routes r where r.id = route_id and r.company_id = current_company_id()))
  with check (exists (select 1 from routes r where r.id = route_id and r.company_id = current_company_id()));

alter table van_loading_items enable row level security;
create policy van_loading_items_isolation on van_loading_items for all
  using (exists (select 1 from van_loadings v where v.id = loading_id and v.company_id = current_company_id()))
  with check (exists (select 1 from van_loadings v where v.id = loading_id and v.company_id = current_company_id()));

alter table van_unloading_items enable row level security;
create policy van_unloading_items_isolation on van_unloading_items for all
  using (exists (select 1 from van_unloadings v where v.id = unloading_id and v.company_id = current_company_id()))
  with check (exists (select 1 from van_unloadings v where v.id = unloading_id and v.company_id = current_company_id()));
