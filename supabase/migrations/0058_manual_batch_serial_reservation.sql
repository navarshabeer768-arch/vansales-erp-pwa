-- ============================================================================
-- 0058_manual_batch_serial_reservation.sql
-- Closes a gap flagged in the Phase 5A.2 Part 2 README: "Manual Batch
-- Selection With Permission" and "Manual Selection With Permission" for
-- serials were named in the requirements doc and are permission-gated
-- (select_batch, select_serial_numbers, override_fifo_fefo already exist
-- as permissions from 0055) but had no function or UI behind them —
-- create_stock_reservation() only ever auto-allocates via FIFO/FEFO.
-- ============================================================================

-- Lists batches available for manual selection at an order item's stock
-- source — excludes expired/blocked batches, same rule
-- allocate_stock_fifo() already enforces, so a manual pick can never
-- choose something the automatic allocator itself would refuse.
create or replace function available_batches_for_item(p_order_item_id uuid)
returns table (batch_id uuid, batch_no text, expiry_date date, available_quantity numeric) language plpgsql stable as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_location_type text;
  v_location_id uuid;
begin
  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from sales_orders where id = v_item.order_id;

  v_location_type := case when v_order.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_order.source_van_id, v_order.van_id) else coalesce(v_order.source_warehouse_id, v_order.warehouse_id) end;

  if v_location_type = 'warehouse' then
    return query
      select ws.batch_id, b.batch_no, b.expiry_date, (ws.quantity - ws.reserved_quantity) as available_quantity
      from warehouse_stock ws join batches b on b.id = ws.batch_id
      where ws.warehouse_id = v_location_id and ws.product_id = v_item.product_id
        and (ws.quantity - ws.reserved_quantity) > 0 and not coalesce(b.is_blocked, false)
        and (b.expiry_date is null or b.expiry_date >= current_date)
      order by b.expiry_date asc nulls last;
  else
    return query
      select vs.batch_id, b.batch_no, b.expiry_date, (vs.quantity - vs.reserved_quantity) as available_quantity
      from van_stock vs join batches b on b.id = vs.batch_id
      where vs.van_id = v_location_id and vs.product_id = v_item.product_id
        and (vs.quantity - vs.reserved_quantity) > 0 and not coalesce(b.is_blocked, false)
        and (b.expiry_date is null or b.expiry_date >= current_date)
      order by b.expiry_date asc nulls last;
  end if;
end;
$$;
grant execute on function available_batches_for_item(uuid) to authenticated;

-- Lists in-stock, unreserved serials for a product at an order item's
-- stock source, for manual serial selection.
create or replace function available_serials_for_item(p_order_item_id uuid)
returns table (serial_id uuid, serial_no text) language plpgsql stable as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_location_type text;
  v_location_id uuid;
begin
  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from sales_orders where id = v_item.order_id;

  v_location_type := case when v_order.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_order.source_van_id, v_order.van_id) else coalesce(v_order.source_warehouse_id, v_order.warehouse_id) end;

  return query
    select ps.id, ps.serial_no from product_serials ps
    where ps.product_id = v_item.product_id and ps.status = 'in_stock'
      and ps.current_location_type = v_location_type and ps.current_location_id = v_location_id
      and ps.id not in (select serial_id from sales_order_item_serial_reservations)
    order by ps.created_at;
end;
$$;
grant execute on function available_serials_for_item(uuid) to authenticated;

-- Creates a reservation using a manually chosen set of batches (with a
-- quantity per batch) rather than FIFO/FEFO auto-allocation. Requires
-- override_fifo_fefo in addition to select_batch/reserve_stock — a
-- manual pick is still a deliberate override of the standard allocation
-- rule, and this doc explicitly calls that out as a distinct permission.
-- Same double-reservation prevention as create_stock_reservation(): the
-- stock rows are locked before the reserved_quantity increments happen.
create or replace function create_manual_batch_reservation(p_order_item_id uuid, p_batch_allocations jsonb, p_idempotency_key text default null)
returns uuid language plpgsql security definer as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_existing_id uuid;
  v_reservation_id uuid;
  v_location_type text;
  v_location_id uuid;
  v_alloc jsonb;
  v_batch_id uuid;
  v_qty numeric;
  v_available numeric;
  v_total_allocated numeric := 0;
  v_key text := coalesce(p_idempotency_key, p_order_item_id::text || '-manual');
begin
  if not has_permission('sales_orders:select_batch') or not has_permission('sales_orders:override_fifo_fefo') then
    raise exception 'Not permitted — manual batch selection requires both select_batch and override_fifo_fefo';
  end if;

  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  if v_item.is_free_item then raise exception 'Free items are not reserved'; end if;

  select id into v_existing_id from sales_order_stock_reservations where order_item_id = p_order_item_id and idempotency_key = v_key;
  if v_existing_id is not null then return v_existing_id; end if;

  select * into v_order from sales_orders where id = v_item.order_id;
  v_location_type := case when v_order.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_order.source_van_id, v_order.van_id) else coalesce(v_order.source_warehouse_id, v_order.warehouse_id) end;
  if v_location_id is null then raise exception 'Order has no stock source location configured'; end if;

  if v_location_type = 'warehouse' then
    perform 1 from warehouse_stock where warehouse_id = v_location_id and product_id = v_item.product_id for update;
  else
    perform 1 from van_stock where van_id = v_location_id and product_id = v_item.product_id for update;
  end if;

  insert into sales_order_stock_reservations (
    company_id, order_id, order_item_id, product_id, variant_id, location_type, location_id,
    requires_batch, requires_serial, reserved_base_quantity, reserved_sales_quantity, sales_unit_id,
    status, allocation_method, idempotency_key, created_by, remaining_quantity
  ) values (
    v_order.company_id, v_item.order_id, p_order_item_id, v_item.product_id, v_item.variant_id, v_location_type, v_location_id,
    true, false, 0, v_item.ordered_quantity, v_item.unit_id, 'pending', 'manual', v_key, auth.uid(), 0
  ) returning id into v_reservation_id;

  for v_alloc in select * from jsonb_array_elements(p_batch_allocations) loop
    v_batch_id := (v_alloc->>'batch_id')::uuid;
    v_qty := (v_alloc->>'quantity')::numeric;
    if v_qty <= 0 then continue; end if;

    if v_location_type = 'warehouse' then
      select quantity - reserved_quantity into v_available from warehouse_stock where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id = v_batch_id;
    else
      select quantity - reserved_quantity into v_available from van_stock where van_id = v_location_id and product_id = v_item.product_id and batch_id = v_batch_id;
    end if;

    if coalesce(v_available, 0) < v_qty then
      raise exception 'Only % available in the chosen batch — % requested', coalesce(v_available, 0), v_qty;
    end if;

    insert into sales_order_item_batch_reservations (company_id, reservation_id, batch_id, allocated_quantity)
    values (v_order.company_id, v_reservation_id, v_batch_id, v_qty);

    if v_location_type = 'warehouse' then
      update warehouse_stock set reserved_quantity = reserved_quantity + v_qty where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id = v_batch_id;
    else
      update van_stock set reserved_quantity = reserved_quantity + v_qty where van_id = v_location_id and product_id = v_item.product_id and batch_id = v_batch_id;
    end if;

    v_total_allocated := v_total_allocated + v_qty;
  end loop;

  update sales_order_stock_reservations set
    reserved_base_quantity = v_total_allocated, remaining_quantity = v_total_allocated,
    status = case when v_total_allocated <= 0 then 'pending' when v_total_allocated < v_item.base_quantity then 'partially_reserved' else 'fully_reserved' end
  where id = v_reservation_id;

  insert into sales_order_reservation_history (company_id, reservation_id, action, quantity_change, reason, performed_by)
  values (v_order.company_id, v_reservation_id, 'created', v_total_allocated, 'Manual batch selection', auth.uid());

  return v_reservation_id;
end;
$$;
grant execute on function create_manual_batch_reservation(uuid, jsonb, text) to authenticated;

-- Same idea for serials: a manual pick of specific serial IDs rather
-- than the earliest-created-first auto-selection in
-- create_stock_reservation(). Prevents duplicate/blocked/sold serials
-- the same way the automatic path does, via the underlying unique
-- constraint on sales_order_item_serial_reservations.serial_id and the
-- status = 'in_stock' filter in available_serials_for_item().
create or replace function create_manual_serial_reservation(p_order_item_id uuid, p_serial_ids uuid[], p_idempotency_key text default null)
returns uuid language plpgsql security definer as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_existing_id uuid;
  v_reservation_id uuid;
  v_location_type text;
  v_location_id uuid;
  v_serial_id uuid;
  v_taken integer := 0;
  v_key text := coalesce(p_idempotency_key, p_order_item_id::text || '-manual');
begin
  if not has_permission('sales_orders:select_serial_numbers') then raise exception 'Not permitted'; end if;

  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;

  select id into v_existing_id from sales_order_stock_reservations where order_item_id = p_order_item_id and idempotency_key = v_key;
  if v_existing_id is not null then return v_existing_id; end if;

  select * into v_order from sales_orders where id = v_item.order_id;
  v_location_type := case when v_order.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_order.source_van_id, v_order.van_id) else coalesce(v_order.source_warehouse_id, v_order.warehouse_id) end;

  insert into sales_order_stock_reservations (
    company_id, order_id, order_item_id, product_id, variant_id, location_type, location_id,
    requires_batch, requires_serial, reserved_base_quantity, reserved_sales_quantity, sales_unit_id,
    status, allocation_method, idempotency_key, created_by, remaining_quantity
  ) values (
    v_order.company_id, v_item.order_id, p_order_item_id, v_item.product_id, v_item.variant_id, v_location_type, v_location_id,
    false, true, 0, v_item.ordered_quantity, v_item.unit_id, 'pending', 'manual', v_key, auth.uid(), 0
  ) returning id into v_reservation_id;

  foreach v_serial_id in array p_serial_ids loop
    if not exists (select 1 from product_serials where id = v_serial_id and product_id = v_item.product_id and status = 'in_stock') then
      raise exception 'Serial % is not available (already sold, blocked, or reserved elsewhere)', v_serial_id;
    end if;
    insert into sales_order_item_serial_reservations (company_id, reservation_id, serial_id)
    values (v_order.company_id, v_reservation_id, v_serial_id)
    on conflict (serial_id) do nothing;
    v_taken := v_taken + 1;
  end loop;

  update sales_order_stock_reservations set
    reserved_base_quantity = v_taken, remaining_quantity = v_taken,
    status = case when v_taken <= 0 then 'pending' when v_taken < v_item.base_quantity then 'partially_reserved' else 'fully_reserved' end
  where id = v_reservation_id;

  insert into sales_order_reservation_history (company_id, reservation_id, action, quantity_change, reason, performed_by)
  values (v_order.company_id, v_reservation_id, 'created', v_taken, 'Manual serial selection', auth.uid());

  return v_reservation_id;
end;
$$;
grant execute on function create_manual_serial_reservation(uuid, uuid[], text) to authenticated;
