-- ============================================================================
-- 0054_amendments_cancellation.sql
-- Continues 0047-0053.
-- ============================================================================

alter table sales_orders add column if not exists version integer not null default 1;

create table sales_order_amendments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  amendment_number text not null,
  version integer not null,
  reason text not null,
  requested_by uuid references app_users(id),
  request_date timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  original_snapshot jsonb not null,
  changed_fields jsonb not null default '{}',
  approval_requirement boolean not null default true,
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz,
  unique (order_id, amendment_number)
);
create index idx_sales_order_amendments_order on sales_order_amendments(order_id);

alter table sales_order_amendments enable row level security;
create policy sales_order_amendments_isolation on sales_order_amendments for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_amendment_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  amendment_id uuid not null references sales_order_amendments(id) on delete cascade,
  order_item_id uuid references sales_order_items(id) on delete set null,
  change_type text not null check (change_type in (
    'increase_quantity', 'reduce_quantity', 'add_item', 'remove_item', 'change_uom', 'change_delivery_date',
    'change_delivery_address', 'change_payment_type', 'change_stock_source', 'change_price', 'change_discount', 'change_free_quantity'
  )),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index idx_sales_order_amendment_items_amendment on sales_order_amendment_items(amendment_id);

alter table sales_order_amendment_items enable row level security;
create policy sales_order_amendment_items_isolation on sales_order_amendment_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Approved orders must not be directly edited — this is the only path to
-- change one. Snapshots the current order+items as JSON before anything
-- changes, so the original approved version is never overwritten.
create or replace function create_order_amendment(p_order_id uuid, p_reason text, p_changes jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_snapshot jsonb;
  v_amendment_id uuid;
  v_amendment_no text;
  v_change jsonb;
  v_next_seq bigint;
begin
  if not has_permission('sales_orders:create_amendment') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('approved', 'partially_approved', 'ready_for_reservation', 'partially_reserved', 'fully_reserved', 'ready_for_fulfilment') then
    raise exception 'Only approved orders can be amended (currently %)', v_order.status;
  end if;

  select jsonb_build_object(
    'order', to_jsonb(so), 'items', (select jsonb_agg(to_jsonb(i)) from sales_order_items i where i.order_id = p_order_id)
  ) into v_snapshot from sales_orders so where so.id = p_order_id;

  select count(*) + 1 into v_next_seq from sales_order_amendments where order_id = p_order_id;
  v_amendment_no := 'AMD-' || v_order.order_number || '-' || v_next_seq;

  insert into sales_order_amendments (
    company_id, order_id, amendment_number, version, reason, requested_by, original_snapshot, changed_fields
  ) values (
    v_order.company_id, p_order_id, v_amendment_no, v_order.version + 1, p_reason, auth.uid(), v_snapshot, p_changes
  ) returning id into v_amendment_id;

  for v_change in select * from jsonb_array_elements(p_changes) loop
    insert into sales_order_amendment_items (company_id, amendment_id, order_item_id, change_type, old_value, new_value)
    values (
      v_order.company_id, v_amendment_id, nullif(v_change->>'order_item_id', '')::uuid, v_change->>'change_type',
      v_change->'old_value', v_change->'new_value'
    );
  end loop;

  return v_amendment_id;
end;
$$;
grant execute on function create_order_amendment(uuid, text, jsonb) to authenticated;

-- Applies an approved amendment: bumps the order version, adjusts stock
-- and credit reservations to match the new item quantities, and updates
-- totals. Historical approved versions are never overwritten — they live
-- in original_snapshot on the amendment row itself.
create or replace function approve_order_amendment(p_amendment_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_amendment sales_order_amendments%rowtype;
  v_item_change record;
  v_reservation sales_order_stock_reservations%rowtype;
begin
  if not has_permission('sales_orders:approve_amendment') then raise exception 'Not permitted'; end if;
  select * into v_amendment from sales_order_amendments where id = p_amendment_id;
  if not found then raise exception 'Amendment not found'; end if;

  for v_item_change in select * from sales_order_amendment_items where amendment_id = p_amendment_id loop
    if v_item_change.change_type = 'reduce_quantity' and v_item_change.order_item_id is not null then
      update sales_order_items set
        ordered_quantity = (v_item_change.new_value->>'quantity')::numeric,
        base_quantity = (v_item_change.new_value->>'quantity')::numeric * conversion_factor
      where id = v_item_change.order_item_id;

      for v_reservation in
        select * from sales_order_stock_reservations
        where order_item_id = v_item_change.order_item_id and status in ('active', 'partially_reserved', 'fully_reserved')
      loop
        if v_reservation.reserved_base_quantity > (v_item_change.new_value->>'quantity')::numeric then
          perform release_stock_reservation(v_reservation.id, 'Amendment reduced quantity');
        end if;
      end loop;
    elsif v_item_change.change_type = 'remove_item' and v_item_change.order_item_id is not null then
      update sales_order_items set ordered_quantity = 0, base_quantity = 0 where id = v_item_change.order_item_id;
      for v_reservation in
        select * from sales_order_stock_reservations
        where order_item_id = v_item_change.order_item_id and status in ('active', 'partially_reserved', 'fully_reserved')
      loop
        perform release_stock_reservation(v_reservation.id, 'Amendment removed item');
      end loop;
    elsif v_item_change.change_type = 'change_delivery_date' then
      update sales_orders set expected_delivery_date = (v_item_change.new_value->>'expected_delivery_date')::date where id = v_amendment.order_id;
    elsif v_item_change.change_type = 'change_payment_type' then
      update sales_orders set payment_type = v_item_change.new_value->>'payment_type' where id = v_amendment.order_id;
    elsif v_item_change.change_type = 'change_stock_source' then
      update sales_orders set stock_source_type = v_item_change.new_value->>'stock_source_type' where id = v_amendment.order_id;
    end if;
  end loop;

  update sales_orders set
    gross_amount = agg.gross, discount_amount = agg.discount, tax_amount = agg.tax,
    net_amount = agg.gross - agg.discount + agg.tax, total_quantity = agg.qty,
    version = v_amendment.version, updated_at = now()
  from (
    select sum(gross_amount) as gross, sum(discount_amount) as discount, sum(tax_amount) as tax, sum(ordered_quantity) as qty
    from sales_order_items where order_id = v_amendment.order_id
  ) agg
  where sales_orders.id = v_amendment.order_id;

  update sales_order_credit_reservations set
    reserved_amount = (select net_amount from sales_orders where id = v_amendment.order_id),
    remaining_amount = (select net_amount from sales_orders where id = v_amendment.order_id)
  where order_id = v_amendment.order_id and status in ('active', 'partially_released');

  update sales_order_amendments set status = 'approved', decided_by = auth.uid(), decision_reason = p_reason, decided_at = now()
  where id = p_amendment_id;
end;
$$;
grant execute on function approve_order_amendment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ORDER CANCELLATION (full and partial)
-- ---------------------------------------------------------------------------
create table sales_order_cancellations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  reason text not null,
  notes text,
  cancelled_by uuid references app_users(id),
  cancelled_at timestamptz not null default now(),
  approval_required boolean not null default false,
  approved_by uuid references app_users(id)
);
create index idx_sales_order_cancellations_order on sales_order_cancellations(order_id);

alter table sales_order_cancellations enable row level security;
create policy sales_order_cancellations_isolation on sales_order_cancellations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_item_cancellations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_item_id uuid not null references sales_order_items(id) on delete cascade,
  cancelled_quantity numeric(14,3) not null,
  reason text,
  cancelled_by uuid references app_users(id),
  cancelled_at timestamptz not null default now()
);
create index idx_sales_order_item_cancellations_item on sales_order_item_cancellations(order_item_id);

alter table sales_order_item_cancellations enable row level security;
create policy sales_order_item_cancellations_isolation on sales_order_item_cancellations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Full cancellation: releases every active stock reservation, the credit
-- reservation, cancels open backorders/transfer requests/pending approval
-- steps, and preserves full history rather than deleting the order.
create or replace function cancel_sales_order(p_order_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_reservation record;
begin
  if not has_permission('sales_orders:cancel_order') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('cancelled', 'closed') then return; end if;

  for v_reservation in
    select * from sales_order_stock_reservations
    where order_id = p_order_id and status in ('pending', 'active', 'partially_reserved', 'fully_reserved')
  loop
    perform release_stock_reservation(v_reservation.id, 'Order cancelled');
  end loop;

  perform release_credit_reservation(p_order_id, 'Order cancelled');

  update sales_order_backorders set status = 'cancelled' where order_id = p_order_id and status not in ('fulfilled', 'closed');
  update sales_order_stock_transfer_requests set approval_status = 'cancelled' where order_id = p_order_id and approval_status = 'pending';
  update sales_order_approval_steps set status = 'cancelled' where approval_id = (select id from sales_order_approvals where order_id = p_order_id) and status = 'pending';

  insert into sales_order_cancellations (company_id, order_id, reason, notes, cancelled_by)
  values (v_order.company_id, p_order_id, p_reason, p_notes, auth.uid());

  update sales_orders set status = 'cancelled' where id = p_order_id;
  insert into sales_order_status_history (company_id, order_id, old_status, new_status, reason, changed_by)
  values (v_order.company_id, p_order_id, v_order.status, 'cancelled', p_reason, auth.uid());
end;
$$;
grant execute on function cancel_sales_order(uuid, text, text) to authenticated;

-- Partial cancellation: reduces one item's remaining (unconverted)
-- quantity, never touching quantity already converted to a downstream
-- document (Part 2 doesn't create those documents, but the guard is here
-- for when a later phase does).
create or replace function partially_cancel_order_item(p_order_item_id uuid, p_cancel_quantity numeric, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_item sales_order_items%rowtype;
  v_converted numeric;
begin
  if not has_permission('sales_orders:partially_cancel_order') then raise exception 'Not permitted'; end if;
  select * into v_item from sales_order_items where id = p_order_item_id;
  if not found then raise exception 'Order item not found'; end if;

  select coalesce(sum(converted_quantity), 0) into v_converted from sales_order_stock_reservations where order_item_id = p_order_item_id;
  if p_cancel_quantity > (v_item.ordered_quantity - v_converted) then
    raise exception 'Cannot cancel % — only % of % is unconverted', p_cancel_quantity, (v_item.ordered_quantity - v_converted), v_item.ordered_quantity;
  end if;

  update sales_order_items set ordered_quantity = ordered_quantity - p_cancel_quantity, base_quantity = (ordered_quantity - p_cancel_quantity) * conversion_factor
  where id = p_order_item_id;

  insert into sales_order_item_cancellations (company_id, order_item_id, cancelled_quantity, reason, cancelled_by)
  values ((select company_id from sales_orders where id = v_item.order_id), p_order_item_id, p_cancel_quantity, p_reason, auth.uid());
end;
$$;
grant execute on function partially_cancel_order_item(uuid, numeric, text) to authenticated;
