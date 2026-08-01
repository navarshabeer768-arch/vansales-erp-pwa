-- ============================================================================
-- 0049_backorders_transfer_requests.sql
-- Continues 0047-0048.
-- ============================================================================

create table sales_order_backorders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid not null references sales_order_items(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  variant_id uuid references product_variants(id) on delete set null,
  requested_quantity numeric(14,3) not null,
  reserved_quantity numeric(14,3) not null default 0,
  backorder_quantity numeric(14,3) not null,
  unit_id uuid references units(id),
  base_quantity numeric(14,3) not null,
  required_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  warehouse_id uuid references warehouses(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  reason text,
  status text not null default 'pending' check (status in (
    'pending', 'waiting_for_stock', 'partially_available', 'available', 'allocated',
    'partially_fulfilled', 'fulfilled', 'cancelled', 'expired', 'closed'
  )),
  expected_availability_date date,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sales_order_backorders_company_status on sales_order_backorders(company_id, status);
create index idx_sales_order_backorders_product on sales_order_backorders(product_id, status);
create index idx_sales_order_backorders_customer on sales_order_backorders(customer_id);

alter table sales_order_backorders enable row level security;
create policy sales_order_backorders_isolation on sales_order_backorders for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_sales_order_backorders_updated_at before update on sales_order_backorders
  for each row execute function set_updated_at();

create table sales_order_backorder_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  backorder_id uuid not null references sales_order_backorders(id) on delete cascade,
  old_status text, new_status text not null,
  quantity_allocated numeric(14,3),
  reason text,
  performed_by uuid references app_users(id),
  performed_at timestamptz not null default now()
);
create index idx_sales_order_backorder_history_backorder on sales_order_backorder_history(backorder_id);

alter table sales_order_backorder_history enable row level security;
create policy sales_order_backorder_history_isolation on sales_order_backorder_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Creates a backorder for the short quantity on an order item — called
-- explicitly by the client after showing the person the validation
-- shortfall (this doc: "Display the selected outcome before submission"),
-- not auto-invoked silently inside reservation.
create or replace function create_backorder(
  p_order_item_id uuid, p_backorder_quantity numeric, p_required_date date default null,
  p_priority text default 'medium', p_reason text default null
) returns uuid language plpgsql security definer as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_backorder_id uuid;
begin
  if not has_permission('sales_orders:create_backorder') then raise exception 'Not permitted'; end if;
  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from sales_orders where id = v_item.order_id;

  insert into sales_order_backorders (
    company_id, order_id, order_item_id, customer_id, product_id, variant_id,
    requested_quantity, backorder_quantity, unit_id, base_quantity, required_date, priority,
    warehouse_id, van_id, reason, status, created_by
  ) values (
    v_order.company_id, v_order.id, p_order_item_id, v_order.customer_id, v_item.product_id, v_item.variant_id,
    v_item.ordered_quantity, p_backorder_quantity, v_item.unit_id, p_backorder_quantity, p_required_date, p_priority,
    v_order.source_warehouse_id, v_order.source_van_id, p_reason, 'pending', auth.uid()
  ) returning id into v_backorder_id;

  insert into sales_order_backorder_history (company_id, backorder_id, old_status, new_status, performed_by)
  values (v_order.company_id, v_backorder_id, null, 'pending', auth.uid());

  update sales_orders set stock_validation_status = 'backorder_required' where id = v_order.id;

  return v_backorder_id;
end;
$$;
grant execute on function create_backorder(uuid, numeric, date, text, text) to authenticated;

-- Scans pending/waiting backorders for a product and reports which ones
-- now have available stock, in priority order — does NOT silently
-- reserve across companies/branches (each backorder already carries its
-- own company_id via RLS, and this only ever looks within the caller's
-- company). Allocation into a real reservation is a separate explicit
-- step (create_stock_reservation), matching "Notify Responsible User"
-- rather than "auto-fulfil silently".
create or replace function check_backorder_availability(p_product_id uuid)
returns table (backorder_id uuid, order_id uuid, backorder_quantity numeric, available_quantity numeric, can_fulfil boolean) language plpgsql stable as $$
declare
  v_backorder record;
  v_location_type text;
  v_location_id uuid;
  v_atp record;
begin
  for v_backorder in
    select bo.*, so.stock_source_type, so.source_warehouse_id, so.source_van_id, so.van_id as order_van_id, so.warehouse_id as order_warehouse_id,
      so.order_date
    from sales_order_backorders bo
    join sales_orders so on so.id = bo.order_id
    where bo.product_id = p_product_id and bo.status in ('pending', 'waiting_for_stock', 'partially_available')
      and bo.company_id = current_company_id()
    order by
      case bo.priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,
      bo.required_date nulls last, so.order_date
  loop
    v_location_type := case when v_backorder.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
    v_location_id := case when v_location_type = 'van' then coalesce(v_backorder.source_van_id, v_backorder.order_van_id)
      else coalesce(v_backorder.source_warehouse_id, v_backorder.order_warehouse_id) end;

    if v_location_id is not null then
      select * into v_atp from calculate_available_to_promise(v_location_type, v_location_id, p_product_id);
      backorder_id := v_backorder.id; order_id := v_backorder.order_id; backorder_quantity := v_backorder.backorder_quantity;
      available_quantity := v_atp.available_to_promise; can_fulfil := v_atp.available_to_promise >= v_backorder.backorder_quantity;
      return next;
    end if;
  end loop;
end;
$$;
grant execute on function check_backorder_availability(uuid) to authenticated;

create or replace function update_backorder_status(p_backorder_id uuid, p_new_status text, p_quantity_allocated numeric default null, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid;
begin
  if not has_permission('sales_orders:manage_backorders') then raise exception 'Not permitted'; end if;
  select status, company_id into v_old, v_company_id from sales_order_backorders where id = p_backorder_id;
  if v_old is null then raise exception 'Backorder not found'; end if;

  update sales_order_backorders set status = p_new_status,
    reserved_quantity = coalesce(p_quantity_allocated, reserved_quantity)
  where id = p_backorder_id;

  insert into sales_order_backorder_history (company_id, backorder_id, old_status, new_status, quantity_allocated, reason, performed_by)
  values (v_company_id, p_backorder_id, v_old, p_new_status, p_quantity_allocated, p_reason, auth.uid());
end;
$$;
grant execute on function update_backorder_status(uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- STOCK TRANSFER REQUEST — links to the EXISTING warehouse_transfers /
-- van_transfers modules rather than duplicating a transfer engine. This
-- table only tracks the order-side request; the actual transfer document
-- lives in whichever existing table matches the source/destination types.
-- ---------------------------------------------------------------------------
create table sales_order_stock_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid not null references sales_order_items(id) on delete cascade,
  source_location_type text not null check (source_location_type in ('warehouse', 'van')),
  source_location_id uuid not null,
  destination_location_type text not null check (destination_location_type in ('warehouse', 'van')),
  destination_location_id uuid not null,
  requested_quantity numeric(14,3) not null,
  required_date date,
  reason text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected', 'cancelled')),
  warehouse_transfer_id uuid references warehouse_transfers(id) on delete set null,
  van_transfer_id uuid references van_transfers(id) on delete set null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_sales_order_stock_transfer_requests_order on sales_order_stock_transfer_requests(order_id);

alter table sales_order_stock_transfer_requests enable row level security;
create policy sales_order_stock_transfer_requests_isolation on sales_order_stock_transfer_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function request_stock_transfer(
  p_order_item_id uuid, p_source_type text, p_source_id uuid, p_destination_type text, p_destination_id uuid,
  p_quantity numeric, p_required_date date default null, p_reason text default null
) returns uuid language plpgsql security definer as $$
declare
  v_item sales_order_items%rowtype;
  v_order sales_orders%rowtype;
  v_request_id uuid;
begin
  if not has_permission('sales_orders:request_stock_transfer') then raise exception 'Not permitted'; end if;
  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from sales_orders where id = v_item.order_id;

  insert into sales_order_stock_transfer_requests (
    company_id, order_id, order_item_id, source_location_type, source_location_id,
    destination_location_type, destination_location_id, requested_quantity, required_date, reason, created_by
  ) values (
    v_order.company_id, v_order.id, p_order_item_id, p_source_type, p_source_id,
    p_destination_type, p_destination_id, p_quantity, p_required_date, p_reason, auth.uid()
  ) returning id into v_request_id;

  update sales_orders set stock_validation_status = 'requires_transfer' where id = v_order.id;

  return v_request_id;
end;
$$;
grant execute on function request_stock_transfer(uuid, text, uuid, text, uuid, numeric, date, text) to authenticated;
