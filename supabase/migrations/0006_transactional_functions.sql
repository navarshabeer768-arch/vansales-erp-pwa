-- ============================================================================
-- 0006_transactional_functions.sql
-- Every operation that touches stock or money goes through one of these
-- functions so it either fully succeeds or fully rolls back. Never mutate
-- warehouse_stock / van_stock directly from the client.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Generic upsert-add helper for warehouse_stock
-- ---------------------------------------------------------------------------
create or replace function _add_warehouse_stock(
  p_warehouse_id uuid, p_product_id uuid, p_batch_id uuid, p_delta numeric
) returns void language plpgsql as $$
begin
  insert into warehouse_stock (company_id, warehouse_id, product_id, batch_id, quantity)
  values (current_company_id(), p_warehouse_id, p_product_id, p_batch_id, p_delta)
  on conflict (warehouse_id, product_id, batch_id)
  do update set quantity = warehouse_stock.quantity + excluded.quantity, updated_at = now();

  if (select quantity from warehouse_stock
      where warehouse_id = p_warehouse_id and product_id = p_product_id
        and batch_id is not distinct from p_batch_id) < 0 then
    raise exception 'Insufficient warehouse stock for product % in warehouse %', p_product_id, p_warehouse_id;
  end if;
end;
$$;

create or replace function _add_van_stock(
  p_van_id uuid, p_product_id uuid, p_batch_id uuid, p_delta numeric
) returns void language plpgsql as $$
begin
  insert into van_stock (company_id, van_id, product_id, batch_id, quantity)
  values (current_company_id(), p_van_id, p_product_id, p_batch_id, p_delta)
  on conflict (van_id, product_id, batch_id)
  do update set quantity = van_stock.quantity + excluded.quantity, updated_at = now();

  if (select quantity from van_stock
      where van_id = p_van_id and product_id = p_product_id
        and batch_id is not distinct from p_batch_id) < 0 then
    raise exception 'Insufficient van stock for product % in van %', p_product_id, p_van_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- APPROVE VAN LOADING: warehouse -> van, atomic, logs stock_movements
-- ---------------------------------------------------------------------------
create or replace function approve_van_loading(p_loading_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_loading van_loadings%rowtype;
  v_item record;
begin
  select * into v_loading from van_loadings where id = p_loading_id and company_id = current_company_id();
  if not found then raise exception 'Loading sheet not found'; end if;
  if v_loading.status = 'approved' then raise exception 'Loading already approved'; end if;

  for v_item in select * from van_loading_items where loading_id = p_loading_id loop
    perform _add_warehouse_stock(v_loading.warehouse_id, v_item.product_id, v_item.batch_id,
      -coalesce(v_item.quantity_verified, v_item.quantity_requested));
    perform _add_van_stock(v_loading.van_id, v_item.product_id, v_item.batch_id,
      coalesce(v_item.quantity_verified, v_item.quantity_requested));

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by)
    values (current_company_id(), v_item.product_id, v_item.batch_id, 'van_load',
      'warehouse', v_loading.warehouse_id, 'van', v_loading.van_id,
      coalesce(v_item.quantity_verified, v_item.quantity_requested), 'van_loadings', p_loading_id, p_approver_id);
  end loop;

  update van_loadings set status = 'approved', approved_by = p_approver_id, approved_at = now()
  where id = p_loading_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- APPROVE VAN UNLOADING: van -> warehouse (remaining) or write-off (damaged/expired)
-- ---------------------------------------------------------------------------
create or replace function approve_van_unloading(p_unloading_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_unloading van_unloadings%rowtype;
  v_item record;
  v_movement_type text;
begin
  select * into v_unloading from van_unloadings where id = p_unloading_id and company_id = current_company_id();
  if not found then raise exception 'Unloading sheet not found'; end if;
  if v_unloading.status = 'approved' then raise exception 'Unloading already approved'; end if;

  for v_item in select * from van_unloading_items where unloading_id = p_unloading_id loop
    perform _add_van_stock(v_unloading.van_id, v_item.product_id, v_item.batch_id, -v_item.quantity);

    if v_item.item_type = 'remaining' then
      perform _add_warehouse_stock(v_unloading.warehouse_id, v_item.product_id, v_item.batch_id, v_item.quantity);
      v_movement_type := 'van_unload';
    elsif v_item.item_type = 'customer_return' then
      perform _add_warehouse_stock(v_unloading.warehouse_id, v_item.product_id, v_item.batch_id, v_item.quantity);
      v_movement_type := 'sales_return_in';
    else
      v_movement_type := v_item.item_type; -- 'damaged' handled as 'damage', 'expired' logged, no stock added back
    end if;

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by)
    values (current_company_id(), v_item.product_id, v_item.batch_id,
      case when v_item.item_type = 'remaining' then 'van_unload'
           when v_item.item_type = 'customer_return' then 'sales_return_in'
           when v_item.item_type = 'damaged' then 'damage'
           else 'adjustment' end,
      'van', v_unloading.van_id,
      case when v_item.item_type in ('remaining','customer_return') then 'warehouse' else 'none' end,
      case when v_item.item_type in ('remaining','customer_return') then v_unloading.warehouse_id else null end,
      v_item.quantity, 'van_unloadings', p_unloading_id, p_approver_id);
  end loop;

  update van_unloadings set status = 'approved', approved_by = p_approver_id, approved_at = now()
  where id = p_unloading_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- PROCESS A SALE: validates stock, deducts van stock, updates customer balance,
-- all in one transaction. Idempotent via client_uuid so offline retries are safe.
-- ---------------------------------------------------------------------------
create or replace function process_sale(p_sale_id uuid)
returns void language plpgsql security definer as $$
declare
  v_sale sales%rowtype;
  v_item record;
  v_available numeric;
begin
  select * into v_sale from sales where id = p_sale_id and company_id = current_company_id();
  if not found then raise exception 'Sale not found'; end if;

  -- idempotency: if stock_movements already reference this sale, skip re-processing
  if exists (select 1 from stock_movements where reference_table = 'sales' and reference_id = p_sale_id) then
    return;
  end if;

  for v_item in select * from sale_items where sale_id = p_sale_id loop
    if v_sale.van_id is not null then
      select coalesce(quantity, 0) into v_available from van_stock
        where van_id = v_sale.van_id and product_id = v_item.product_id
          and batch_id is not distinct from v_item.batch_id;
      if coalesce(v_available, 0) < v_item.quantity then
        raise exception 'Insufficient van stock for product % (have %, need %)', v_item.product_id, coalesce(v_available,0), v_item.quantity;
      end if;
      perform _add_van_stock(v_sale.van_id, v_item.product_id, v_item.batch_id, -v_item.quantity);
    end if;

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id)
    values (current_company_id(), v_item.product_id, v_item.batch_id, 'sale_out',
      case when v_sale.van_id is not null then 'van' else 'warehouse' end, v_sale.van_id,
      'customer', v_sale.customer_id, v_item.quantity, 'sales', p_sale_id);
  end loop;

  if v_sale.customer_id is not null and v_sale.balance_amount > 0 then
    update customers set outstanding_balance = outstanding_balance + v_sale.balance_amount
    where id = v_sale.customer_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RECORD A COLLECTION: reduces customer outstanding balance atomically
-- ---------------------------------------------------------------------------
create or replace function record_collection(p_collection_id uuid)
returns void language plpgsql security definer as $$
declare
  v_collection collections%rowtype;
begin
  select * into v_collection from collections where id = p_collection_id and company_id = current_company_id();
  if not found then raise exception 'Collection not found'; end if;

  update customers set outstanding_balance = outstanding_balance - v_collection.amount
  where id = v_collection.customer_id;

  if v_collection.applied_to_sale_id is not null then
    update sales set paid_amount = paid_amount + v_collection.amount
    where id = v_collection.applied_to_sale_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- APPROVE STOCK ADJUSTMENT (count / damage / loss / correction)
-- ---------------------------------------------------------------------------
create or replace function approve_stock_adjustment(p_adjustment_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_adj stock_adjustments%rowtype;
  v_item record;
begin
  select * into v_adj from stock_adjustments where id = p_adjustment_id and company_id = current_company_id();
  if not found then raise exception 'Adjustment not found'; end if;
  if v_adj.status = 'approved' then raise exception 'Already approved'; end if;

  for v_item in select * from stock_adjustment_items where adjustment_id = p_adjustment_id loop
    if v_adj.location_type = 'warehouse' then
      perform _add_warehouse_stock(v_adj.location_id, v_item.product_id, v_item.batch_id, v_item.difference);
    else
      perform _add_van_stock(v_adj.location_id, v_item.product_id, v_item.batch_id, v_item.difference);
    end if;

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by, notes)
    values (current_company_id(), v_item.product_id, v_item.batch_id,
      case v_adj.adjustment_type when 'damage' then 'damage' when 'loss' then 'loss' else 'adjustment' end,
      'none', null, v_adj.location_type, v_adj.location_id,
      v_item.difference, 'stock_adjustments', p_adjustment_id, p_approver_id, v_adj.reason);
  end loop;

  update stock_adjustments set status = 'approved', approved_by = p_approver_id, approved_at = now()
  where id = p_adjustment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- APPROVE WAREHOUSE TRANSFER
-- ---------------------------------------------------------------------------
create or replace function approve_warehouse_transfer(p_transfer_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_transfer warehouse_transfers%rowtype;
  v_item record;
begin
  select * into v_transfer from warehouse_transfers where id = p_transfer_id and company_id = current_company_id();
  if not found then raise exception 'Transfer not found'; end if;
  if v_transfer.status = 'completed' then raise exception 'Already completed'; end if;

  for v_item in select * from warehouse_transfer_items where transfer_id = p_transfer_id loop
    perform _add_warehouse_stock(v_transfer.from_warehouse_id, v_item.product_id, v_item.batch_id, -v_item.quantity);
    perform _add_warehouse_stock(v_transfer.to_warehouse_id, v_item.product_id, v_item.batch_id, v_item.quantity);

    insert into stock_movements (company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, created_by)
    values (current_company_id(), v_item.product_id, v_item.batch_id, 'warehouse_transfer',
      'warehouse', v_transfer.from_warehouse_id, 'warehouse', v_transfer.to_warehouse_id,
      v_item.quantity, 'warehouse_transfers', p_transfer_id, p_approver_id);
  end loop;

  update warehouse_transfers set status = 'completed', approved_by = p_approver_id, completed_at = now()
  where id = p_transfer_id;
end;
$$;
