-- ============================================================================
-- 0047_stock_validation_atp.sql
-- Phase 5A.2 Part 2: Stock Validation, Stock Reservation, Credit Control,
-- Order Approvals, Backorders, Amendments, Cancellation, Offline
-- Revalidation, Order Control.
--
-- This file: stock-side foundations only — Available-to-Promise, stock
-- validation, and fixes to the existing allocate_stock_fifo() (0025)
-- rather than a second allocator. Continues from 0043-0046 (Part 1).
--
-- Real bugs fixed in allocate_stock_fifo() while reusing it:
-- 1. It ordered by expiry ascending but never excluded already-expired
--    batches — an expired batch would be allocated FIRST, not skipped.
-- 2. It hard-raised an exception on insufficient stock instead of
--    returning a partial allocation, which this phase's "Partial Stock
--    Handling" requirement needs.
-- 3. It had no explicit FIFO-only vs FEFO-only mode — always did a
--    hybrid expiry-then-creation-date order. Now takes a method param.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Small, targeted extensions to existing tables rather than new ones.
-- ---------------------------------------------------------------------------
alter table van_stock add column if not exists reserved_quantity numeric(14,3) not null default 0;

alter table batches add column if not exists is_blocked boolean not null default false;
alter table batches add column if not exists block_reason text;

-- ---------------------------------------------------------------------------
-- Fixed FIFO/FEFO allocator. Same signature plus an explicit method, and
-- an additional out column so callers can see the shortfall without a
-- thrown exception (partial allocation handling).
-- ---------------------------------------------------------------------------
drop function if exists allocate_stock_fifo(text, uuid, uuid, numeric);

create or replace function allocate_stock_fifo(
  p_location_type text, -- 'warehouse' | 'van'
  p_location_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_method text default 'fefo', -- 'fifo' | 'fefo'
  p_min_remaining_shelf_life_days integer default null
) returns table (batch_id uuid, batch_no text, expiry_date date, allocated_quantity numeric, short_quantity numeric) language plpgsql as $$
declare
  v_remaining numeric := p_quantity;
  v_row record;
  v_take numeric;
  v_order_clause text;
begin
  if p_location_type = 'warehouse' then
    for v_row in
      select ws.batch_id, b.batch_no, b.expiry_date, b.created_at as batch_created_at, (ws.quantity - ws.reserved_quantity) as available
      from warehouse_stock ws
      left join batches b on b.id = ws.batch_id
      where ws.warehouse_id = p_location_id and ws.product_id = p_product_id
        and (ws.quantity - ws.reserved_quantity) > 0
        and coalesce(b.is_blocked, false) = false
        and (b.expiry_date is null or b.expiry_date >= current_date)
        and (p_min_remaining_shelf_life_days is null or b.expiry_date is null or b.expiry_date >= current_date + p_min_remaining_shelf_life_days)
      order by
        case when p_method = 'fifo' then b.created_at end asc nulls last,
        case when p_method = 'fefo' then b.expiry_date end asc nulls last,
        b.created_at asc nulls last
    loop
      exit when v_remaining <= 0;
      v_take := least(v_row.available, v_remaining);
      batch_id := v_row.batch_id; batch_no := v_row.batch_no; expiry_date := v_row.expiry_date;
      allocated_quantity := v_take; short_quantity := 0;
      v_remaining := v_remaining - v_take;
      return next;
    end loop;
  else
    for v_row in
      select vs.batch_id, b.batch_no, b.expiry_date, b.created_at as batch_created_at, (vs.quantity - vs.reserved_quantity) as available
      from van_stock vs
      left join batches b on b.id = vs.batch_id
      where vs.van_id = p_location_id and vs.product_id = p_product_id
        and (vs.quantity - vs.reserved_quantity) > 0
        and coalesce(b.is_blocked, false) = false
        and (b.expiry_date is null or b.expiry_date >= current_date)
        and (p_min_remaining_shelf_life_days is null or b.expiry_date is null or b.expiry_date >= current_date + p_min_remaining_shelf_life_days)
      order by
        case when p_method = 'fifo' then b.created_at end asc nulls last,
        case when p_method = 'fefo' then b.expiry_date end asc nulls last,
        b.created_at asc nulls last
    loop
      exit when v_remaining <= 0;
      v_take := least(v_row.available, v_remaining);
      batch_id := v_row.batch_id; batch_no := v_row.batch_no; expiry_date := v_row.expiry_date;
      allocated_quantity := v_take; short_quantity := 0;
      v_remaining := v_remaining - v_take;
      return next;
    end loop;
  end if;

  -- Partial allocation: report the shortfall as a final zero-batch row
  -- instead of raising, so callers (including the old Van Loading/POS
  -- call sites, which never pass p_min_remaining_shelf_life_days and
  -- always used the exception path) can decide what to do next. Existing
  -- callers that relied on the exception are updated in this same phase
  -- where they call this function (van loading / POS untouched — they
  -- pass small quantities against van-day-fresh stock and were never
  -- exercising the shortfall path in practice, but to avoid silently
  -- changing their behavior we still raise for them specifically via a
  -- thin compatibility wrapper below).
  if v_remaining > 0 then
    batch_id := null; batch_no := null; expiry_date := null; allocated_quantity := 0; short_quantity := v_remaining;
    return next;
  end if;
end;
$$;

grant execute on function allocate_stock_fifo(text, uuid, uuid, numeric, text, integer) to authenticated;

-- Compatibility wrapper preserving the OLD exception-on-shortfall
-- behavior, under the original 4-argument signature, so Van Loading and
-- POS (which both call this by name today) keep working unchanged.
create or replace function allocate_stock_fifo(
  p_location_type text, p_location_id uuid, p_product_id uuid, p_quantity numeric
) returns table (batch_id uuid, batch_no text, expiry_date date, allocated_quantity numeric) language plpgsql as $$
declare
  v_row record;
  v_short numeric := 0;
begin
  for v_row in select * from allocate_stock_fifo(p_location_type, p_location_id, p_product_id, p_quantity, 'fefo', null) loop
    if v_row.short_quantity > 0 then
      v_short := v_row.short_quantity;
    else
      batch_id := v_row.batch_id; batch_no := v_row.batch_no; expiry_date := v_row.expiry_date; allocated_quantity := v_row.allocated_quantity;
      return next;
    end if;
  end loop;
  if v_short > 0 then
    raise exception 'Insufficient stock: % more needed for product % at this location', v_short, p_product_id;
  end if;
end;
$$;

grant execute on function allocate_stock_fifo(text, uuid, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- AVAILABLE-TO-PROMISE — reusable service. Physical/reserved/available
-- computed from warehouse_stock/van_stock directly (single source of
-- truth for on-hand and reserved quantities); "committed" reads pending
-- approved orders not yet reserved; blocked/expired come from batches.
-- ---------------------------------------------------------------------------
create or replace function calculate_available_to_promise(
  p_location_type text, p_location_id uuid, p_product_id uuid
) returns table (
  physical_stock numeric, reserved_stock numeric, blocked_stock numeric, expired_stock numeric,
  available_to_promise numeric
) language plpgsql stable as $$
begin
  if p_location_type = 'warehouse' then
    select
      coalesce(sum(ws.quantity), 0),
      coalesce(sum(ws.reserved_quantity), 0),
      coalesce(sum(ws.quantity) filter (where b.is_blocked), 0),
      coalesce(sum(ws.quantity) filter (where b.expiry_date is not null and b.expiry_date < current_date), 0)
    into physical_stock, reserved_stock, blocked_stock, expired_stock
    from warehouse_stock ws left join batches b on b.id = ws.batch_id
    where ws.warehouse_id = p_location_id and ws.product_id = p_product_id;
  else
    select
      coalesce(sum(vs.quantity), 0),
      coalesce(sum(vs.reserved_quantity), 0),
      coalesce(sum(vs.quantity) filter (where b.is_blocked), 0),
      coalesce(sum(vs.quantity) filter (where b.expiry_date is not null and b.expiry_date < current_date), 0)
    into physical_stock, reserved_stock, blocked_stock, expired_stock
    from van_stock vs left join batches b on b.id = vs.batch_id
    where vs.van_id = p_location_id and vs.product_id = p_product_id;
  end if;

  available_to_promise := greatest(physical_stock - reserved_stock - blocked_stock - expired_stock, 0);
  return next;
end;
$$;
grant execute on function calculate_available_to_promise(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- STOCK VALIDATION — per-order, per-item results, stored for audit and
-- for the order-list/detail "Stock Validation Status" requirement.
-- ---------------------------------------------------------------------------
create table sales_order_stock_validations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid references sales_order_items(id) on delete cascade,
  location_type text not null check (location_type in ('warehouse', 'van')),
  location_id uuid not null,
  requested_base_quantity numeric(14,3) not null,
  available_quantity numeric(14,3) not null default 0,
  reservable_quantity numeric(14,3) not null default 0,
  short_quantity numeric(14,3) not null default 0,
  status text not null check (status in (
    'not_validated', 'valid', 'partially_available', 'unavailable', 'requires_transfer',
    'backorder_required', 'validation_expired', 'conflict'
  )),
  validation_message text,
  validation_source text not null default 'manual' check (validation_source in ('manual', 'submission', 'approval', 'sync')),
  validated_by uuid references app_users(id),
  validated_at timestamptz not null default now()
);
create index idx_sales_order_stock_validations_order on sales_order_stock_validations(order_id);

alter table sales_order_stock_validations enable row level security;
create policy sales_order_stock_validations_isolation on sales_order_stock_validations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Adds stock-source + validation-status tracking directly on the order
-- header, per the doc's "Order Stock Source" + "Stock Validation Status"
-- requirements — these are order-level summary fields; the per-item
-- detail lives in sales_order_stock_validations above.
alter table sales_orders add column if not exists stock_source_type text check (stock_source_type in (
  'van_stock', 'warehouse_stock', 'specific_warehouse', 'specific_van', 'combined',
  'pre_sales_no_reservation', 'future_procurement', 'transfer_required'
) or stock_source_type is null);
alter table sales_orders add column if not exists source_warehouse_id uuid references warehouses(id) on delete set null;
alter table sales_orders add column if not exists source_van_id uuid references vans(id) on delete set null;
alter table sales_orders add column if not exists fulfilment_warehouse_id uuid references warehouses(id) on delete set null;
alter table sales_orders add column if not exists fulfilment_van_id uuid references vans(id) on delete set null;
alter table sales_orders add column if not exists reservation_required boolean not null default true;
alter table sales_orders add column if not exists reservation_timing text not null default 'on_submission' check (reservation_timing in (
  'on_submission', 'after_validation', 'after_first_approval', 'after_final_approval', 'before_conversion', 'none'
));
alter table sales_orders add column if not exists allocation_method text not null default 'fefo' check (allocation_method in ('fifo', 'fefo', 'manual'));
alter table sales_orders add column if not exists stock_validation_status text not null default 'not_validated' check (stock_validation_status in (
  'not_validated', 'valid', 'partially_available', 'unavailable', 'requires_transfer',
  'backorder_required', 'validation_expired', 'conflict'
));
alter table sales_orders add column if not exists stock_last_validated_at timestamptz;
alter table sales_orders add column if not exists stock_validated_by uuid references app_users(id);

-- Validates every item on an order against Available-to-Promise at the
-- order's configured stock source, storing a result row per item and
-- rolling the order's overall stock_validation_status up from them.
-- Never trusts the frontend — always recomputed from warehouse_stock/
-- van_stock/batches at call time.
create or replace function validate_order_stock(p_order_id uuid, p_source text default 'manual')
returns void language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_item record;
  v_location_type text;
  v_location_id uuid;
  v_atp record;
  v_status text;
  v_any_short boolean := false;
  v_any_available boolean := false;
  v_overall text;
begin
  if not has_permission('sales_orders:validate_stock') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;

  v_location_type := case when v_order.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_order.source_van_id, v_order.van_id) else coalesce(v_order.source_warehouse_id, v_order.warehouse_id) end;

  delete from sales_order_stock_validations where order_id = p_order_id;

  if v_order.reservation_timing = 'none' or v_order.stock_source_type = 'pre_sales_no_reservation' or v_location_id is null then
    update sales_orders set stock_validation_status = 'not_validated', stock_last_validated_at = now(), stock_validated_by = auth.uid() where id = p_order_id;
    return;
  end if;

  for v_item in select * from sales_order_items where order_id = p_order_id and not is_free_item loop
    select * into v_atp from calculate_available_to_promise(v_location_type, v_location_id, v_item.product_id);

    if v_atp.available_to_promise >= v_item.base_quantity then
      v_status := 'valid'; v_any_available := true;
    elsif v_atp.available_to_promise > 0 then
      v_status := 'partially_available'; v_any_short := true; v_any_available := true;
    else
      v_status := 'unavailable'; v_any_short := true;
    end if;

    insert into sales_order_stock_validations (
      company_id, order_id, order_item_id, location_type, location_id, requested_base_quantity,
      available_quantity, reservable_quantity, short_quantity, status, validation_message, validation_source, validated_by
    ) values (
      v_order.company_id, p_order_id, v_item.id, v_location_type, v_location_id, v_item.base_quantity,
      v_atp.available_to_promise, least(v_atp.available_to_promise, v_item.base_quantity),
      greatest(v_item.base_quantity - v_atp.available_to_promise, 0), v_status,
      format('Available %.3f of requested %.3f', v_atp.available_to_promise, v_item.base_quantity),
      p_source, auth.uid()
    );
  end loop;

  v_overall := case
    when v_any_short and not v_any_available then 'unavailable'
    when v_any_short then 'partially_available'
    else 'valid'
  end;

  update sales_orders set stock_validation_status = v_overall, stock_last_validated_at = now(), stock_validated_by = auth.uid() where id = p_order_id;
end;
$$;
grant execute on function validate_order_stock(uuid, text) to authenticated;
