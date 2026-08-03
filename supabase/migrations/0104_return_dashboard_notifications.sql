-- ============================================================================
-- 0104_return_dashboard_notifications.sql
-- Continues 0096-0103. Extends dashboard_stats() with real Part 2 return/
-- inspection/credit-note/replacement KPIs — full prior widget set
-- preserved and appended to (checked against 0095's actual output).
-- ============================================================================

create or replace function notify_return_event(p_return_id uuid, p_user_id uuid, p_type text, p_title text, p_message text)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  if p_user_id is null then return; end if;
  select company_id into v_company_id from sales_returns where id = p_return_id;
  insert into notifications (company_id, user_id, type, title, message, reference_table, reference_id)
  values (v_company_id, p_user_id, p_type, p_title, p_message, 'sales_returns', p_return_id);
end;
$$;
grant execute on function notify_return_event(uuid, uuid, text, text, text) to authenticated;

create or replace function submit_return_for_approval_notified(p_return_id uuid)
returns uuid language plpgsql security definer as $$
declare v_approval_id uuid; v_return sales_returns%rowtype;
begin
  v_approval_id := submit_return_for_approval(p_return_id);
  select * into v_return from sales_returns where id = p_return_id;
  if v_return.approval_status = 'pending' then
    perform notify_return_event(p_return_id, v_return.created_by, 'approval_notification', 'Return Pending Approval', format('Return %s is pending approval.', v_return.return_number));
  end if;
  return v_approval_id;
end;
$$;
grant execute on function submit_return_for_approval_notified(uuid) to authenticated;

create or replace function process_return_approval_action_notified(p_step_id uuid, p_action text, p_reason text default null, p_notes text default null, p_approved_values jsonb default null)
returns void language plpgsql security definer as $$
declare v_return_id uuid; v_created_by uuid; v_return_number text;
begin
  perform process_return_approval_action(p_step_id, p_action, p_reason, p_notes, p_approved_values);
  select a.return_id into v_return_id from sales_return_approval_steps s join sales_return_approvals a on a.id = s.approval_id where s.id = p_step_id;
  select created_by, return_number into v_created_by, v_return_number from sales_returns where id = v_return_id;

  if p_action = 'approve' then
    perform notify_return_event(v_return_id, v_created_by, 'approval_notification', 'Return Approved', format('Return %s was approved.', v_return_number));
  elsif p_action = 'reject' then
    perform notify_return_event(v_return_id, v_created_by, 'system', 'Return Rejected', format('Return %s was rejected: %s', v_return_number, coalesce(p_reason, '')));
  elsif p_action = 'return_for_correction' then
    perform notify_return_event(v_return_id, v_created_by, 'system', 'Return Returned for Correction', format('Return %s was returned: %s', v_return_number, coalesce(p_reason, '')));
  end if;
end;
$$;
grant execute on function process_return_approval_action_notified(uuid, text, text, text, jsonb) to authenticated;

create or replace function complete_return_inspection_notified(p_return_id uuid)
returns void language plpgsql security definer as $$
declare v_created_by uuid; v_return_number text; v_status text;
begin
  perform complete_return_inspection(p_return_id);
  select created_by, return_number, status into v_created_by, v_return_number, v_status from sales_returns where id = p_return_id;
  perform notify_return_event(p_return_id, v_created_by, 'system', 'Inspection Completed', format('Return %s inspection completed: %s.', v_return_number, v_status));
end;
$$;
grant execute on function complete_return_inspection_notified(uuid) to authenticated;

create or replace function place_return_on_hold_notified(p_return_id uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_hold_id uuid; v_created_by uuid; v_return_number text;
begin
  v_hold_id := place_return_on_hold(p_return_id, p_reason, p_notes);
  select created_by, return_number into v_created_by, v_return_number from sales_returns where id = p_return_id;
  perform notify_return_event(p_return_id, v_created_by, 'system', 'Return on Hold', format('Return %s is on hold: %s', v_return_number, p_reason));
  return v_hold_id;
end;
$$;
grant execute on function place_return_on_hold_notified(uuid, text, text) to authenticated;

create or replace function release_return_hold_notified(p_hold_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_return_id uuid; v_created_by uuid; v_return_number text;
begin
  select return_id into v_return_id from sales_return_hold_history where id = p_hold_id;
  perform release_return_hold(p_hold_id, p_notes);
  select created_by, return_number into v_created_by, v_return_number from sales_returns where id = v_return_id;
  perform notify_return_event(v_return_id, v_created_by, 'system', 'Return Released', format('Return %s was released from hold.', v_return_number));
end;
$$;
grant execute on function release_return_hold_notified(uuid, text) to authenticated;

create or replace function post_return_notified(p_return_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare v_result jsonb; v_created_by uuid; v_return_number text;
begin
  select created_by, return_number into v_created_by, v_return_number from sales_returns where id = p_return_id;
  begin
    v_result := post_return(p_return_id, p_device_uid, p_is_offline);
    perform notify_return_event(p_return_id, v_created_by, 'system', 'Return Posted', format('Return %s was posted successfully.', v_return_number));
    return v_result;
  exception when others then
    perform notify_return_event(p_return_id, v_created_by, 'system', 'Return Posting Failed', format('Return %s failed to post: %s', v_return_number, sqlerrm));
    raise;
  end;
end;
$$;
grant execute on function post_return_notified(uuid, text, boolean) to authenticated;

create or replace function generate_return_credit_note_notified(p_return_id uuid, p_reason text default null)
returns uuid language plpgsql security definer as $$
declare v_credit_note_id uuid; v_created_by uuid; v_return_number text; v_number text;
begin
  v_credit_note_id := generate_return_credit_note(p_return_id, p_reason);
  select created_by, return_number into v_created_by, v_return_number from sales_returns where id = p_return_id;
  select credit_note_number into v_number from sales_return_credit_notes where id = v_credit_note_id;
  perform notify_return_event(p_return_id, v_created_by, 'system', 'Credit Note Generated', format('Credit note %s was generated for return %s.', v_number, v_return_number));
  return v_credit_note_id;
end;
$$;
grant execute on function generate_return_credit_note_notified(uuid, text) to authenticated;

create or replace function create_return_reversal_request_notified(p_return_id uuid, p_reason text)
returns uuid language plpgsql security definer as $$
declare v_request_id uuid; v_created_by uuid; v_return_number text;
begin
  v_request_id := create_return_reversal_request(p_return_id, p_reason);
  select created_by, return_number into v_created_by, v_return_number from sales_returns where id = p_return_id;
  perform notify_return_event(p_return_id, v_created_by, 'system', 'Return Reversal Requested', format('A reversal was requested for return %s.', v_return_number));
  return v_request_id;
end;
$$;
grant execute on function create_return_reversal_request_notified(uuid, text) to authenticated;

create or replace function dashboard_stats()
returns jsonb language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_result jsonb;
  v_today date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_year_start date := date_trunc('year', current_date)::date;
begin
  if v_company_id is null then raise exception 'No company context'; end if;

  select jsonb_build_object(
    'today_sales', coalesce((select sum(total_amount) from sales where company_id = v_company_id and status = 'completed' and created_at::date = v_today), 0),
    'month_sales', coalesce((select sum(total_amount) from sales where company_id = v_company_id and status = 'completed' and created_at >= v_month_start), 0),
    'year_sales', coalesce((select sum(total_amount) from sales where company_id = v_company_id and status = 'completed' and created_at >= v_year_start), 0),
    'today_cash_collected', coalesce((select sum(sp.amount) from sale_payments sp join sales s on s.id = sp.sale_id where s.company_id = v_company_id and sp.created_at::date = v_today), 0),
    'today_credit_collected', coalesce((select sum(amount) from collections where company_id = v_company_id and created_at::date = v_today), 0),
    'outstanding_receivables', coalesce((select sum(outstanding_balance) from customers where company_id = v_company_id), 0),
    'outstanding_payables', coalesce((select sum(outstanding_payable) from suppliers where company_id = v_company_id), 0),
    'warehouse_stock_value', coalesce((select sum(ws.quantity * p.cost_price) from warehouse_stock ws join products p on p.id = ws.product_id where ws.company_id = v_company_id), 0),
    'van_stock_value', coalesce((select sum(vs.quantity * p.cost_price) from van_stock vs join products p on p.id = vs.product_id where vs.company_id = v_company_id), 0),
    'low_stock_count', (select count(*) from warehouse_stock ws join products p on p.id = ws.product_id where ws.company_id = v_company_id and ws.quantity <= p.min_stock),
    'expiring_soon_count', (select count(distinct b.id) from batches b join products p on p.id = b.product_id where b.company_id = v_company_id and b.expiry_date is not null and b.expiry_date <= current_date + 30 and b.expiry_date >= current_date),
    'pending_van_loadings', (select count(*) from van_loadings where company_id = v_company_id and status = 'pending_approval'),
    'pending_van_unloadings', (select count(*) from van_unloadings where company_id = v_company_id and status = 'pending_approval'),
    'pending_stock_adjustments', (select count(*) from stock_adjustments where company_id = v_company_id and status = 'pending'),
    'pending_returns', (select count(*) from returns where company_id = v_company_id and status = 'pending'),
    'unread_notifications', (select count(*) from notifications where company_id = v_company_id and user_id = auth.uid() and is_read = false),
    'visits_today_planned', (select count(*) from customer_visits where company_id = v_company_id and visit_date = v_today),
    'visits_today_completed', (select count(*) from customer_visits where company_id = v_company_id and visit_date = v_today and status = 'completed'),
    'vans_live_now', (select count(*) from vans where company_id = v_company_id and last_location_at >= now() - interval '2 minutes'),
    'orders_pending_approval', (select count(*) from sales_orders where company_id = v_company_id and approval_status = 'pending'),
    'orders_approved', (select count(*) from sales_orders where company_id = v_company_id and status = 'approved'),
    'backordered_orders', (select count(distinct order_id) from sales_order_backorders where company_id = v_company_id and status not in ('cancelled', 'closed', 'fulfilled')),
    'draft_invoices_today', (select count(*) from sales_invoices where company_id = v_company_id and invoice_date = v_today and status not in ('cancelled_before_posting', 'posted')),
    'invoices_from_orders', (select count(*) from sales_invoices where company_id = v_company_id and sales_order_id is not null and invoice_date = v_today),

    'invoices_pending_validation', (select count(*) from sales_invoices where company_id = v_company_id and status = 'pending_validation'),
    'invoices_pending_approval', (select count(*) from sales_invoices where company_id = v_company_id and status = 'pending_approval'),
    'invoices_approved', (select count(*) from sales_invoices where company_id = v_company_id and status = 'approved'),
    'invoices_ready_to_post', (select count(*) from sales_invoices where company_id = v_company_id and status = 'ready_to_post'),
    'invoices_posting_failed', (select count(*) from sales_invoices where company_id = v_company_id and status = 'posting_failed'),
    'posted_invoices_today', (select count(*) from sales_invoices where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today),
    'posted_sales_value_today', coalesce((select sum(net_amount) from sales_invoices where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today), 0),
    'cash_invoice_value_today', coalesce((select sum(net_amount) from sales_invoices where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today and payment_type = 'cash'), 0),
    'credit_invoice_value_today', coalesce((select sum(net_amount) from sales_invoices where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today and payment_type = 'credit'), 0),
    'hybrid_invoice_value_today', coalesce((select sum(net_amount) from sales_invoices where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today and payment_type = 'hybrid'), 0),
    'invoices_on_hold', (select count(*) from sales_invoices where company_id = v_company_id and is_on_hold),
    'invoice_stock_validation_failed', (select count(*) from sales_invoices where company_id = v_company_id and stock_validation_status in ('unavailable', 'batch_conflict', 'serial_conflict')),
    'invoice_credit_validation_failed', (select count(*) from sales_invoices where company_id = v_company_id and credit_validation_status in ('over_limit', 'blocked')),
    'offline_invoices_pending_sync', (select count(*) from sales_invoices where company_id = v_company_id and status = 'sync_pending'),
    'offline_posting_conflicts', (select count(*) from sales_invoice_offline_posting_logs where company_id = v_company_id and reconciliation_status = 'conflict'),
    'invoice_print_failures', (select count(*) from sales_invoice_print_errors where company_id = v_company_id and occurred_at::date = v_today),
    'void_requests_pending', (select count(*) from sales_invoice_void_requests where company_id = v_company_id and approval_status = 'pending'),
    'invoices_by_van_today', (
      select coalesce(jsonb_object_agg(v.name, cnt), '{}'::jsonb) from (
        select van_id, count(*) cnt from sales_invoices where company_id = v_company_id and invoice_date = v_today and van_id is not null group by van_id
      ) x join vans v on v.id = x.van_id
    ),
    'average_invoice_value_today', coalesce((select round(avg(net_amount), 2) from sales_invoices where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today), 0),

    'collection_drafts_today', (select count(*) from receipt_vouchers where company_id = v_company_id and receipt_date = v_today and status != 'cancelled_before_posting'),
    'draft_collection_amount_today', coalesce((select sum(receipt_amount) from receipt_vouchers where company_id = v_company_id and receipt_date = v_today and status != 'cancelled_before_posting'), 0),
    'cash_collection_drafts', (select count(distinct rv.id) from receipt_vouchers rv join receipt_payment_components rpc on rpc.receipt_id = rv.id where rv.company_id = v_company_id and rv.receipt_date = v_today and rpc.payment_method_code = 'cash'),
    'card_collection_drafts', (select count(distinct rv.id) from receipt_vouchers rv join receipt_payment_components rpc on rpc.receipt_id = rv.id where rv.company_id = v_company_id and rv.receipt_date = v_today and rpc.payment_method_code = 'card'),
    'bank_transfer_drafts', (select count(distinct rv.id) from receipt_vouchers rv join receipt_payment_components rpc on rpc.receipt_id = rv.id where rv.company_id = v_company_id and rv.receipt_date = v_today and rpc.payment_method_code = 'bank_transfer'),
    'cheque_collection_drafts', (select count(distinct rv.id) from receipt_vouchers rv join receipt_payment_components rpc on rpc.receipt_id = rv.id where rv.company_id = v_company_id and rv.receipt_date = v_today and rpc.payment_method_code = 'cheque'),
    'advance_payment_drafts', (select count(*) from receipt_vouchers where company_id = v_company_id and allocation_status = 'advance' and receipt_date = v_today),
    'unallocated_receipt_drafts', (select count(*) from receipt_vouchers where company_id = v_company_id and allocation_status = 'unallocated' and receipt_date = v_today),
    'partially_allocated_drafts', (select count(*) from receipt_vouchers where company_id = v_company_id and allocation_status = 'partially_allocated' and receipt_date = v_today),
    'fully_allocated_drafts', (select count(*) from receipt_vouchers where company_id = v_company_id and allocation_status = 'fully_allocated' and receipt_date = v_today),
    'offline_receipt_drafts_pending_sync', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'sync_pending'),
    'receipt_sync_failed', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'sync_failed'),
    'payment_promises_due', (select count(*) from payment_promises where company_id = v_company_id and status = 'open' and reminder_date <= v_today),
    'receipts_by_van_today', (
      select coalesce(jsonb_object_agg(v.name, cnt), '{}'::jsonb) from (
        select van_id, count(*) cnt from receipt_vouchers where company_id = v_company_id and receipt_date = v_today and van_id is not null group by van_id
      ) x join vans v on v.id = x.van_id
    ),

    -- Phase 5B.2 Part 2 widgets
    'receipts_pending_validation', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'pending_validation'),
    'receipts_pending_approval', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'pending_approval'),
    'receipts_approved', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'approved'),
    'receipts_ready_to_post', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'ready_to_post'),
    'receipts_posting_failed', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'posting_failed'),
    'posted_receipts_today', (select count(*) from receipt_vouchers where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today),
    'posted_collection_value_today', coalesce((select sum(receipt_amount) from receipt_vouchers where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today), 0),
    'invoices_paid_today', (select count(*) from sales_invoices where company_id = v_company_id and payment_status = 'paid' and settlement_date::date = v_today),
    'invoices_partially_paid', (select count(*) from sales_invoices where company_id = v_company_id and payment_status = 'partially_paid'),
    'invoices_unpaid_posted', (select count(*) from sales_invoices where company_id = v_company_id and payment_status = 'unpaid' and posting_status = 'posted'),
    'receipts_on_hold', (select count(*) from receipt_vouchers where company_id = v_company_id and is_on_hold),
    'cheques_pending_verification', (select count(*) from cheque_receipt_details where company_id = v_company_id and cheque_status = 'pending_verification'),
    'cheques_post_dated', (select count(*) from cheque_receipt_details where company_id = v_company_id and cheque_status = 'post_dated'),
    'cheques_deposited', (select count(*) from cheque_receipt_details where company_id = v_company_id and cheque_status = 'deposited'),
    'cheques_returned_this_month', (select count(*) from cheque_return_records where company_id = v_company_id and return_date >= v_month_start),
    'customer_advance_balance_total', coalesce((select sum(available_amount) from customer_advance_balances where company_id = v_company_id and status in ('available', 'partially_allocated')), 0),
    'customer_unallocated_credit_total', coalesce((select sum(available_amount) from customer_unallocated_credits where company_id = v_company_id and status in ('available', 'partially_allocated')), 0),
    'reversal_requests_pending', (select count(*) from receipt_reversal_requests where company_id = v_company_id and approval_status = 'pending'),
    'offline_receipts_pending_sync', (select count(*) from receipt_vouchers where company_id = v_company_id and status = 'sync_pending'),
    'receipt_sync_conflicts_open', (select count(*) from receipt_sync_conflicts where company_id = v_company_id and status = 'open'),
    'receipt_print_failures_today', (select count(*) from receipt_print_errors where company_id = v_company_id and occurred_at::date = v_today),
    'payment_promises_kept_this_month', (select count(*) from payment_promises where company_id = v_company_id and status = 'kept' and promise_date >= v_month_start),
    'payment_promises_broken_this_month', (select count(*) from payment_promises where company_id = v_company_id and status = 'broken' and promise_date >= v_month_start),

    -- Phase 5B.3 Part 1 widgets — drafts only, never finalized returns.
    'return_drafts_today', (select count(*) from sales_returns where company_id = v_company_id and return_date = v_today and status != 'cancelled_before_posting'),
    'draft_return_value_today', coalesce((select sum(net_return_amount) from sales_returns where company_id = v_company_id and return_date = v_today and status != 'cancelled_before_posting'), 0),
    'good_stock_return_drafts', (select count(*) from sales_returns sr join sales_return_types srt on srt.id = sr.return_type_id where sr.company_id = v_company_id and sr.return_date = v_today and srt.code = 'good_stock_return'),
    'damaged_return_drafts', (select count(*) from sales_returns sr join sales_return_types srt on srt.id = sr.return_type_id where sr.company_id = v_company_id and sr.return_date = v_today and srt.code = 'damaged_product_return'),
    'expired_return_drafts', (select count(*) from sales_returns sr join sales_return_types srt on srt.id = sr.return_type_id where sr.company_id = v_company_id and sr.return_date = v_today and srt.code = 'expired_product_return'),
    'replacement_requests_pending', (select count(*) from sales_return_replacement_requests where company_id = v_company_id and approval_status in ('not_required', 'pending')),
    'returns_without_invoice', (select count(*) from sales_returns where company_id = v_company_id and original_invoice_id is null and return_date = v_today),
    'returns_outside_policy', (select count(*) from sales_returns where company_id = v_company_id and validation_status = 'outside_return_period'),
    'batch_validation_warnings', (select count(*) from sales_returns where company_id = v_company_id and validation_status = 'batch_mismatch'),
    'serial_validation_warnings', (select count(*) from sales_returns where company_id = v_company_id and validation_status = 'serial_mismatch'),
    'offline_returns_pending_sync', (select count(*) from sales_returns where company_id = v_company_id and status = 'sync_pending'),
    'return_sync_failed', (select count(*) from sales_returns where company_id = v_company_id and status = 'sync_failed'),
    'returns_by_van_today', (
      select coalesce(jsonb_object_agg(v.name, cnt), '{}'::jsonb) from (
        select van_id, count(*) cnt from sales_returns where company_id = v_company_id and return_date = v_today and van_id is not null group by van_id
      ) x join vans v on v.id = x.van_id
    ),

    -- Phase 5B.3 Part 2 widgets — real posted-return data only.
    'returns_pending_validation', (select count(*) from sales_returns where company_id = v_company_id and status = 'pending_validation'),
    'returns_pending_approval', (select count(*) from sales_returns where company_id = v_company_id and status = 'pending_approval'),
    'returns_pending_inspection', (select count(*) from sales_returns where company_id = v_company_id and status = 'pending_inspection'),
    'returns_on_hold', (select count(*) from sales_returns where company_id = v_company_id and is_on_hold),
    'accepted_returns', (select count(*) from sales_returns where company_id = v_company_id and status = 'accepted'),
    'partially_accepted_returns', (select count(*) from sales_returns where company_id = v_company_id and status = 'partially_accepted'),
    'rejected_returns', (select count(*) from sales_returns where company_id = v_company_id and status = 'rejected'),
    'returns_ready_to_post', (select count(*) from sales_returns where company_id = v_company_id and status = 'ready_to_post'),
    'posted_returns_today', (select count(*) from sales_returns where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today),
    'posted_return_value_today', coalesce((select sum(net_return_amount) from sales_returns where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today), 0),
    'good_stock_returned_today', coalesce((select sum(quantity) from sales_return_stock_postings where company_id = v_company_id and destination_code in ('saleable_warehouse', 'saleable_van') and posted_at::date = v_today), 0),
    'damaged_stock_returned_today', coalesce((select sum(quantity) from sales_return_stock_postings where company_id = v_company_id and destination_code = 'damaged_warehouse' and posted_at::date = v_today), 0),
    'expired_stock_returned_today', coalesce((select sum(quantity) from sales_return_stock_postings where company_id = v_company_id and destination_code = 'expired_stock_location' and posted_at::date = v_today), 0),
    'quarantine_stock_returned_today', coalesce((select sum(quantity) from sales_return_stock_postings where company_id = v_company_id and destination_code = 'quarantine_location' and posted_at::date = v_today), 0),
    'credit_notes_pending', (select count(*) from sales_return_credit_notes where company_id = v_company_id and status in ('draft', 'pending_approval')),
    'credit_notes_generated_today', (select count(*) from sales_return_credit_notes where company_id = v_company_id and created_at::date = v_today),
    'replacement_requests_pending', (select count(*) from sales_return_replacement_orders where company_id = v_company_id and status in ('requested', 'pending_approval')),
    'replacement_orders_approved', (select count(*) from sales_return_replacement_orders where company_id = v_company_id and status = 'approved'),
    'return_posting_failures', (select count(*) from sales_returns where company_id = v_company_id and status = 'posting_failed'),
    'offline_returns_pending_sync', (select count(*) from sales_returns where company_id = v_company_id and status = 'sync_pending'),
    'return_sync_conflicts_open', (select count(*) from sales_return_sync_conflicts where company_id = v_company_id and status = 'open'),
    'return_reversal_requests_pending', (select count(*) from sales_return_reversal_requests where company_id = v_company_id and approval_status = 'pending')
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function dashboard_stats() to authenticated;
