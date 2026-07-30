-- ============================================================================
-- 0031_daily_van_operations.sql
-- Daily Van Operations: a first-class per-van-per-day shift record (status
-- lifecycle, opening/closing odometer/cash/stock-value, digital signature),
-- plus Stock Reconciliation (system quantity vs physical count, variance,
-- approval, and an audit-logged adjustment). This does NOT duplicate Van
-- Loading/Unloading — those remain how stock physically moves in and out of
-- a van. This is the wrapper that ties a day's loading, selling, and
-- unloading together into one auditable shift, plus the genuinely new
-- capability: a formal count-vs-system reconciliation step.
-- ============================================================================

alter table stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table stock_movements add constraint stock_movements_movement_type_check check (movement_type in (
  'purchase_in', 'warehouse_transfer', 'van_load', 'van_unload', 'sale_out',
  'sales_return_in', 'purchase_return_out', 'adjustment', 'damage', 'loss', 'opening_stock',
  'closing_stock', 'reconciliation_adjustment'
));

-- ---------------------------------------------------------------------------
-- DAILY VAN OPERATIONS
-- ---------------------------------------------------------------------------
create table daily_van_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  operation_date date not null default current_date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'paused', 'ended', 'cancelled')),
  opening_time timestamptz,
  closing_time timestamptz,
  opening_odometer numeric(10,1),
  closing_odometer numeric(10,1),
  opening_cash numeric(12,2) not null default 0,
  closing_cash numeric(12,2),
  opening_stock_value numeric(14,2),
  closing_stock_value numeric(14,2),
  opening_signature_data text,
  opening_signed_by uuid references app_users(id),
  opening_signed_at timestamptz,
  closing_signature_data text,
  closing_signed_by uuid references app_users(id),
  closing_signed_at timestamptz,
  notes text,
  cancel_reason text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (van_id, operation_date)
);
create index idx_daily_van_ops_van_date on daily_van_operations(van_id, operation_date desc);
create index idx_daily_van_ops_company_date on daily_van_operations(company_id, operation_date desc);

alter table daily_van_operations enable row level security;
create policy daily_van_operations_isolation on daily_van_operations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_daily_van_ops_updated_at before update on daily_van_operations
  for each row execute function set_updated_at();

-- Current van stock value, used for both the opening and closing snapshots.
create or replace function van_stock_value(p_van_id uuid)
returns numeric language sql stable as $$
  select coalesce(sum(vs.quantity * p.cost_price), 0)
  from van_stock vs join products p on p.id = vs.product_id
  where vs.van_id = p_van_id;
$$;

create or replace function start_daily_operation(
  p_van_id uuid, p_route_id uuid, p_opening_odometer numeric, p_opening_cash numeric,
  p_signature_data text default null, p_notes text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_op_id uuid;
begin
  if not has_permission('van_loading:create') then
    raise exception 'Not permitted to start a daily van operation';
  end if;

  insert into daily_van_operations (
    company_id, van_id, route_id, operation_date, status, opening_time,
    opening_odometer, opening_cash, opening_stock_value,
    opening_signature_data, opening_signed_by, opening_signed_at, notes, created_by
  ) values (
    v_company_id, p_van_id, p_route_id, current_date, 'in_progress', now(),
    p_opening_odometer, p_opening_cash, van_stock_value(p_van_id),
    p_signature_data, case when p_signature_data is not null then auth.uid() end,
    case when p_signature_data is not null then now() end, p_notes, auth.uid()
  )
  on conflict (van_id, operation_date) do update set
    status = 'in_progress', opening_time = coalesce(daily_van_operations.opening_time, now()),
    opening_odometer = excluded.opening_odometer, opening_cash = excluded.opening_cash,
    opening_stock_value = excluded.opening_stock_value, route_id = excluded.route_id,
    opening_signature_data = coalesce(excluded.opening_signature_data, daily_van_operations.opening_signature_data),
    updated_at = now()
  returning id into v_op_id;

  return v_op_id;
end;
$$;

grant execute on function start_daily_operation(uuid, uuid, numeric, numeric, text, text) to authenticated;

create or replace function pause_daily_operation(p_operation_id uuid) returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:edit') then raise exception 'Not permitted'; end if;
  update daily_van_operations set status = 'paused', updated_at = now()
  where id = p_operation_id and status = 'in_progress';
end; $$;
grant execute on function pause_daily_operation(uuid) to authenticated;

create or replace function resume_daily_operation(p_operation_id uuid) returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:edit') then raise exception 'Not permitted'; end if;
  update daily_van_operations set status = 'in_progress', updated_at = now()
  where id = p_operation_id and status = 'paused';
end; $$;
grant execute on function resume_daily_operation(uuid) to authenticated;

create or replace function end_daily_operation(
  p_operation_id uuid, p_closing_odometer numeric, p_closing_cash numeric,
  p_signature_data text default null, p_notes text default null
) returns void language plpgsql security definer as $$
declare
  v_van_id uuid;
begin
  if not has_permission('van_loading:edit') then raise exception 'Not permitted'; end if;

  select van_id into v_van_id from daily_van_operations where id = p_operation_id;
  if v_van_id is null then raise exception 'Operation not found'; end if;

  update daily_van_operations set
    status = 'ended', closing_time = now(), closing_odometer = p_closing_odometer,
    closing_cash = p_closing_cash, closing_stock_value = van_stock_value(v_van_id),
    closing_signature_data = coalesce(p_signature_data, closing_signature_data),
    closing_signed_by = case when p_signature_data is not null then auth.uid() else closing_signed_by end,
    closing_signed_at = case when p_signature_data is not null then now() else closing_signed_at end,
    notes = coalesce(p_notes, notes), updated_at = now()
  where id = p_operation_id;
end;
$$;

grant execute on function end_daily_operation(uuid, numeric, numeric, text, text) to authenticated;

create or replace function cancel_daily_operation(p_operation_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:edit') then raise exception 'Not permitted'; end if;
  update daily_van_operations set status = 'cancelled', cancel_reason = p_reason, updated_at = now()
  where id = p_operation_id;
end;
$$;

grant execute on function cancel_daily_operation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- STOCK RECONCILIATION — physical count vs system quantity, with variance,
-- reason, and an approval step that actually applies the adjustment.
-- ---------------------------------------------------------------------------
create table stock_reconciliation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  operation_id uuid not null references daily_van_operations(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  batch_id uuid references batches(id) on delete set null,
  system_quantity numeric(14,3) not null,
  physical_quantity numeric(14,3) not null,
  difference_quantity numeric(14,3) generated always as (physical_quantity - system_quantity) stored,
  difference_value numeric(14,2) not null default 0,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by uuid references app_users(id),
  approved_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_stock_reconciliation_operation on stock_reconciliation(operation_id);
create index idx_stock_reconciliation_van on stock_reconciliation(van_id, created_at desc);

alter table stock_reconciliation enable row level security;
create policy stock_reconciliation_isolation on stock_reconciliation for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Submits one or more physical counts for an operation. Only creates
-- pending reconciliation rows — no stock or movement changes happen until
-- each one is approved.
create or replace function submit_stock_reconciliation(p_operation_id uuid, p_items jsonb)
returns integer language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_van_id uuid;
  v_item jsonb;
  v_system_qty numeric;
  v_cost numeric;
  v_count integer := 0;
begin
  if not has_permission('van_loading:edit') then
    raise exception 'Not permitted to submit stock reconciliation';
  end if;

  select van_id into v_van_id from daily_van_operations where id = p_operation_id and company_id = v_company_id;
  if v_van_id is null then raise exception 'Operation not found'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select coalesce(quantity, 0) into v_system_qty from van_stock
    where van_id = v_van_id and product_id = (v_item->>'product_id')::uuid
      and batch_id is not distinct from nullif(v_item->>'batch_id', '')::uuid;
    v_system_qty := coalesce(v_system_qty, 0);

    select cost_price into v_cost from products where id = (v_item->>'product_id')::uuid;

    insert into stock_reconciliation (
      company_id, operation_id, van_id, product_id, batch_id,
      system_quantity, physical_quantity, difference_value, reason, created_by
    ) values (
      v_company_id, p_operation_id, v_van_id, (v_item->>'product_id')::uuid,
      nullif(v_item->>'batch_id', '')::uuid, v_system_qty, (v_item->>'physical_quantity')::numeric,
      ((v_item->>'physical_quantity')::numeric - v_system_qty) * coalesce(v_cost, 0),
      nullif(v_item->>'reason', ''), auth.uid()
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function submit_stock_reconciliation(uuid, jsonb) to authenticated;

-- Approves a reconciliation line: applies the adjustment to van_stock and
-- logs it as a real stock movement, atomically.
create or replace function approve_stock_reconciliation(p_reconciliation_id uuid)
returns void language plpgsql security definer as $$
declare
  v_rec record;
begin
  if not has_permission('van_loading:approve') then
    raise exception 'Not permitted to approve stock reconciliation';
  end if;

  select * into v_rec from stock_reconciliation where id = p_reconciliation_id and status = 'pending';
  if not found then raise exception 'Reconciliation record not found or already approved'; end if;

  insert into van_stock (company_id, van_id, product_id, batch_id, quantity)
  values (v_rec.company_id, v_rec.van_id, v_rec.product_id, v_rec.batch_id, v_rec.physical_quantity)
  on conflict (van_id, product_id, batch_id) do update set quantity = v_rec.physical_quantity, updated_at = now();

  if v_rec.difference_quantity != 0 then
    insert into stock_movements (
      company_id, product_id, batch_id, movement_type,
      from_location_type, from_location_id, to_location_type, to_location_id,
      quantity, reference_table, reference_id, notes, created_by
    ) values (
      v_rec.company_id, v_rec.product_id, v_rec.batch_id, 'reconciliation_adjustment',
      case when v_rec.difference_quantity < 0 then 'van' else 'none' end,
      case when v_rec.difference_quantity < 0 then v_rec.van_id else null end,
      case when v_rec.difference_quantity > 0 then 'van' else 'none' end,
      case when v_rec.difference_quantity > 0 then v_rec.van_id else null end,
      abs(v_rec.difference_quantity), 'stock_reconciliation', v_rec.id, v_rec.reason, auth.uid()
    );
  end if;

  update stock_reconciliation set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_reconciliation_id;
end;
$$;

grant execute on function approve_stock_reconciliation(uuid) to authenticated;
