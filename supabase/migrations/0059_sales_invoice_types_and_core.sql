-- ============================================================================
-- 0059_sales_invoice_types_and_core.sql
-- Phase 5B.1 Part 1: Sales Invoice Creation, POS Billing, Invoice Entry,
-- Order-to-Invoice Conversion, Mobile & PDT Billing.
--
-- sales_invoices is a NEW draft-only layer, distinct from the existing
-- `sales`/`sale_items` tables (Phase 1) which already do immediate,
-- stock-deducting cash van sales — that flow is untouched. This phase's
-- invoices are drafts that will be posted in a later phase; no stock or
-- credit posting happens here at all, per the doc's explicit scope.
--
-- Tax is confirmed to be a flat per-product/per-company rate (no
-- dedicated tax-rules table exists) — is_tax_exempt is genuinely missing
-- on both customers and products, added here as small columns rather
-- than a new tax-configuration subsystem this doc doesn't ask for.
-- ============================================================================

alter table customers add column if not exists is_tax_exempt boolean not null default false;
alter table products add column if not exists is_tax_exempt boolean not null default false;

-- ---------------------------------------------------------------------------
-- SALES INVOICE TYPES — configurable catalog, mirrors sales_order_types.
-- ---------------------------------------------------------------------------
create table sales_invoice_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  default_stock_source text not null default 'van' check (default_stock_source in ('van', 'warehouse')),
  default_payment_type text,
  order_requirement text not null default 'optional' check (order_requirement in ('required', 'optional', 'not_allowed')),
  customer_requirement text not null default 'required' check (customer_requirement in ('required', 'optional')),
  requires_approval boolean not null default false,
  requires_credit_validation boolean not null default false,
  is_tax_invoice boolean not null default true,
  default_price_list_id uuid references price_lists(id) on delete set null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_sales_invoice_types_system_code on sales_invoice_types(code) where company_id is null;
create unique index idx_sales_invoice_types_company_code on sales_invoice_types(code, company_id) where company_id is not null;

insert into sales_invoice_types (code, company_id, label, default_stock_source, default_payment_type, order_requirement, customer_requirement, requires_approval, requires_credit_validation, is_tax_invoice, is_system) values
  ('van_sales_invoice', null, 'Van Sales Invoice', 'van', 'cash', 'optional', 'required', false, false, true, true),
  ('warehouse_sales_invoice', null, 'Warehouse Sales Invoice', 'warehouse', 'credit', 'optional', 'required', true, true, true, true),
  ('cash_sale_invoice', null, 'Cash Sale Invoice', 'van', 'cash', 'not_allowed', 'optional', false, false, true, true),
  ('credit_sale_invoice', null, 'Credit Sale Invoice', 'van', 'credit', 'optional', 'required', true, true, true, true),
  ('hybrid_sale_invoice', null, 'Hybrid Sale Invoice', 'van', 'credit', 'optional', 'required', true, true, true, true),
  ('direct_invoice', null, 'Direct Invoice', 'van', 'cash', 'not_allowed', 'required', false, false, true, true),
  ('sales_order_invoice', null, 'Sales Order Invoice', 'warehouse', 'credit', 'required', 'required', false, false, true, true),
  ('partial_order_invoice', null, 'Partial Order Invoice', 'warehouse', 'credit', 'required', 'required', false, false, true, true),
  ('walk_in_invoice', null, 'Walk-In Invoice', 'van', 'cash', 'not_allowed', 'optional', false, false, true, true),
  ('emergency_invoice', null, 'Emergency Invoice', 'van', 'cash', 'not_allowed', 'required', false, false, true, true),
  ('replacement_invoice_draft', null, 'Replacement Invoice Draft', 'van', 'credit', 'not_allowed', 'required', true, false, false, true),
  ('promotional_invoice', null, 'Promotional Invoice', 'van', 'cash', 'not_allowed', 'required', false, false, true, true),
  ('sample_invoice', null, 'Sample Invoice', 'van', 'cash', 'not_allowed', 'required', false, false, false, true),
  ('proforma_invoice', null, 'Proforma Invoice', 'warehouse', 'credit', 'optional', 'required', false, false, false, true),
  ('tax_invoice', null, 'Tax Invoice', 'warehouse', 'credit', 'optional', 'required', false, false, true, true),
  ('non_tax_invoice', null, 'Non-Tax Invoice', 'warehouse', 'cash', 'optional', 'required', false, false, false, true),
  ('custom_invoice_type', null, 'Custom Invoice Type', 'van', 'credit', 'optional', 'required', false, false, true, true);

alter table sales_invoice_types enable row level security;
create policy sales_invoice_types_read on sales_invoice_types for select
  using (company_id is null or company_id = current_company_id());
create policy sales_invoice_types_write on sales_invoice_types for insert with check (company_id = current_company_id());
create policy sales_invoice_types_update on sales_invoice_types for update using (company_id = current_company_id());
create policy sales_invoice_types_delete on sales_invoice_types for delete using (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------------
create sequence if not exists sales_invoice_seq;

create or replace function next_sales_invoice_no(p_invoice_type_code text)
returns text language plpgsql as $$
declare
  v_num bigint;
  v_prefix text;
begin
  v_prefix := case p_invoice_type_code
    when 'van_sales_invoice' then 'VINV'
    when 'warehouse_sales_invoice' then 'WINV'
    when 'cash_sale_invoice' then 'CINV'
    when 'credit_sale_invoice' then 'CRINV'
    when 'hybrid_sale_invoice' then 'HINV'
    when 'direct_invoice' then 'DINV'
    when 'sales_order_invoice' then 'SOINV'
    when 'partial_order_invoice' then 'POINV'
    when 'walk_in_invoice' then 'WIINV'
    when 'emergency_invoice' then 'EINV'
    when 'replacement_invoice_draft' then 'RINV'
    when 'promotional_invoice' then 'PRINV'
    when 'sample_invoice' then 'SMINV'
    when 'proforma_invoice' then 'PFINV'
    when 'tax_invoice' then 'TINV'
    when 'non_tax_invoice' then 'NTINV'
    else 'INV'
  end;
  select nextval('sales_invoice_seq') into v_num;
  return v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_num::text, 6, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- SALES INVOICES (header) — draft-only. Approval/posting/stock/credit
-- status columns are included as a schema FOUNDATION per the doc's own
-- "Sales Invoice Table Foundation" section, but nothing writes real
-- values into posted_by/posted_date/final_invoice_number this phase —
-- they stay null until a later phase actually posts something.
-- ---------------------------------------------------------------------------
create table sales_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  branch_id uuid references warehouses(id) on delete set null,
  invoice_number text not null,
  is_manual_number boolean not null default false,
  temporary_number text,
  invoice_type_id uuid not null references sales_invoice_types(id),
  invoice_date date not null default current_date,
  invoice_time timestamptz not null default now(),
  customer_id uuid references customers(id) on delete restrict,
  walk_in_name text,
  walk_in_phone text,
  walk_in_address text,
  walk_in_tax_number text,
  billing_address_id uuid references customer_addresses(id) on delete set null,
  delivery_address_id uuid references customer_addresses(id) on delete set null,
  contact_person text,
  customer_tax_number text,
  customer_reference text,
  customer_po text,
  sales_order_id uuid references sales_orders(id) on delete set null,
  customer_visit_id uuid references customer_visits(id) on delete set null,
  daily_visit_plan_id uuid references daily_visit_plans(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  beat_plan_id uuid references beat_plans(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  warehouse_id uuid references warehouses(id) on delete set null,
  salesman_id uuid references app_users(id) on delete set null,
  invoice_source text not null default 'web' check (invoice_source in ('web', 'mobile', 'pdt', 'offline', 'imported')),
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  price_list_id uuid references price_lists(id) on delete set null,
  payment_type text not null default 'cash' check (payment_type in ('cash', 'credit', 'hybrid')),
  payment_term_id uuid references payment_terms(id) on delete set null,
  expected_cash_portion numeric(14,2) not null default 0,
  expected_credit_portion numeric(14,2) not null default 0,
  delivery_date date,
  delivery_time_window text,
  status text not null default 'draft' check (status in (
    'draft', 'pending_submission', 'submitted', 'returned_for_correction', 'cancelled_before_posting',
    'expired', 'sync_pending', 'sync_failed', 'conflict'
  )),
  approval_status text not null default 'not_required',
  posting_status text not null default 'not_posted' check (posting_status = 'not_posted'),
  stock_status text not null default 'not_applicable',
  credit_status text not null default 'not_applicable',
  posted_by uuid references app_users(id),
  posted_date timestamptz,
  final_invoice_number text,
  is_direct_invoice boolean not null default true,
  direct_invoice_source text check (direct_invoice_source in ('office', 'phone', 'warehouse', 'van', 'walk_in', 'emergency', 'repeat_invoice') or direct_invoice_source is null),
  repeat_of_invoice_id uuid references sales_invoices(id) on delete set null,
  client_uuid text,
  device_uid text,
  tax_inclusive boolean not null default false,
  round_off_rule text not null default 'nearest_whole' check (round_off_rule in ('none', 'nearest_whole', 'nearest_0_05', 'nearest_0_10', 'custom')),
  gross_amount numeric(14,2) not null default 0,
  item_discount_amount numeric(14,2) not null default 0,
  invoice_discount_amount numeric(14,2) not null default 0,
  promotion_discount_amount numeric(14,2) not null default 0,
  taxable_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  round_off numeric(8,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  total_quantity numeric(14,3) not null default 0,
  total_free_quantity numeric(14,3) not null default 0,
  total_base_quantity numeric(14,3) not null default 0,
  total_weight numeric(12,3) not null default 0,
  total_volume numeric(12,3) not null default 0,
  notes text,
  internal_notes text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, invoice_number),
  unique (company_id, client_uuid)
);
create index idx_sales_invoices_company_date on sales_invoices(company_id, invoice_date);
create index idx_sales_invoices_customer on sales_invoices(customer_id);
create index idx_sales_invoices_status on sales_invoices(company_id, status);
create index idx_sales_invoices_sales_order on sales_invoices(sales_order_id);
create index idx_sales_invoices_van on sales_invoices(van_id);

alter table sales_invoices enable row level security;
create policy sales_invoices_isolation on sales_invoices for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_sales_invoices_updated_at before update on sales_invoices
  for each row execute function set_updated_at();

create table sales_invoice_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  batch_id uuid references batches(id) on delete set null,
  unit_id uuid not null references units(id),
  barcode text,
  sku text,
  description text,
  conversion_factor numeric(12,4) not null default 1,
  invoice_quantity numeric(14,3) not null check (invoice_quantity > 0),
  base_quantity numeric(14,3) not null,
  free_quantity numeric(14,3) not null default 0,
  approved_free_quantity numeric(14,3),
  original_price numeric(12,2) not null,
  applied_price numeric(12,2) not null,
  price_source text,
  order_approved_price numeric(12,2),
  discount_pct numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  promotion_discount_amount numeric(12,2) not null default 0,
  discount_source text,
  tax_rate numeric(5,2) not null default 0,
  is_tax_exempt boolean not null default false,
  tax_exempt_reason text,
  tax_inclusive boolean not null default false,
  taxable_amount numeric(14,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  is_free_item boolean not null default false,
  free_quantity_rule_id uuid references free_quantity_rules(id) on delete set null,
  expected_stock_source text check (expected_stock_source in ('van', 'warehouse') or expected_stock_source is null),
  order_item_id uuid references sales_order_items(id) on delete set null,
  item_notes text,
  item_status text not null default 'active' check (item_status in ('active', 'removed')),
  sequence integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_sales_invoice_items_invoice on sales_invoice_items(invoice_id);
create index idx_sales_invoice_items_product on sales_invoice_items(product_id);
create index idx_sales_invoice_items_order_item on sales_invoice_items(order_item_id);

alter table sales_invoice_items enable row level security;
create policy sales_invoice_items_isolation on sales_invoice_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  old_status text, new_status text not null, reason text,
  changed_by uuid references app_users(id), changed_at timestamptz not null default now()
);
create index idx_sales_invoice_status_history_invoice on sales_invoice_status_history(invoice_id);

alter table sales_invoice_status_history enable row level security;
create policy sales_invoice_status_history_isolation on sales_invoice_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function change_sales_invoice_status(p_invoice_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old text;
  v_company_id uuid;
  v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from sales_invoices where id = p_invoice_id;
  if v_old is null then raise exception 'Invoice not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_submission', 'submitted', 'cancelled_before_posting', 'expired', 'sync_pending')
    when 'pending_submission' then p_new_status in ('submitted', 'returned_for_correction', 'cancelled_before_posting', 'draft')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_submission', 'cancelled_before_posting')
    when 'sync_pending' then p_new_status in ('submitted', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled_before_posting')
    when 'conflict' then p_new_status in ('draft', 'sync_pending', 'cancelled_before_posting')
    when 'submitted' then p_new_status in ('cancelled_before_posting', 'expired')
    when 'cancelled_before_posting' then false
    when 'expired' then p_new_status in ('draft')
    else false
  end;
  if not v_valid then raise exception 'Cannot move invoice from % to %', v_old, p_new_status; end if;

  update sales_invoices set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_invoice_id;
  insert into sales_invoice_status_history (company_id, invoice_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_invoice_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_sales_invoice_status(uuid, text, text) to authenticated;
