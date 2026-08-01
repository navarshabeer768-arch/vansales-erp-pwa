-- ============================================================================
-- 0048_stock_reservations.sql
-- Stock reservation headers + batch/serial breakdown. Continues 0047.
--
-- Design: one reservation "header" row per (order_item, location) summarizes
-- the lifecycle (status/expiry/release); sales_order_item_batch_reservations
-- and sales_order_item_serial_reservations are its batch/serial-level
-- breakdown when FIFO/FEFO allocation spans more than one batch or specific
-- serials are drawn. This avoids a second parallel "allocation" concept —
-- the breakdown tables are children of the reservation header, not a
-- competing source of truth.
-- ============================================================================

create table sales_order_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid not null references sales_order_items(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  location_type text not null check (location_type in ('warehouse', 'van')),
  location_id uuid not null,
  requires_batch boolean not null default false,
  requires_serial boolean not null default false,
  reserved_base_quantity numeric(14,3) not null check (reserved_base_quantity >= 0),
  reserved_sales_quantity numeric(14,3) not null default 0,
  sales_unit_id uuid references units(id),
  reservation_date timestamptz not null default now(),
  expiry_date timestamptz,
  status text not null default 'pending' check (status in (
    'pending', 'active', 'partially_reserved', 'fully_reserved', 'partially_released',
    'released', 'consumed', 'expired', 'cancelled', 'conflict'
  )),
  allocation_method text not null default 'fefo' check (allocation_method in ('fifo', 'fefo', 'manual')),
  idempotency_key text, -- prevents the same submission from double-reserving on retry
  created_by uuid references app_users(id),
  released_by uuid references app_users(id),
  release_reason text,
  converted_quantity numeric(14,3) not null default 0,
  remaining_quantity numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  unique (order_item_id, idempotency_key)
);
create index idx_sales_order_stock_reservations_order on sales_order_stock_reservations(order_id);
create index idx_sales_order_stock_reservations_item on sales_order_stock_reservations(order_item_id);
create index idx_sales_order_stock_reservations_status on sales_order_stock_reservations(company_id, status);
create index idx_sales_order_stock_reservations_expiry on sales_order_stock_reservations(expiry_date) where status in ('active', 'partially_reserved', 'fully_reserved');

alter table sales_order_stock_reservations enable row level security;
create policy sales_order_stock_reservations_isolation on sales_order_stock_reservations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_reservation_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  reservation_id uuid not null references sales_order_stock_reservations(id) on delete cascade,
  action text not null check (action in ('created', 'extended', 'released', 'partially_released', 'consumed', 'expired', 'cancelled')),
  old_expiry_date timestamptz,
  new_expiry_date timestamptz,
  quantity_change numeric(14,3),
  reason text,
  performed_by uuid references app_users(id),
  performed_at timestamptz not null default now()
);
create index idx_sales_order_reservation_history_reservation on sales_order_reservation_history(reservation_id);

alter table sales_order_reservation_history enable row level security;
create policy sales_order_reservation_history_isolation on sales_order_reservation_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_item_batch_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  reservation_id uuid not null references sales_order_stock_reservations(id) on delete cascade,
  batch_id uuid not null references batches(id) on delete restrict,
  allocated_quantity numeric(14,3) not null check (allocated_quantity > 0),
  created_at timestamptz not null default now(),
  unique (reservation_id, batch_id)
);
create index idx_sales_order_item_batch_reservations_reservation on sales_order_item_batch_reservations(reservation_id);
create index idx_sales_order_item_batch_reservations_batch on sales_order_item_batch_reservations(batch_id);

alter table sales_order_item_batch_reservations enable row level security;
create policy sales_order_item_batch_reservations_isolation on sales_order_item_batch_reservations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_item_serial_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  reservation_id uuid not null references sales_order_stock_reservations(id) on delete cascade,
  serial_id uuid not null references product_serials(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (serial_id) -- a serial can only be actively reserved once, ever, at the DB level
);
create index idx_sales_order_item_serial_reservations_reservation on sales_order_item_serial_reservations(reservation_id);

alter table sales_order_item_serial_reservations enable row level security;
create policy sales_order_item_serial_reservations_isolation on sales_order_item_serial_reservations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- CREATE STOCK RESERVATION — the double-reservation-prevention core.
-- Locks the warehouse_stock/van_stock row with FOR UPDATE before checking
-- and incrementing reserved_quantity, so concurrent submissions against
-- the same batch/location serialize instead of both succeeding against
-- stale numbers. Idempotent per (order_item_id, idempotency_key): a retry
-- of the same submission returns the existing reservation instead of
-- creating a second one.
-- ---------------------------------------------------------------------------
create or replace function create_stock_reservation(p_order_item_id uuid, p_idempotency_key text default null)
returns uuid language plpgsql security definer as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_product products%rowtype;
  v_existing_id uuid;
  v_reservation_id uuid;
  v_location_type text;
  v_location_id uuid;
  v_alloc record;
  v_total_allocated numeric := 0;
  v_short numeric := 0;
  v_status text;
  v_serial_ids uuid[];
  v_serial_id uuid;
  v_needed integer;
  v_key text := coalesce(p_idempotency_key, p_order_item_id::text);
begin
  if not has_permission('sales_orders:reserve_stock') then raise exception 'Not permitted'; end if;

  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  if v_item.is_free_item then raise exception 'Free items are not reserved'; end if;

  select id into v_existing_id from sales_order_stock_reservations
  where order_item_id = p_order_item_id and idempotency_key = v_key;
  if v_existing_id is not null then return v_existing_id; end if;

  select * into v_order from sales_orders where id = v_item.order_id;
  select * into v_product from products where id = v_item.product_id;

  v_location_type := case when v_order.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_order.source_van_id, v_order.van_id) else coalesce(v_order.source_warehouse_id, v_order.warehouse_id) end;
  if v_location_id is null then raise exception 'Order has no stock source location configured'; end if;

  -- Lock every candidate stock row for this product at this location before
  -- allocating, so a concurrent reservation against the same rows blocks
  -- until this transaction commits or rolls back.
  if v_location_type = 'warehouse' then
    perform 1 from warehouse_stock where warehouse_id = v_location_id and product_id = v_item.product_id for update;
  else
    perform 1 from van_stock where van_id = v_location_id and product_id = v_item.product_id for update;
  end if;

  insert into sales_order_stock_reservations (
    company_id, order_id, order_item_id, product_id, variant_id, location_type, location_id,
    requires_batch, requires_serial, reserved_base_quantity, reserved_sales_quantity, sales_unit_id,
    expiry_date, status, allocation_method, idempotency_key, created_by, remaining_quantity
  ) values (
    v_order.company_id, v_item.order_id, p_order_item_id, v_item.product_id, v_item.variant_id, v_location_type, v_location_id,
    v_product.track_batches, v_product.track_serials, 0, v_item.ordered_quantity, v_item.unit_id,
    null, 'pending', v_order.allocation_method, v_key, auth.uid(), 0
  ) returning id into v_reservation_id;

  if v_product.track_serials then
    -- Auto-select available, non-sold, non-blocked serials at this location.
    v_needed := v_item.base_quantity::integer;
    select array_agg(id) into v_serial_ids from (
      select id from product_serials
      where product_id = v_item.product_id and status = 'in_stock'
        and current_location_type = v_location_type and current_location_id = v_location_id
        and id not in (select serial_id from sales_order_item_serial_reservations)
      order by created_at
      limit v_needed
    ) s;

    foreach v_serial_id in array coalesce(v_serial_ids, array[]::uuid[]) loop
      insert into sales_order_item_serial_reservations (company_id, reservation_id, serial_id)
      values (v_order.company_id, v_reservation_id, v_serial_id)
      on conflict (serial_id) do nothing; -- a concurrent transaction may have just taken it
    end loop;

    v_total_allocated := coalesce(array_length(v_serial_ids, 1), 0);
    v_short := v_item.base_quantity - v_total_allocated;

  elsif v_product.track_batches then
    for v_alloc in
      select * from allocate_stock_fifo(v_location_type, v_location_id, v_item.product_id, v_item.base_quantity, v_order.allocation_method)
    loop
      if v_alloc.short_quantity > 0 then
        v_short := v_alloc.short_quantity;
      else
        insert into sales_order_item_batch_reservations (company_id, reservation_id, batch_id, allocated_quantity)
        values (v_order.company_id, v_reservation_id, v_alloc.batch_id, v_alloc.allocated_quantity);

        if v_location_type = 'warehouse' then
          update warehouse_stock set reserved_quantity = reserved_quantity + v_alloc.allocated_quantity
          where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id = v_alloc.batch_id;
        else
          update van_stock set reserved_quantity = reserved_quantity + v_alloc.allocated_quantity
          where van_id = v_location_id and product_id = v_item.product_id and batch_id = v_alloc.batch_id;
        end if;

        v_total_allocated := v_total_allocated + v_alloc.allocated_quantity;
      end if;
    end loop;

  else
    -- Non-batch, non-serial product: reserve directly against the single
    -- (batch_id is null) stock row for this product/location.
    if v_location_type = 'warehouse' then
      update warehouse_stock set reserved_quantity = reserved_quantity + least(quantity - reserved_quantity, v_item.base_quantity)
      where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id is null
      returning least(quantity - reserved_quantity, v_item.base_quantity) into v_total_allocated;
    else
      update van_stock set reserved_quantity = reserved_quantity + least(quantity - reserved_quantity, v_item.base_quantity)
      where van_id = v_location_id and product_id = v_item.product_id and batch_id is null
      returning least(quantity - reserved_quantity, v_item.base_quantity) into v_total_allocated;
    end if;
    v_total_allocated := coalesce(v_total_allocated, 0);
    v_short := v_item.base_quantity - v_total_allocated;
  end if;

  v_status := case
    when v_total_allocated <= 0 then 'pending'
    when v_short > 0 then 'partially_reserved'
    else 'fully_reserved'
  end;

  update sales_order_stock_reservations set
    reserved_base_quantity = v_total_allocated, remaining_quantity = v_total_allocated, status = v_status
  where id = v_reservation_id;

  insert into sales_order_reservation_history (company_id, reservation_id, action, quantity_change, performed_by)
  values (v_order.company_id, v_reservation_id, 'created', v_total_allocated, auth.uid());

  return v_reservation_id;
end;
$$;
grant execute on function create_stock_reservation(uuid, text) to authenticated;

-- Releases a reservation (fully or the remaining portion), returning
-- reserved_quantity to the stock rows and freeing any reserved serials.
create or replace function release_stock_reservation(p_reservation_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_res sales_order_stock_reservations%rowtype;
  v_batch_res record;
begin
  if not has_permission('sales_orders:release_reservation') then raise exception 'Not permitted'; end if;
  select * into v_res from sales_order_stock_reservations where id = p_reservation_id;
  if not found then raise exception 'Reservation not found'; end if;
  if v_res.status in ('released', 'cancelled', 'consumed') then return; end if;

  if v_res.requires_batch then
    for v_batch_res in select * from sales_order_item_batch_reservations where reservation_id = p_reservation_id loop
      if v_res.location_type = 'warehouse' then
        update warehouse_stock set reserved_quantity = greatest(reserved_quantity - v_batch_res.allocated_quantity, 0)
        where warehouse_id = v_res.location_id and product_id = v_res.product_id and batch_id = v_batch_res.batch_id;
      else
        update van_stock set reserved_quantity = greatest(reserved_quantity - v_batch_res.allocated_quantity, 0)
        where van_id = v_res.location_id and product_id = v_res.product_id and batch_id = v_batch_res.batch_id;
      end if;
    end loop;
  elsif v_res.requires_serial then
    delete from sales_order_item_serial_reservations where reservation_id = p_reservation_id;
  else
    if v_res.location_type = 'warehouse' then
      update warehouse_stock set reserved_quantity = greatest(reserved_quantity - v_res.remaining_quantity, 0)
      where warehouse_id = v_res.location_id and product_id = v_res.product_id and batch_id is null;
    else
      update van_stock set reserved_quantity = greatest(reserved_quantity - v_res.remaining_quantity, 0)
      where van_id = v_res.location_id and product_id = v_res.product_id and batch_id is null;
    end if;
  end if;

  update sales_order_stock_reservations set
    status = 'released', released_by = auth.uid(), release_reason = p_reason, remaining_quantity = 0
  where id = p_reservation_id;

  insert into sales_order_reservation_history (company_id, reservation_id, action, quantity_change, reason, performed_by)
  values (v_res.company_id, p_reservation_id, 'released', -v_res.remaining_quantity, p_reason, auth.uid());
end;
$$;
grant execute on function release_stock_reservation(uuid, text) to authenticated;

create or replace function extend_stock_reservation(p_reservation_id uuid, p_new_expiry timestamptz, p_reason text)
returns void language plpgsql security definer as $$
declare v_res sales_order_stock_reservations%rowtype;
begin
  if not has_permission('sales_orders:extend_reservation') then raise exception 'Not permitted'; end if;
  select * into v_res from sales_order_stock_reservations where id = p_reservation_id;
  if not found then raise exception 'Reservation not found'; end if;
  if v_res.status not in ('active', 'partially_reserved', 'fully_reserved', 'pending') then
    raise exception 'Cannot extend a reservation in status %', v_res.status;
  end if;

  insert into sales_order_reservation_history (company_id, reservation_id, action, old_expiry_date, new_expiry_date, reason, performed_by)
  values (v_res.company_id, p_reservation_id, 'extended', v_res.expiry_date, p_new_expiry, p_reason, auth.uid());

  update sales_order_stock_reservations set expiry_date = p_new_expiry where id = p_reservation_id;
end;
$$;
grant execute on function extend_stock_reservation(uuid, timestamptz, text) to authenticated;

-- Expires reservations past their expiry_date — called on-demand from
-- page load (this codebase's established "no real cron" pattern), not
-- server-scheduled.
create or replace function expire_stock_reservations()
returns integer language plpgsql security definer as $$
declare
  v_res record;
  v_count integer := 0;
begin
  for v_res in
    select * from sales_order_stock_reservations
    where status in ('active', 'partially_reserved', 'fully_reserved', 'pending')
      and expiry_date is not null and expiry_date < now()
  loop
    perform release_stock_reservation(v_res.id, 'Reservation expired');
    update sales_order_stock_reservations set status = 'expired' where id = v_res.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function expire_stock_reservations() to authenticated;
