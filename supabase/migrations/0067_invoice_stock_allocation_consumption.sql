-- ============================================================================
-- 0067_invoice_stock_allocation_consumption.sql
-- Continues 0066. Performs REAL physical stock deduction.
-- ============================================================================

create table sales_invoice_stock_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  invoice_item_id uuid not null references sales_invoice_items(id) on delete cascade,
  location_type text not null check (location_type in ('warehouse', 'van')),
  location_id uuid not null,
  allocation_source text not null check (allocation_source in ('reservation', 'direct')),
  reservation_id uuid references sales_order_stock_reservations(id) on delete set null,
  requires_batch boolean not null default false,
  requires_serial boolean not null default false,
  allocated_base_quantity numeric(14,3) not null check (allocated_base_quantity >= 0),
  allocation_method text not null default 'fefo' check (allocation_method in ('fifo', 'fefo', 'manual')),
  created_at timestamptz not null default now(),
  unique (invoice_item_id)
);
create index idx_sales_invoice_stock_allocations_invoice on sales_invoice_stock_allocations(invoice_id);

alter table sales_invoice_stock_allocations enable row level security;
create policy sales_invoice_stock_allocations_isolation on sales_invoice_stock_allocations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_item_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  allocation_id uuid not null references sales_invoice_stock_allocations(id) on delete cascade,
  batch_id uuid not null references batches(id) on delete restrict,
  allocated_quantity numeric(14,3) not null check (allocated_quantity > 0),
  suggested_batch_id uuid references batches(id) on delete set null,
  is_manual_override boolean not null default false,
  override_reason text,
  override_requested_by uuid references app_users(id),
  override_approved_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_sales_invoice_item_batches_allocation on sales_invoice_item_batches(allocation_id);

alter table sales_invoice_item_batches enable row level security;
create policy sales_invoice_item_batches_isolation on sales_invoice_item_batches for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_item_serials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  allocation_id uuid not null references sales_invoice_stock_allocations(id) on delete cascade,
  serial_id uuid not null references product_serials(id) on delete restrict,
  is_manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  unique (serial_id)
);
create index idx_sales_invoice_item_serials_allocation on sales_invoice_item_serials(allocation_id);

alter table sales_invoice_item_serials enable row level security;
create policy sales_invoice_item_serials_isolation on sales_invoice_item_serials for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function allocate_invoice_item_stock(p_invoice_item_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_item sales_invoice_items%rowtype;
  v_invoice sales_invoices%rowtype;
  v_product products%rowtype;
  v_location_type text;
  v_location_id uuid;
  v_allocation_id uuid;
  v_reservation sales_order_stock_reservations%rowtype;
  v_batch_res record;
  v_take numeric;
  v_remaining numeric;
  v_alloc record;
  v_serial_res record;
  v_serial_id uuid;
  v_needed integer;
  v_serial_ids uuid[];
  v_total_allocated numeric := 0;
begin
  select * into v_item from sales_invoice_items where id = p_invoice_item_id;
  if not found then raise exception 'Invoice item not found'; end if;
  if v_item.is_free_item then return null; end if;

  select * into v_invoice from sales_invoices where id = v_item.invoice_id;
  select * into v_product from products where id = v_item.product_id;

  v_location_type := case when v_invoice.stock_source_type in ('specific_van', 'van_stock') then 'van' else 'warehouse' end;
  v_location_id := case when v_location_type = 'van' then coalesce(v_invoice.source_van_id, v_invoice.van_id) else coalesce(v_invoice.source_warehouse_id, v_invoice.warehouse_id) end;
  if v_location_id is null then raise exception 'Invoice has no stock source location configured'; end if;

  if v_item.order_item_id is not null then
    select * into v_reservation from sales_order_stock_reservations
    where order_item_id = v_item.order_item_id and status in ('active', 'partially_reserved', 'fully_reserved')
    order by created_at desc limit 1;
  end if;

  insert into sales_invoice_stock_allocations (
    company_id, invoice_id, invoice_item_id, location_type, location_id, allocation_source, reservation_id,
    requires_batch, requires_serial, allocated_base_quantity, allocation_method
  ) values (
    v_invoice.company_id, v_item.invoice_id, p_invoice_item_id, v_location_type, v_location_id,
    case when v_reservation.id is not null then 'reservation' else 'direct' end, v_reservation.id,
    v_product.track_batches, v_product.track_serials, 0, v_invoice.allocation_method
  ) returning id into v_allocation_id;

  if v_reservation.id is not null then
    v_remaining := least(v_item.base_quantity, v_reservation.remaining_quantity);

    if v_product.track_batches then
      for v_batch_res in select * from sales_order_item_batch_reservations where reservation_id = v_reservation.id order by created_at loop
        exit when v_remaining <= 0;
        v_take := least(v_batch_res.allocated_quantity, v_remaining);
        if v_take <= 0 then continue; end if;

        insert into sales_invoice_item_batches (company_id, allocation_id, batch_id, allocated_quantity)
        values (v_invoice.company_id, v_allocation_id, v_batch_res.batch_id, v_take);

        if v_location_type = 'warehouse' then
          update warehouse_stock set quantity = quantity - v_take, reserved_quantity = greatest(reserved_quantity - v_take, 0)
          where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id = v_batch_res.batch_id;
        else
          update van_stock set quantity = quantity - v_take, reserved_quantity = greatest(reserved_quantity - v_take, 0)
          where van_id = v_location_id and product_id = v_item.product_id and batch_id = v_batch_res.batch_id;
        end if;

        v_total_allocated := v_total_allocated + v_take;
        v_remaining := v_remaining - v_take;
      end loop;
    elsif v_product.track_serials then
      for v_serial_res in select * from sales_order_item_serial_reservations where reservation_id = v_reservation.id order by created_at loop
        exit when v_remaining <= 0;
        insert into sales_invoice_item_serials (company_id, allocation_id, serial_id) values (v_invoice.company_id, v_allocation_id, v_serial_res.serial_id);
        update product_serials set status = 'sold' where id = v_serial_res.serial_id;
        v_total_allocated := v_total_allocated + 1;
        v_remaining := v_remaining - 1;
      end loop;
    else
      if v_location_type = 'warehouse' then
        update warehouse_stock set quantity = quantity - v_remaining, reserved_quantity = greatest(reserved_quantity - v_remaining, 0)
        where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id is null;
      else
        update van_stock set quantity = quantity - v_remaining, reserved_quantity = greatest(reserved_quantity - v_remaining, 0)
        where van_id = v_location_id and product_id = v_item.product_id and batch_id is null;
      end if;
      v_total_allocated := v_remaining;
    end if;

    update sales_order_stock_reservations set
      converted_quantity = converted_quantity + v_total_allocated, remaining_quantity = greatest(remaining_quantity - v_total_allocated, 0),
      status = case when remaining_quantity - v_total_allocated <= 0 then 'consumed' else status end
    where id = v_reservation.id;

  else
    if v_location_type = 'warehouse' then
      perform 1 from warehouse_stock where warehouse_id = v_location_id and product_id = v_item.product_id for update;
    else
      perform 1 from van_stock where van_id = v_location_id and product_id = v_item.product_id for update;
    end if;

    if v_product.track_serials then
      v_needed := v_item.base_quantity::integer;
      select array_agg(id) into v_serial_ids from (
        select id from product_serials
        where product_id = v_item.product_id and status = 'in_stock'
          and current_location_type = v_location_type and current_location_id = v_location_id
        order by created_at limit v_needed
      ) s;

      foreach v_serial_id in array coalesce(v_serial_ids, array[]::uuid[]) loop
        insert into sales_invoice_item_serials (company_id, allocation_id, serial_id) values (v_invoice.company_id, v_allocation_id, v_serial_id)
        on conflict (serial_id) do nothing;
        update product_serials set status = 'sold' where id = v_serial_id;
      end loop;
      v_total_allocated := coalesce(array_length(v_serial_ids, 1), 0);

    elsif v_product.track_batches then
      for v_alloc in select * from allocate_stock_fifo(v_location_type, v_location_id, v_item.product_id, v_item.base_quantity, v_invoice.allocation_method) loop
        if v_alloc.short_quantity > 0 then continue; end if;
        insert into sales_invoice_item_batches (company_id, allocation_id, batch_id, allocated_quantity)
        values (v_invoice.company_id, v_allocation_id, v_alloc.batch_id, v_alloc.allocated_quantity);

        if v_location_type = 'warehouse' then
          update warehouse_stock set quantity = quantity - v_alloc.allocated_quantity
          where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id = v_alloc.batch_id;
        else
          update van_stock set quantity = quantity - v_alloc.allocated_quantity
          where van_id = v_location_id and product_id = v_item.product_id and batch_id = v_alloc.batch_id;
        end if;
        v_total_allocated := v_total_allocated + v_alloc.allocated_quantity;
      end loop;

    else
      if v_location_type = 'warehouse' then
        update warehouse_stock set quantity = quantity - v_item.base_quantity
        where warehouse_id = v_location_id and product_id = v_item.product_id and batch_id is null and quantity >= v_item.base_quantity;
      else
        update van_stock set quantity = quantity - v_item.base_quantity
        where van_id = v_location_id and product_id = v_item.product_id and batch_id is null and quantity >= v_item.base_quantity;
      end if;
      if not found then raise exception 'Insufficient stock for % at this location', v_product.name; end if;
      v_total_allocated := v_item.base_quantity;
    end if;
  end if;

  if v_total_allocated < v_item.base_quantity then
    raise exception 'Could only allocate %.3f of %.3f requested for %', v_total_allocated, v_item.base_quantity, v_product.name;
  end if;

  update sales_invoice_stock_allocations set allocated_base_quantity = v_total_allocated where id = v_allocation_id;

  return v_allocation_id;
end;
$$;
grant execute on function allocate_invoice_item_stock(uuid) to authenticated;
