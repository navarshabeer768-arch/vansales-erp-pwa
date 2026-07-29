-- ============================================================================
-- 0025_locations_serials_fifo.sql
-- Warehouse Locations (zone/rack/shelf/bin), extended serial number
-- tracking (warranty, sale linkage), and a FIFO/expiry-priority stock
-- allocation engine used by van loading and sales.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- WAREHOUSE LOCATIONS
-- ---------------------------------------------------------------------------
create table warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  warehouse_id uuid not null references warehouses(id) on delete cascade,
  zone text not null,
  rack text,
  shelf text,
  bin text,
  code text generated always as (
    zone || coalesce('-' || nullif(rack, ''), '') || coalesce('-' || nullif(shelf, ''), '') || coalesce('-' || nullif(bin, ''), '')
  ) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(warehouse_id, zone, rack, shelf, bin)
);
create index idx_warehouse_locations_warehouse on warehouse_locations(warehouse_id);

alter table warehouse_locations enable row level security;
create policy warehouse_locations_isolation on warehouse_locations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Every warehouse stock row can now know its location within the warehouse.
alter table warehouse_stock add column if not exists location_id uuid references warehouse_locations(id) on delete set null;

-- ---------------------------------------------------------------------------
-- SERIAL NUMBER MANAGEMENT — warranty + sale linkage
-- ---------------------------------------------------------------------------
alter table product_serials add column if not exists warranty_months integer;
alter table product_serials add column if not exists warranty_expiry date;
alter table product_serials add column if not exists sold_sale_id uuid references sales(id) on delete set null;
alter table product_serials add column if not exists sold_at timestamptz;
alter table product_serials add column if not exists customer_id uuid references customers(id) on delete set null;
alter table product_serials add column if not exists purchase_grn_id uuid references goods_receipts(id) on delete set null;
alter table product_serials add column if not exists notes text;

alter table product_serials enable row level security;
create policy product_serials_isolation on product_serials for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Marks a serial as sold, linking it to the sale/customer and stamping
-- warranty expiry from its registered warranty period.
create or replace function sell_serial(p_serial_id uuid, p_sale_id uuid, p_customer_id uuid default null)
returns void language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_warranty_months int;
begin
  select warranty_months into v_warranty_months from product_serials where id = p_serial_id and company_id = v_company_id;
  if not found then raise exception 'Serial not found'; end if;

  update product_serials
  set status = 'sold', sold_sale_id = p_sale_id, sold_at = now(), customer_id = p_customer_id,
      warranty_expiry = case when v_warranty_months is not null then (current_date + (v_warranty_months || ' months')::interval)::date else warranty_expiry end
  where id = p_serial_id;
end;
$$;

grant execute on function sell_serial(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- FIFO / EXPIRY-PRIORITY STOCK ALLOCATION ENGINE
-- Given a location and a product, returns which batches to draw from and
-- how much from each, oldest-expiry-first (falling back to oldest batch by
-- creation date for non-expiry-tracked products), to satisfy a requested
-- quantity. Used by Van Loading and POS instead of manual batch picking.
-- ---------------------------------------------------------------------------
create or replace function allocate_stock_fifo(
  p_location_type text, -- 'warehouse' | 'van'
  p_location_id uuid,
  p_product_id uuid,
  p_quantity numeric
) returns table (batch_id uuid, batch_no text, expiry_date date, allocated_quantity numeric) language plpgsql as $$
declare
  v_remaining numeric := p_quantity;
  v_row record;
  v_take numeric;
begin
  if p_location_type = 'warehouse' then
    for v_row in
      select ws.batch_id, b.batch_no, b.expiry_date, ws.quantity - ws.reserved_quantity as available
      from warehouse_stock ws
      left join batches b on b.id = ws.batch_id
      where ws.warehouse_id = p_location_id and ws.product_id = p_product_id and (ws.quantity - ws.reserved_quantity) > 0
      order by (b.expiry_date is null), b.expiry_date asc nulls last, b.created_at asc nulls last
    loop
      exit when v_remaining <= 0;
      v_take := least(v_row.available, v_remaining);
      batch_id := v_row.batch_id; batch_no := v_row.batch_no; expiry_date := v_row.expiry_date; allocated_quantity := v_take;
      v_remaining := v_remaining - v_take;
      return next;
    end loop;
  else
    for v_row in
      select vs.batch_id, b.batch_no, b.expiry_date, vs.quantity as available
      from van_stock vs
      left join batches b on b.id = vs.batch_id
      where vs.van_id = p_location_id and vs.product_id = p_product_id and vs.quantity > 0
      order by (b.expiry_date is null), b.expiry_date asc nulls last, b.created_at asc nulls last
    loop
      exit when v_remaining <= 0;
      v_take := least(v_row.available, v_remaining);
      batch_id := v_row.batch_id; batch_no := v_row.batch_no; expiry_date := v_row.expiry_date; allocated_quantity := v_take;
      v_remaining := v_remaining - v_take;
      return next;
    end loop;
  end if;

  if v_remaining > 0 then
    raise exception 'Insufficient stock: % more needed for product % at this location', v_remaining, p_product_id;
  end if;
end;
$$;

grant execute on function allocate_stock_fifo(text, uuid, uuid, numeric) to authenticated;
