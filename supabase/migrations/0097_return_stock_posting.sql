-- ============================================================================
-- 0097_return_stock_posting.sql
-- Continues 0096.
-- ============================================================================

alter table sales_return_items add column if not exists accepted_saleable_quantity numeric(14,3) not null default 0;
alter table sales_return_items add column if not exists accepted_damaged_quantity numeric(14,3) not null default 0;
alter table sales_return_items add column if not exists accepted_expired_quantity numeric(14,3) not null default 0;
alter table sales_return_items add column if not exists quarantine_quantity numeric(14,3) not null default 0;
alter table sales_return_items add column if not exists rejected_quantity numeric(14,3) not null default 0;
alter table sales_return_items add column if not exists posted_stock_destination text check (posted_stock_destination in ('saleable', 'damaged', 'expired', 'quarantine', 'mixed', 'rejected') or posted_stock_destination is null);

create table sales_return_stock_destinations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  code text not null,
  label text not null,
  is_saleable boolean not null default false,
  is_active boolean not null default true
);
create unique index idx_sales_return_stock_destinations_system_code on sales_return_stock_destinations(code) where company_id is null;

insert into sales_return_stock_destinations (code, company_id, label, is_saleable) values
  ('saleable_warehouse', null, 'Saleable Warehouse', true), ('saleable_van', null, 'Saleable Van Stock', true),
  ('damaged_warehouse', null, 'Damaged Warehouse', false), ('expired_stock_location', null, 'Expired Stock Location', false),
  ('quarantine_location', null, 'Quarantine Location', false), ('scrap_location', null, 'Scrap Location', false),
  ('return_to_customer_holding', null, 'Return-to-Customer Holding', false), ('custom_inventory_location', null, 'Custom Inventory Location', false);

alter table sales_return_stock_destinations enable row level security;
create policy sales_return_stock_destinations_read on sales_return_stock_destinations for all
  using (company_id is null or company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_stock_postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete restrict,
  return_item_id uuid not null references sales_return_items(id) on delete restrict,
  stock_movement_id uuid references stock_movements(id) on delete set null,
  destination_code text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  location_type text not null check (location_type in ('warehouse', 'van')),
  location_id uuid not null,
  batch_id uuid references batches(id) on delete set null,
  posted_by uuid references app_users(id),
  posted_at timestamptz not null default now(),
  reversed boolean not null default false
);
create index idx_sales_return_stock_postings_return on sales_return_stock_postings(return_id);
create index idx_sales_return_stock_postings_item on sales_return_stock_postings(return_item_id);

alter table sales_return_stock_postings enable row level security;
create policy sales_return_stock_postings_isolation on sales_return_stock_postings for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function post_return_stock_quantity(
  p_return_id uuid, p_return_item_id uuid, p_product_id uuid, p_quantity numeric, p_destination_code text,
  p_location_type text, p_location_id uuid, p_batch_id uuid default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_movement_type text;
  v_is_saleable boolean;
  v_movement_id uuid;
  v_posting_id uuid;
begin
  select company_id into v_company_id from sales_returns where id = p_return_id;
  select is_saleable into v_is_saleable from sales_return_stock_destinations where code = p_destination_code and (company_id is null or company_id = v_company_id) limit 1;

  v_movement_type := case p_destination_code
    when 'saleable_warehouse' then 'sales_return_in'
    when 'saleable_van' then 'sales_return_in'
    when 'damaged_warehouse' then 'damaged_return_in'
    when 'expired_stock_location' then 'expired_return_in'
    when 'quarantine_location' then 'quarantine_return_in'
    else 'sales_return_in'
  end;

  insert into stock_movements (
    company_id, product_id, movement_type, quantity, from_location_type, from_location_id, to_location_type, to_location_id,
    batch_id, reference_table, reference_id
  ) values (
    v_company_id, p_product_id, v_movement_type, p_quantity, 'customer', null, p_location_type, p_location_id,
    p_batch_id, 'sales_returns', p_return_id
  ) returning id into v_movement_id;

  if v_is_saleable then
    if p_location_type = 'warehouse' then
      insert into warehouse_stock (company_id, warehouse_id, product_id, batch_id, quantity)
      values (v_company_id, p_location_id, p_product_id, p_batch_id, p_quantity)
      on conflict (warehouse_id, product_id, batch_id) do update set quantity = warehouse_stock.quantity + p_quantity, updated_at = now();
    else
      insert into van_stock (company_id, van_id, product_id, batch_id, quantity)
      values (v_company_id, p_location_id, p_product_id, p_batch_id, p_quantity)
      on conflict (van_id, product_id, batch_id) do update set quantity = van_stock.quantity + p_quantity, updated_at = now();
    end if;
  end if;

  insert into sales_return_stock_postings (company_id, return_id, return_item_id, stock_movement_id, destination_code, quantity, location_type, location_id, batch_id, posted_by)
  values (v_company_id, p_return_id, p_return_item_id, v_movement_id, p_destination_code, p_quantity, p_location_type, p_location_id, p_batch_id, auth.uid())
  returning id into v_posting_id;

  return v_posting_id;
end;
$$;
grant execute on function post_return_stock_quantity(uuid, uuid, uuid, numeric, text, text, text, uuid, uuid) to authenticated;

create or replace function post_return_item_stock(p_return_item_id uuid, p_location_type text, p_location_id uuid)
returns void language plpgsql security definer as $$
declare
  v_item sales_return_items%rowtype;
  v_return sales_returns%rowtype;
  v_batch record;
  v_batch_remaining numeric;
  v_take numeric;
  v_destination text;
  v_qty numeric;
begin
  select * into v_item from sales_return_items where id = p_return_item_id;
  select * into v_return from sales_returns where id = v_item.return_id;

  for v_destination, v_qty in
    select * from (values
      ('saleable_warehouse_or_van', v_item.accepted_saleable_quantity),
      ('damaged_warehouse', v_item.accepted_damaged_quantity),
      ('expired_stock_location', v_item.accepted_expired_quantity),
      ('quarantine_location', v_item.quarantine_quantity)
    ) as t(destination, qty)
    where qty > 0
  loop
    if v_destination = 'saleable_warehouse_or_van' then
      v_destination := case when p_location_type = 'van' then 'saleable_van' else 'saleable_warehouse' end;
    end if;

    if v_item.batch_required and exists (select 1 from sales_return_item_batches where return_item_id = p_return_item_id) then
      v_batch_remaining := v_qty;
      for v_batch in select * from sales_return_item_batches where return_item_id = p_return_item_id order by created_at loop
        exit when v_batch_remaining <= 0;
        v_take := least(v_batch.return_quantity, v_batch_remaining);
        perform post_return_stock_quantity(v_item.return_id, p_return_item_id, v_item.product_id, v_take, v_destination, p_location_type, p_location_id, v_batch.batch_id);
        v_batch_remaining := v_batch_remaining - v_take;
      end loop;
    else
      perform post_return_stock_quantity(v_item.return_id, p_return_item_id, v_item.product_id, v_qty, v_destination, p_location_type, p_location_id, null);
    end if;
  end loop;

  if v_item.serial_required then
    update product_serials set status = 'returned', current_location_type = p_location_type, current_location_id = p_location_id
    where id in (select serial_id from sales_return_item_serials where return_item_id = p_return_item_id);

    update sales_return_item_serials set return_status = case
      when v_item.accepted_saleable_quantity > 0 then 'returned_to_saleable_stock'
      when v_item.accepted_damaged_quantity > 0 then 'returned_to_damaged_stock'
      when v_item.quarantine_quantity > 0 then 'pending_inspection'
      when v_item.rejected_quantity > 0 then 'rejected'
      else 'accepted'
    end
    where return_item_id = p_return_item_id;
  end if;

  update sales_return_items set posted_stock_destination = case
    when v_item.rejected_quantity >= v_item.base_return_quantity then 'rejected'
    when (v_item.accepted_saleable_quantity > 0)::int + (v_item.accepted_damaged_quantity > 0)::int + (v_item.accepted_expired_quantity > 0)::int + (v_item.quarantine_quantity > 0)::int > 1 then 'mixed'
    when v_item.accepted_saleable_quantity > 0 then 'saleable'
    when v_item.accepted_damaged_quantity > 0 then 'damaged'
    when v_item.accepted_expired_quantity > 0 then 'expired'
    when v_item.quarantine_quantity > 0 then 'quarantine'
    else 'rejected'
  end
  where id = p_return_item_id;
end;
$$;
grant execute on function post_return_item_stock(uuid, text, uuid) to authenticated;
