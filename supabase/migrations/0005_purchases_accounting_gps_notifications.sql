-- ============================================================================
-- 0005_purchases_accounting_gps_notifications.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PURCHASES
-- ---------------------------------------------------------------------------
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  po_no text not null,
  supplier_id uuid not null references suppliers(id),
  warehouse_id uuid not null references warehouses(id),
  status text not null default 'draft' check (status in ('draft','sent','partially_received','received','cancelled')),
  total_amount numeric(14,2) not null default 0,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique(company_id, po_no)
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null,
  received_quantity numeric(14,3) not null default 0
);

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  grn_no text not null,
  po_id uuid references purchase_orders(id) on delete set null,
  supplier_id uuid not null references suppliers(id),
  warehouse_id uuid not null references warehouses(id),
  supplier_invoice_no text,
  received_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique(company_id, grn_no)
);

create table goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references goods_receipts(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null
);

create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid not null references suppliers(id),
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','bank','cheque')),
  reference_no text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ACCOUNTING (chart of accounts + double-entry ledger)
-- ---------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','income','expense')),
  parent_id uuid references accounts(id) on delete set null,
  is_active boolean not null default true,
  unique(company_id, code)
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  entry_no text not null,
  entry_date date not null default current_date,
  reference_table text,
  reference_id uuid,
  description text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique(company_id, entry_no)
);

create table journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references journal_entries(id) on delete cascade,
  account_id uuid not null references accounts(id),
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  check (debit = 0 or credit = 0)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  expense_no text not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_via text not null check (paid_via in ('cash','bank')),
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique(company_id, expense_no)
);

-- ---------------------------------------------------------------------------
-- GPS TRACKING
-- ---------------------------------------------------------------------------
create table gps_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid references vans(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  speed_kmh numeric(6,2),
  heading numeric(6,2),
  recorded_at timestamptz not null default now()
);
create index idx_gps_logs_van_time on gps_logs(van_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references app_users(id) on delete cascade,
  type text not null check (type in (
    'stock_alert','expiry_alert','collection_reminder','route_reminder',
    'loading_reminder','approval_notification','system'
  )),
  title text not null,
  message text not null,
  is_read boolean not null default false,
  reference_table text,
  reference_id uuid,
  created_at timestamptz not null default now()
);
create index idx_notifications_user_unread on notifications(user_id, is_read);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'purchase_orders','goods_receipts','supplier_payments','accounts',
    'journal_entries','expenses','gps_logs','notifications'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_isolation on %I for all using (company_id = current_company_id()) with check (company_id = current_company_id())', t, t);
  end loop;
end $$;

alter table purchase_order_items enable row level security;
create policy purchase_order_items_isolation on purchase_order_items for all
  using (exists (select 1 from purchase_orders po where po.id = po_id and po.company_id = current_company_id()))
  with check (exists (select 1 from purchase_orders po where po.id = po_id and po.company_id = current_company_id()));

alter table goods_receipt_items enable row level security;
create policy goods_receipt_items_isolation on goods_receipt_items for all
  using (exists (select 1 from goods_receipts g where g.id = grn_id and g.company_id = current_company_id()))
  with check (exists (select 1 from goods_receipts g where g.id = grn_id and g.company_id = current_company_id()));

alter table journal_entry_lines enable row level security;
create policy journal_entry_lines_isolation on journal_entry_lines for all
  using (exists (select 1 from journal_entries j where j.id = entry_id and j.company_id = current_company_id()))
  with check (exists (select 1 from journal_entries j where j.id = entry_id and j.company_id = current_company_id()));
