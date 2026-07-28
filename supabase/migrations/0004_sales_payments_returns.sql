-- ============================================================================
-- 0004_sales_payments_returns.sql
-- ============================================================================

create sequence if not exists sales_invoice_seq;

create table sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_no text not null,
  customer_id uuid references customers(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  salesman_id uuid references app_users(id) on delete set null,
  visit_id uuid references customer_visits(id) on delete set null,
  sale_type text not null default 'cash' check (sale_type in ('cash','credit','pos')),
  channel text not null default 'van' check (channel in ('van','pos','offline')),
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  round_off numeric(6,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  balance_amount numeric(14,2) generated always as (total_amount - paid_amount) stored,
  status text not null default 'completed' check (status in ('draft','completed','void')),
  synced boolean not null default true, -- false = created offline, pending sync
  client_uuid text, -- offline-generated idempotency key
  latitude numeric(9,6),
  longitude numeric(9,6),
  signature_url text,
  created_at timestamptz not null default now(),
  unique(company_id, invoice_no),
  unique(company_id, client_uuid)
);
create index idx_sales_company_date on sales(company_id, created_at desc);
create index idx_sales_customer on sales(customer_id);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  unit_id uuid references units(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  discount_pct numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  is_free_item boolean not null default false,
  line_total numeric(14,2) not null default 0
);
create index idx_sale_items_sale on sale_items(sale_id);

create table sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  method text not null check (method in ('cash','card','bank','upi','wallet','cheque')),
  amount numeric(14,2) not null check (amount > 0),
  reference_no text,
  created_at timestamptz not null default now()
);

create table schemes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  scheme_type text not null check (scheme_type in ('discount','buy_x_get_y','free_item')),
  product_id uuid references products(id) on delete cascade,
  buy_quantity numeric(12,3),
  free_quantity numeric(12,3),
  discount_pct numeric(5,2),
  starts_at date,
  ends_at date,
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- COLLECTIONS (outstanding receivables)
-- ---------------------------------------------------------------------------
create table collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_no text not null,
  customer_id uuid not null references customers(id) on delete cascade,
  collected_by uuid references app_users(id) on delete set null,
  method text not null check (method in ('cash','card','bank','cheque','pdc')),
  amount numeric(14,2) not null check (amount > 0),
  reference_no text,
  cheque_date date,
  applied_to_sale_id uuid references sales(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique(company_id, receipt_no)
);
create index idx_collections_customer on collections(customer_id);

-- ---------------------------------------------------------------------------
-- RETURNS
-- ---------------------------------------------------------------------------
create table returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_no text not null,
  return_type text not null check (return_type in ('sales_return','purchase_return','damage','expiry','replacement')),
  reference_sale_id uuid references sales(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,
  location_type text check (location_type in ('warehouse','van')),
  location_id uuid,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note_type text check (note_type in ('credit_note','debit_note')),
  total_amount numeric(14,2) not null default 0,
  created_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(company_id, return_no)
);

create table return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(14,2) not null default 0
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sales','schemes','collections','returns']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_isolation on %I for all using (company_id = current_company_id()) with check (company_id = current_company_id())', t, t);
  end loop;
end $$;

alter table sale_items enable row level security;
create policy sale_items_isolation on sale_items for all
  using (exists (select 1 from sales s where s.id = sale_id and s.company_id = current_company_id()))
  with check (exists (select 1 from sales s where s.id = sale_id and s.company_id = current_company_id()));

alter table sale_payments enable row level security;
create policy sale_payments_isolation on sale_payments for all
  using (exists (select 1 from sales s where s.id = sale_id and s.company_id = current_company_id()))
  with check (exists (select 1 from sales s where s.id = sale_id and s.company_id = current_company_id()));

alter table return_items enable row level security;
create policy return_items_isolation on return_items for all
  using (exists (select 1 from returns r where r.id = return_id and r.company_id = current_company_id()))
  with check (exists (select 1 from returns r where r.id = return_id and r.company_id = current_company_id()));

-- ---------------------------------------------------------------------------
-- Auto-generate invoice / receipt / return numbers per company (atomic, gapless-enough)
-- ---------------------------------------------------------------------------
create or replace function next_document_no(p_company_id uuid, p_prefix text, p_seq_name text)
returns text language plpgsql as $$
declare
  v_num bigint;
begin
  execute format('select nextval(%L)', p_seq_name) into v_num;
  return p_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_num::text, 6, '0');
end;
$$;
