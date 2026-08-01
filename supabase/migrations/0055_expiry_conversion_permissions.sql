-- ============================================================================
-- 0055_expiry_conversion_permissions.sql
-- Continues 0047-0054.
-- ============================================================================

alter table sales_orders add column if not exists expiry_date timestamptz;
alter table sales_orders add column if not exists order_validity_days integer default 7;

-- Order expiry — on-demand scan (this codebase's established "no real
-- cron" pattern), same shape as expire_stock_reservations().
create or replace function expire_sales_orders()
returns integer language plpgsql security definer as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select * from sales_orders
    where status not in ('cancelled', 'closed', 'expired', 'fully_converted')
      and expiry_date is not null and expiry_date < now()
  loop
    perform release_credit_reservation(v_order.id, 'Order expired');
    update sales_order_stock_reservations set status = 'expired'
    where order_id = v_order.id and status in ('pending', 'active', 'partially_reserved', 'fully_reserved');
    update sales_order_approval_steps set status = 'expired'
    where approval_id = (select id from sales_order_approvals where order_id = v_order.id) and status = 'pending';

    update sales_orders set status = 'expired' where id = v_order.id;
    insert into sales_order_status_history (company_id, order_id, old_status, new_status, reason, changed_by)
    values (v_order.company_id, v_order.id, v_order.status, 'expired', 'Automatic expiry', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
grant execute on function expire_sales_orders() to authenticated;

-- Reopens an expired order and reruns pricing/stock/credit validation, per
-- the doc's "On reopening rerun: Pricing, Promotions, Stock, Credit,
-- Approvals" instruction. Approvals are re-evaluated the next time
-- submit_order_for_approval() runs on this order (approval requirements
-- may have changed along with re-priced totals).
create or replace function reopen_expired_order(p_order_id uuid, p_reason text, p_new_expiry timestamptz)
returns void language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_items_payload jsonb;
begin
  if not has_permission('sales_orders:reopen_expired_order') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;
  if v_order.status != 'expired' then raise exception 'Only expired orders can be reopened (currently %)', v_order.status; end if;

  -- Capture the current lines as a re-orderable payload BEFORE clearing them.
  select jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'variant_id', variant_id, 'unit_id', unit_id, 'batch_id', batch_id, 'quantity', ordered_quantity
  )) into v_items_payload
  from sales_order_items where order_id = p_order_id and not is_free_item;

  update sales_orders set status = 'draft', expiry_date = p_new_expiry where id = p_order_id;
  insert into sales_order_status_history (company_id, order_id, old_status, new_status, reason, changed_by)
  values (v_order.company_id, p_order_id, 'expired', 'draft', p_reason, auth.uid());

  delete from sales_order_items where order_id = p_order_id;

  if v_items_payload is not null then
    perform recalculate_sales_order_totals(p_order_id, v_items_payload, v_order.customer_id);
  end if;
end;
$$;
grant execute on function reopen_expired_order(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- ORDER CONVERSION FOUNDATION — tracking fields only. No invoice, cash
-- sale, or delivery note is created in this phase; this table exists so
-- a later phase has somewhere to record the link once it does.
-- ---------------------------------------------------------------------------
create table sales_order_conversion_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  order_item_id uuid references sales_order_items(id) on delete cascade,
  ordered_quantity numeric(14,3) not null,
  reserved_quantity numeric(14,3) not null default 0,
  converted_quantity numeric(14,3) not null default 0,
  remaining_quantity numeric(14,3) not null,
  target_document_type text check (target_document_type in ('sales_invoice', 'cash_sale', 'delivery_note', 'partial_invoice') or target_document_type is null),
  target_document_id uuid,
  conversion_date timestamptz,
  conversion_status text not null default 'not_converted' check (conversion_status in ('not_converted', 'partially_converted', 'fully_converted')),
  created_at timestamptz not null default now()
);
create index idx_sales_order_conversion_links_order on sales_order_conversion_links(order_id);

alter table sales_order_conversion_links enable row level security;
create policy sales_order_conversion_links_isolation on sales_order_conversion_links for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Reusable validation the doc asks for — checked before any future
-- conversion, but this phase never calls it to actually create a document.
create or replace function validate_order_for_conversion(p_order_id uuid)
returns table (check_name text, passed boolean, message text) language plpgsql stable as $$
declare
  v_order sales_orders%rowtype;
  v_customer customers%rowtype;
  v_unreserved_count integer;
begin
  select * into v_order from sales_orders where id = p_order_id;
  select * into v_customer from customers where id = v_order.customer_id;

  check_name := 'approved'; passed := v_order.status in ('approved', 'partially_approved', 'ready_for_reservation', 'partially_reserved', 'fully_reserved', 'ready_for_fulfilment');
  message := format('Order status is %s', v_order.status); return next;

  check_name := 'not_cancelled'; passed := v_order.status != 'cancelled'; message := 'Order is cancelled'; return next;
  check_name := 'not_expired'; passed := v_order.status != 'expired'; message := 'Order is expired'; return next;
  check_name := 'not_on_hold'; passed := not v_order.is_on_hold; message := 'Order is on hold'; return next;
  check_name := 'customer_active'; passed := v_customer.status = 'active'; message := 'Customer is not active'; return next;

  if v_order.payment_type = 'credit' then
    check_name := 'credit_still_valid'; passed := v_order.credit_validation_status in ('valid', 'warning'); message := 'Credit validation is not current'; return next;
  end if;

  select count(*) into v_unreserved_count from sales_order_items i
  where i.order_id = p_order_id and not i.is_free_item
    and not exists (select 1 from sales_order_stock_reservations r where r.order_item_id = i.id and r.status in ('active', 'fully_reserved', 'partially_reserved'));
  check_name := 'stock_reserved'; passed := v_unreserved_count = 0;
  message := format('%s item(s) have no active reservation', v_unreserved_count); return next;

  check_name := 'approvals_complete';
  passed := not exists (select 1 from sales_order_approval_steps s join sales_order_approvals a on a.id = s.approval_id where a.order_id = p_order_id and s.status = 'pending');
  message := 'One or more approval steps are still pending'; return next;

  return;
end;
$$;
grant execute on function validate_order_for_conversion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- PERMISSIONS — granular actions for every capability this phase adds.
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select 'sales_orders', a, 'Sales orders: ' || a
from unnest(array[
  'validate_stock', 'select_stock_source', 'reserve_stock', 'release_reservation', 'extend_reservation',
  'select_batch', 'override_fifo_fefo', 'select_serial_numbers', 'create_backorder', 'manage_backorders',
  'request_stock_transfer', 'view_credit_validation', 'reserve_credit', 'release_credit_reservation',
  'request_credit_override', 'approve_credit_override', 'approve_order', 'partially_approve_order', 'reject_order',
  'return_for_correction', 'place_on_hold', 'release_hold', 'approve_price_override', 'approve_discount_override',
  'approve_free_quantity', 'create_amendment', 'approve_amendment', 'cancel_order', 'partially_cancel_order',
  'reopen_expired_order', 'resolve_sync_conflict', 'revalidate_order', 'view_cost', 'view_margin'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'sales_orders'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- AUDIT LOGS — reuse the existing generic trigger for every new table.
-- ---------------------------------------------------------------------------
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'sales_order_stock_validations', 'sales_order_stock_reservations', 'sales_order_backorders',
    'sales_order_credit_validations', 'sales_order_credit_reservations', 'sales_order_credit_override_requests',
    'sales_order_approvals', 'sales_order_approval_steps', 'sales_order_price_override_requests',
    'sales_order_discount_override_requests', 'sales_order_free_quantity_requests', 'sales_order_hold_history',
    'sales_order_amendments', 'sales_order_cancellations'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
