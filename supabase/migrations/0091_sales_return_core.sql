-- ============================================================================
-- 0091_sales_return_core.sql
-- Phase 5B.3 Part 1: Sales Return Entry, Return Validation, Damaged/Expired
-- Return Entry, Replacement Request Foundation, Mobile & PDT Return Entry.
--
-- sales_returns is a NEW draft-only layer, distinct from the existing
-- returns/return_items tables (Phase 1). product_uoms/units (Phase 1)
-- are reused for multi-UOM validation, not duplicated.
-- ============================================================================

create table sales_return_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  invoice_required boolean not null default true,
  requires_approval boolean not null default false,
  batch_required boolean not null default false,
  serial_required boolean not null default false,
  inspection_required boolean not null default true,
  stock_destination text not null default 'pending_inspection' check (stock_destination in ('saleable', 'damaged', 'expired', 'pending_inspection', 'scrap')),
  credit_note_eligible boolean not null default true,
  replacement_eligible boolean not null default true,
  offline_entry_allowed boolean not null default true,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_sales_return_types_system_code on sales_return_types(code) where company_id is null;
create unique index idx_sales_return_types_company_code on sales_return_types(code, company_id) where company_id is not null;

insert into sales_return_types (code, company_id, label, requires_approval, batch_required, inspection_required, stock_destination, replacement_eligible, is_system) values
  ('sales_return', null, 'Sales Return', false, false, true, 'pending_inspection', true, true),
  ('invoice_return', null, 'Invoice Return', false, false, true, 'pending_inspection', true, true),
  ('partial_return', null, 'Partial Return', false, false, true, 'pending_inspection', true, true),
  ('full_invoice_return', null, 'Full Invoice Return', false, false, true, 'pending_inspection', true, true),
  ('good_stock_return', null, 'Good Stock Return', false, false, true, 'saleable', false, true),
  ('damaged_product_return', null, 'Damaged Product Return', false, false, false, 'damaged', false, true),
  ('expired_product_return', null, 'Expired Product Return', false, true, false, 'expired', false, true),
  ('wrong_product_return', null, 'Wrong Product Return', false, false, true, 'pending_inspection', true, true),
  ('quality_complaint_return', null, 'Quality Complaint Return', true, false, true, 'pending_inspection', true, true),
  ('customer_rejection', null, 'Customer Rejection', false, false, true, 'pending_inspection', false, true),
  ('delivery_refusal', null, 'Delivery Refusal', false, false, true, 'pending_inspection', false, true),
  ('short_delivery_claim', null, 'Short-Delivery Claim', true, false, false, 'pending_inspection', false, true),
  ('excess_delivery_return', null, 'Excess-Delivery Return', true, false, true, 'pending_inspection', false, true),
  ('replacement_request', null, 'Replacement Request', false, false, true, 'pending_inspection', true, true),
  ('promotional_item_return', null, 'Promotional Item Return', false, false, true, 'pending_inspection', false, true),
  ('free_item_return', null, 'Free Item Return', false, false, true, 'pending_inspection', false, true),
  ('return_without_invoice', null, 'Return Without Invoice', true, false, true, 'pending_inspection', false, true),
  ('custom_return_type', null, 'Custom Return Type', false, false, true, 'pending_inspection', true, true);
update sales_return_types set invoice_required = false where code in ('return_without_invoice', 'good_stock_return', 'damaged_product_return');

alter table sales_return_types enable row level security;
create policy sales_return_types_read on sales_return_types for select
  using (company_id is null or company_id = current_company_id());
create policy sales_return_types_write on sales_return_types for insert with check (company_id = current_company_id());
create policy sales_return_types_update on sales_return_types for update using (company_id = current_company_id());
create policy sales_return_types_delete on sales_return_types for delete using (company_id = current_company_id());

create table sales_return_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  requires_approval boolean not null default false,
  requires_inspection boolean not null default true,
  allowed_return_period_days integer,
  stock_destination text check (stock_destination in ('saleable', 'damaged', 'expired', 'pending_inspection', 'scrap')),
  credit_note_eligible boolean not null default true,
  replacement_eligible boolean not null default true,
  requires_notes boolean not null default false,
  requires_manager_review boolean not null default false,
  is_active boolean not null default true
);
create unique index idx_sales_return_reasons_system_code on sales_return_reasons(code) where company_id is null;
create unique index idx_sales_return_reasons_company_code on sales_return_reasons(code, company_id) where company_id is not null;

insert into sales_return_reasons (code, company_id, label, requires_approval, stock_destination, requires_notes, requires_manager_review) values
  ('wrong_item_supplied', null, 'Wrong Item Supplied', false, 'pending_inspection', false, false),
  ('wrong_quantity', null, 'Wrong Quantity', false, 'pending_inspection', false, false),
  ('product_damaged', null, 'Product Damaged', false, 'damaged', false, false),
  ('product_expired', null, 'Product Expired', false, 'expired', false, false),
  ('near_expiry', null, 'Near Expiry', false, 'pending_inspection', false, false),
  ('quality_complaint', null, 'Quality Complaint', true, 'pending_inspection', true, true),
  ('customer_changed_mind', null, 'Customer Changed Mind', false, 'saleable', false, false),
  ('customer_closed', null, 'Customer Closed', false, 'pending_inspection', false, false),
  ('delivery_refused', null, 'Delivery Refused', false, 'saleable', false, false),
  ('pricing_dispute', null, 'Pricing Dispute', true, 'pending_inspection', true, true),
  ('duplicate_delivery', null, 'Duplicate Delivery', false, 'saleable', false, false),
  ('excess_delivery', null, 'Excess Delivery', true, 'pending_inspection', false, false),
  ('product_not_moving', null, 'Product Not Moving', false, 'saleable', false, false),
  ('promotion_dispute', null, 'Promotion Dispute', true, 'pending_inspection', true, true),
  ('batch_issue', null, 'Batch Issue', false, 'pending_inspection', false, false),
  ('packaging_issue', null, 'Packaging Issue', false, 'pending_inspection', false, false),
  ('other', null, 'Other', false, 'pending_inspection', true, false);

alter table sales_return_reasons enable row level security;
create policy sales_return_reasons_read on sales_return_reasons for select
  using (company_id is null or company_id = current_company_id());
create policy sales_return_reasons_write on sales_return_reasons for insert with check (company_id = current_company_id());
create policy sales_return_reasons_update on sales_return_reasons for update using (company_id = current_company_id());
create policy sales_return_reasons_delete on sales_return_reasons for delete using (company_id = current_company_id());

create table sales_return_conditions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  default_stock_destination text not null default 'pending_inspection' check (default_stock_destination in ('saleable', 'damaged', 'expired', 'pending_inspection', 'scrap')),
  is_active boolean not null default true
);
create unique index idx_sales_return_conditions_system_code on sales_return_conditions(code) where company_id is null;
create unique index idx_sales_return_conditions_company_code on sales_return_conditions(code, company_id) where company_id is not null;

insert into sales_return_conditions (code, company_id, label, default_stock_destination) values
  ('good', null, 'Good', 'saleable'), ('saleable', null, 'Saleable', 'saleable'), ('unopened', null, 'Unopened', 'saleable'),
  ('opened', null, 'Opened', 'pending_inspection'), ('damaged', null, 'Damaged', 'damaged'), ('leaking', null, 'Leaking', 'damaged'),
  ('broken', null, 'Broken', 'damaged'), ('expired', null, 'Expired', 'expired'), ('near_expiry', null, 'Near Expiry', 'pending_inspection'),
  ('wrong_product', null, 'Wrong Product', 'pending_inspection'), ('wrong_size', null, 'Wrong Size', 'pending_inspection'),
  ('wrong_variant', null, 'Wrong Variant', 'pending_inspection'), ('quality_issue', null, 'Quality Issue', 'pending_inspection'),
  ('customer_rejected', null, 'Customer Rejected', 'pending_inspection'), ('packaging_damaged', null, 'Packaging Damaged', 'damaged'),
  ('transit_damage', null, 'Transit Damage', 'damaged'), ('unknown', null, 'Unknown', 'pending_inspection');

alter table sales_return_conditions enable row level security;
create policy sales_return_conditions_read on sales_return_conditions for select
  using (company_id is null or company_id = current_company_id());
create policy sales_return_conditions_write on sales_return_conditions for insert with check (company_id = current_company_id());
create policy sales_return_conditions_update on sales_return_conditions for update using (company_id = current_company_id());
create policy sales_return_conditions_delete on sales_return_conditions for delete using (company_id = current_company_id());

create sequence if not exists sales_return_seq;

create or replace function next_return_no(p_return_type_code text)
returns text language plpgsql as $$
declare v_num bigint; v_prefix text;
begin
  v_prefix := case p_return_type_code
    when 'damaged_product_return' then 'DMG'
    when 'expired_product_return' then 'EXP'
    when 'return_without_invoice' then 'RWI'
    when 'replacement_request' then 'RPL'
    else 'SR'
  end;
  select nextval('sales_return_seq') into v_num;
  return v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_num::text, 6, '0');
end;
$$;

create table sales_returns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  branch_id uuid references warehouses(id) on delete set null,
  return_number text not null,
  temporary_number text,
  return_type_id uuid not null references sales_return_types(id),
  return_date date not null default current_date,
  return_time timestamptz not null default now(),
  customer_id uuid not null references customers(id) on delete restrict,
  customer_contact text,
  customer_address text,
  original_invoice_id uuid references sales_invoices(id) on delete set null,
  original_sales_order_id uuid references sales_orders(id) on delete set null,
  customer_visit_id uuid references customer_visits(id) on delete set null,
  daily_visit_plan_id uuid references daily_visit_plans(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  beat_plan_id uuid references beat_plans(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  warehouse_id uuid references warehouses(id) on delete set null,
  responsible_employee_id uuid references app_users(id) on delete set null,
  return_source text not null default 'web' check (return_source in ('web', 'mobile', 'pdt', 'offline', 'office', 'route', 'van')),
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  return_reason_id uuid references sales_return_reasons(id),
  customer_reference text,
  customer_complaint_reference text,
  replacement_requested boolean not null default false,
  credit_note_requested boolean not null default false,
  cash_refund_requested boolean not null default false,
  gross_return_amount numeric(14,2) not null default 0,
  discount_reversal_amount numeric(14,2) not null default 0,
  promotion_reversal_amount numeric(14,2) not null default 0,
  tax_reversal_amount numeric(14,2) not null default 0,
  net_return_amount numeric(14,2) not null default 0,
  total_return_quantity numeric(14,3) not null default 0,
  total_base_quantity numeric(14,3) not null default 0,
  status text not null default 'draft' check (status in (
    'draft', 'pending_validation', 'validation_failed', 'pending_submission', 'submitted',
    'returned_for_correction', 'cancelled_before_posting', 'expired', 'sync_pending', 'sync_failed', 'conflict'
  )),
  validation_status text not null default 'not_validated' check (validation_status in (
    'not_validated', 'valid', 'warning', 'invoice_mismatch', 'quantity_exceeded', 'batch_mismatch',
    'serial_mismatch', 'outside_return_period', 'duplicate_return_suspected', 'approval_required', 'conflict'
  )),
  approval_status text not null default 'not_required',
  inspection_status text not null default 'not_inspected',
  posting_status text not null default 'not_posted' check (posting_status = 'not_posted'),
  stock_destination text,
  accepted_quantity numeric(14,3),
  rejected_quantity numeric(14,3),
  credit_note_reference text,
  replacement_invoice_reference text,
  posted_by uuid references app_users(id),
  posted_date timestamptz,
  requested_pickup_date date,
  expiry_date date,
  notes text,
  internal_notes text,
  client_uuid text,
  device_uid text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, return_number),
  unique (company_id, client_uuid)
);
create index idx_sales_returns_company_date on sales_returns(company_id, return_date);
create index idx_sales_returns_customer on sales_returns(customer_id);
create index idx_sales_returns_invoice on sales_returns(original_invoice_id);
create index idx_sales_returns_status on sales_returns(company_id, status);

alter table sales_returns enable row level security;
create policy sales_returns_isolation on sales_returns for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_sales_returns_updated_at before update on sales_returns
  for each row execute function set_updated_at();

create table sales_return_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  old_status text, new_status text not null, reason text,
  changed_by uuid references app_users(id), changed_at timestamptz not null default now()
);
create index idx_sales_return_status_history_return on sales_return_status_history(return_id);

alter table sales_return_status_history enable row level security;
create policy sales_return_status_history_isolation on sales_return_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function change_return_status(p_return_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid; v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from sales_returns where id = p_return_id;
  if v_old is null then raise exception 'Return not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'submitted', 'cancelled_before_posting', 'expired', 'sync_pending')
    when 'pending_validation' then p_new_status in ('validation_failed', 'pending_submission', 'submitted', 'cancelled_before_posting')
    when 'validation_failed' then p_new_status in ('draft', 'pending_validation', 'cancelled_before_posting')
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
  if not v_valid then raise exception 'Cannot move return from % to %', v_old, p_new_status; end if;

  update sales_returns set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_return_id;
  insert into sales_return_status_history (company_id, return_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_return_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_return_status(uuid, text, text) to authenticated;

create table sales_return_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  original_invoice_item_id uuid references sales_invoice_items(id) on delete set null,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  description text,
  uom_id uuid references units(id),
  conversion_factor numeric(12,4) not null default 1,
  return_quantity numeric(14,3) not null check (return_quantity > 0),
  base_return_quantity numeric(14,3) not null check (base_return_quantity > 0),
  is_free_item boolean not null default false,
  unit_price numeric(12,4) not null default 0,
  original_unit_price numeric(12,4),
  discount_reversal numeric(14,2) not null default 0,
  promotion_reversal numeric(14,2) not null default 0,
  tax_reversal numeric(14,2) not null default 0,
  gross_return_amount numeric(14,2) not null default 0,
  net_return_amount numeric(14,2) not null default 0,
  batch_required boolean not null default false,
  serial_required boolean not null default false,
  return_condition_id uuid references sales_return_conditions(id),
  return_reason_id uuid references sales_return_reasons(id),
  expected_stock_destination text check (expected_stock_destination in ('saleable', 'damaged', 'expired', 'pending_inspection', 'scrap')),
  replacement_requested boolean not null default false,
  item_notes text,
  item_status text not null default 'active' check (item_status in ('active', 'removed')),
  sequence integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_sales_return_items_return on sales_return_items(return_id);
create index idx_sales_return_items_invoice_item on sales_return_items(original_invoice_item_id);

alter table sales_return_items enable row level security;
create policy sales_return_items_isolation on sales_return_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_item_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_item_id uuid not null references sales_return_items(id) on delete cascade,
  batch_id uuid not null references batches(id) on delete restrict,
  return_quantity numeric(14,3) not null check (return_quantity > 0),
  expiry_date date,
  created_at timestamptz not null default now()
);
create index idx_sales_return_item_batches_item on sales_return_item_batches(return_item_id);

alter table sales_return_item_batches enable row level security;
create policy sales_return_item_batches_isolation on sales_return_item_batches for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_item_serials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_item_id uuid not null references sales_return_items(id) on delete cascade,
  serial_id uuid not null references product_serials(id) on delete restrict,
  return_status text not null default 'return_requested' check (return_status in (
    'return_requested', 'pending_inspection', 'accepted', 'rejected', 'returned_to_saleable_stock',
    'returned_to_damaged_stock', 'replaced', 'scrapped'
  )),
  created_at timestamptz not null default now(),
  unique (serial_id)
);
create index idx_sales_return_item_serials_item on sales_return_item_serials(return_item_id);

alter table sales_return_item_serials enable row level security;
create policy sales_return_item_serials_isolation on sales_return_item_serials for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());
