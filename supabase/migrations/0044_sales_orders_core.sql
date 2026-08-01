-- ============================================================================
-- 0044_sales_orders_core.sql
-- Sales Order header/items/notes/status-history (Phase 5A.2 Part 1).
-- Continues 0043.
-- ============================================================================

create sequence if not exists sales_order_seq;

-- Order numbering by company/type — same next_document_no() pattern used for
-- invoices, extended with an order-type-specific prefix rather than a fixed one.
create or replace function next_sales_order_no(p_order_type_code text)
returns text language plpgsql as $$
declare
  v_num bigint;
  v_prefix text;
begin
  v_prefix := case p_order_type_code
    when 'van_sales' then 'VS'
    when 'pre_sales' then 'PS'
    when 'warehouse_order' then 'WO'
    when 'cash_order' then 'CO'
    when 'credit_order' then 'CR'
    when 'hybrid_order' then 'HY'
    when 'replacement_request' then 'RP'
    when 'promotional_order' then 'PR'
    when 'sample_order' then 'SM'
    when 'custom_order' then 'CU'
    else 'SO'
  end;
  select nextval('sales_order_seq') into v_num;
  return v_prefix || '-' || to_char(now(), 'YYMM') || '-' || lpad(v_num::text, 6, '0');
end;
$$;

create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  branch_id uuid references warehouses(id) on delete set null,
  order_number text not null,
  is_manual_number boolean not null default false,
  temporary_number text, -- assigned client-side while offline; order_number becomes permanent on sync
  customer_id uuid not null references customers(id) on delete restrict,
  delivery_address_id uuid references customer_addresses(id) on delete set null,
  contact_person text,
  order_type_id uuid not null references sales_order_types(id),
  order_date date not null default current_date,
  expected_delivery_date date,
  route_id uuid references routes(id) on delete set null,
  beat_plan_id uuid references beat_plans(id) on delete set null,
  daily_visit_plan_id uuid references daily_visit_plans(id) on delete set null,
  customer_visit_id uuid references customer_visits(id) on delete set null,
  salesman_id uuid references app_users(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  warehouse_id uuid references warehouses(id) on delete set null,
  price_list_id uuid references price_lists(id) on delete set null,
  payment_type text, -- payment_methods.code
  payment_term_id uuid references payment_terms(id) on delete set null,
  currency text not null default 'QAR',
  exchange_rate numeric(12,6) not null default 1,
  customer_reference text,
  customer_po text,
  notes text,
  internal_notes text,
  status text not null default 'draft' check (status in (
    'draft', 'pending_submission', 'submitted', 'cancelled', 'expired', 'sync_pending', 'sync_failed'
  )),
  is_direct_order boolean not null default true, -- false when created during a visit
  direct_order_type text check (direct_order_type in ('office', 'phone', 'repeat', 'emergency') or direct_order_type is null),
  client_uuid text, -- offline idempotency key, same pattern as sales.client_uuid
  gross_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  promotion_discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  round_off numeric(8,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  total_quantity numeric(14,3) not null default 0,
  free_quantity numeric(14,3) not null default 0,
  base_quantity numeric(14,3) not null default 0,
  order_weight numeric(12,3) not null default 0,
  order_volume numeric(12,3) not null default 0,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, order_number),
  unique (company_id, client_uuid)
);
create index idx_sales_orders_company_date on sales_orders(company_id, order_date);
create index idx_sales_orders_customer on sales_orders(customer_id);
create index idx_sales_orders_status on sales_orders(company_id, status);
create index idx_sales_orders_van on sales_orders(van_id);

alter table sales_orders enable row level security;
create policy sales_orders_isolation on sales_orders for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_sales_orders_updated_at before update on sales_orders
  for each row execute function set_updated_at();

create table sales_order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  batch_id uuid references batches(id) on delete set null,
  unit_id uuid not null references units(id),
  barcode text,
  sku text,
  description text,
  batch_required boolean not null default false,
  serial_required boolean not null default false,
  conversion_factor numeric(12,4) not null default 1,
  ordered_quantity numeric(14,3) not null check (ordered_quantity > 0),
  base_quantity numeric(14,3) not null,
  original_price numeric(12,2) not null,
  applied_price numeric(12,2) not null,
  price_source text, -- customer_price | customer_group_price | price_list | route_price | branch_price | promotion | standard_price | override
  requested_price numeric(12,2),
  price_override_reason text,
  price_override_requested_by uuid references app_users(id),
  price_override_approved_by uuid references app_users(id),
  discount_pct numeric(5,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  discount_source text check (discount_source in ('item_pct', 'item_amount', 'invoice_pct', 'invoice_amount', 'customer_discount', 'category_discount', 'product_discount', 'promotion_discount', 'temporary_discount', 'manual_discount') or discount_source is null),
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  is_free_item boolean not null default false,
  free_quantity_rule_id uuid references free_quantity_rules(id) on delete set null,
  item_notes text,
  sequence integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_sales_order_items_order on sales_order_items(order_id);
create index idx_sales_order_items_product on sales_order_items(product_id);

alter table sales_order_items enable row level security;
create policy sales_order_items_isolation on sales_order_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  note text not null,
  note_type text not null default 'general' check (note_type in ('general', 'delivery', 'customer', 'internal', 'visit')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_sales_order_notes_order on sales_order_notes(order_id);

alter table sales_order_notes enable row level security;
create policy sales_order_notes_isolation on sales_order_notes for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  old_status text, new_status text not null, reason text,
  changed_by uuid references app_users(id), changed_at timestamptz not null default now()
);

alter table sales_order_status_history enable row level security;
create policy sales_order_status_history_isolation on sales_order_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Centralized valid-transition enforcement, same principle as
-- change_daily_plan_status() from Phase 5A.1.
create or replace function change_sales_order_status(p_order_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old text;
  v_company_id uuid;
  v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from sales_orders where id = p_order_id;
  if v_old is null then raise exception 'Order not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_submission', 'submitted', 'cancelled', 'expired', 'sync_pending')
    when 'pending_submission' then p_new_status in ('submitted', 'cancelled', 'draft')
    when 'sync_pending' then p_new_status in ('submitted', 'sync_failed', 'draft')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled')
    when 'submitted' then p_new_status in ('cancelled', 'expired')
    when 'cancelled' then false
    when 'expired' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move order from % to %', v_old, p_new_status; end if;

  update sales_orders set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_order_id;
  insert into sales_order_status_history (company_id, order_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_order_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_sales_order_status(uuid, text, text) to authenticated;
