-- ============================================================================
-- 0053_order_status_model_extension.sql
-- Extends the Part 1 order status model to the full Part 2 set. This is a
-- correctness fix that must land BEFORE the approval/amendment/cancellation
-- migrations that follow it (0054+), since those already write statuses
-- like 'approved', 'pending_approval', 'rejected' that the original Part 1
-- CHECK constraint and transition table never allowed.
-- ============================================================================

alter table sales_orders drop constraint if exists sales_orders_status_check;
alter table sales_orders add constraint sales_orders_status_check check (status in (
  'draft', 'pending_validation', 'validation_failed', 'pending_submission', 'submitted',
  'pending_approval', 'partially_approved', 'approved', 'rejected', 'returned_for_correction', 'on_hold',
  'ready_for_reservation', 'partially_reserved', 'fully_reserved', 'backordered', 'ready_for_fulfilment',
  'partially_converted', 'fully_converted', 'cancelled', 'expired', 'closed',
  'sync_pending', 'sync_failed', 'conflict'
));

create or replace function change_sales_order_status(p_order_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old text;
  v_company_id uuid;
  v_valid boolean;
begin
  select status, company_id into v_old, v_company_id from sales_orders where id = p_order_id;
  if v_old is null then raise exception 'Order not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('pending_validation', 'pending_submission', 'submitted', 'cancelled', 'expired', 'sync_pending')
    when 'pending_validation' then p_new_status in ('validation_failed', 'pending_submission', 'submitted', 'cancelled')
    when 'validation_failed' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'pending_submission' then p_new_status in ('submitted', 'cancelled', 'draft')
    when 'submitted' then p_new_status in ('pending_approval', 'approved', 'cancelled')
    when 'pending_approval' then p_new_status in ('approved', 'partially_approved', 'rejected', 'returned_for_correction', 'on_hold', 'cancelled')
    when 'partially_approved' then p_new_status in ('ready_for_reservation', 'on_hold', 'cancelled')
    when 'approved' then p_new_status in ('ready_for_reservation', 'on_hold', 'cancelled', 'expired')
    when 'rejected' then p_new_status in ('draft', 'cancelled')
    when 'returned_for_correction' then p_new_status in ('draft', 'pending_submission', 'cancelled')
    when 'on_hold' then p_new_status in ('approved', 'partially_approved', 'pending_approval', 'ready_for_reservation', 'cancelled')
    when 'ready_for_reservation' then p_new_status in ('partially_reserved', 'fully_reserved', 'backordered', 'cancelled')
    when 'partially_reserved' then p_new_status in ('fully_reserved', 'backordered', 'ready_for_fulfilment', 'cancelled')
    when 'fully_reserved' then p_new_status in ('ready_for_fulfilment', 'cancelled', 'expired')
    when 'backordered' then p_new_status in ('partially_reserved', 'fully_reserved', 'cancelled', 'expired')
    when 'ready_for_fulfilment' then p_new_status in ('partially_converted', 'fully_converted', 'cancelled')
    when 'partially_converted' then p_new_status in ('fully_converted', 'cancelled')
    when 'fully_converted' then p_new_status in ('closed')
    when 'sync_pending' then p_new_status in ('pending_validation', 'submitted', 'sync_failed', 'draft', 'conflict')
    when 'sync_failed' then p_new_status in ('sync_pending', 'draft', 'cancelled')
    when 'conflict' then p_new_status in ('draft', 'pending_validation', 'cancelled')
    when 'expired' then p_new_status in ('draft') -- only via reopen_expired_order(), which bypasses this generic transition
    when 'cancelled' then false
    when 'closed' then false
    else false
  end;
  if not v_valid then raise exception 'Cannot move order from % to %', v_old, p_new_status; end if;

  update sales_orders set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_order_id;
  insert into sales_order_status_history (company_id, order_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_order_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_sales_order_status(uuid, text, text) to authenticated;
