-- ============================================================================
-- 0090_receipt_dashboard_notifications.sql
-- Continues 0081-0089. Extends dashboard_stats() with real Part 2
-- receipt/cheque/reversal KPIs — full prior widget set preserved and
-- appended to, not replaced (checked against 0080's actual output this
-- time, having made the mistake of dropping widgets once already this
-- build).
-- ============================================================================

create or replace function notify_receipt_event(p_receipt_id uuid, p_user_id uuid, p_type text, p_title text, p_message text)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  if p_user_id is null then return; end if;
  select company_id into v_company_id from receipt_vouchers where id = p_receipt_id;
  insert into notifications (company_id, user_id, type, title, message, reference_table, reference_id)
  values (v_company_id, p_user_id, p_type, p_title, p_message, 'receipt_vouchers', p_receipt_id);
end;
$$;
grant execute on function notify_receipt_event(uuid, uuid, text, text, text) to authenticated;

create or replace function submit_receipt_for_approval_notified(p_receipt_id uuid)
returns uuid language plpgsql security definer as $$
declare v_approval_id uuid; v_receipt receipt_vouchers%rowtype;
begin
  v_approval_id := submit_receipt_for_approval(p_receipt_id);
  select * into v_receipt from receipt_vouchers where id = p_receipt_id;
  if v_receipt.approval_status = 'pending' then
    perform notify_receipt_event(p_receipt_id, v_receipt.created_by, 'approval_notification', 'Receipt Pending Approval', format('Receipt %s is pending approval.', v_receipt.receipt_number));
  end if;
  return v_approval_id;
end;
$$;
grant execute on function submit_receipt_for_approval_notified(uuid) to authenticated;

create or replace function process_receipt_approval_action_notified(p_step_id uuid, p_action text, p_reason text default null, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_receipt_id uuid; v_created_by uuid; v_receipt_number text;
begin
  perform process_receipt_approval_action(p_step_id, p_action, p_reason, p_notes);
  select a.receipt_id into v_receipt_id from receipt_approval_steps s join receipt_approvals a on a.id = s.approval_id where s.id = p_step_id;
  select created_by, receipt_number into v_created_by, v_receipt_number from receipt_vouchers where id = v_receipt_id;

  if p_action = 'approve' then
    perform notify_receipt_event(v_receipt_id, v_created_by, 'approval_notification', 'Receipt Approved', format('Receipt %s was approved.', v_receipt_number));
  elsif p_action = 'reject' then
    perform notify_receipt_event(v_receipt_id, v_created_by, 'system', 'Receipt Rejected', format('Receipt %s was rejected: %s', v_receipt_number, coalesce(p_reason, '')));
  elsif p_action = 'return_for_correction' then
    perform notify_receipt_event(v_receipt_id, v_created_by, 'system', 'Receipt Returned for Correction', format('Receipt %s was returned: %s', v_receipt_number, coalesce(p_reason, '')));
  end if;
end;
$$;
grant execute on function process_receipt_approval_action_notified(uuid, text, text, text) to authenticated;

create or replace function place_receipt_on_hold_notified(p_receipt_id uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_hold_id uuid; v_created_by uuid; v_receipt_number text;
begin
  v_hold_id := place_receipt_on_hold(p_receipt_id, p_reason, p_notes);
  select created_by, receipt_number into v_created_by, v_receipt_number from receipt_vouchers where id = p_receipt_id;
  perform notify_receipt_event(p_receipt_id, v_created_by, 'system', 'Receipt on Hold', format('Receipt %s is on hold: %s', v_receipt_number, p_reason));
  return v_hold_id;
end;
$$;
grant execute on function place_receipt_on_hold_notified(uuid, text, text) to authenticated;

create or replace function release_receipt_hold_notified(p_hold_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_receipt_id uuid; v_created_by uuid; v_receipt_number text;
begin
  select receipt_id into v_receipt_id from receipt_hold_history where id = p_hold_id;
  perform release_receipt_hold(p_hold_id, p_notes);
  select created_by, receipt_number into v_created_by, v_receipt_number from receipt_vouchers where id = v_receipt_id;
  perform notify_receipt_event(v_receipt_id, v_created_by, 'system', 'Receipt Released', format('Receipt %s was released from hold.', v_receipt_number));
end;
$$;
grant execute on function release_receipt_hold_notified(uuid, text) to authenticated;

create or replace function post_receipt_notified(p_receipt_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare v_result jsonb; v_created_by uuid; v_receipt_number text;
begin
  select created_by, receipt_number into v_created_by, v_receipt_number from receipt_vouchers where id = p_receipt_id;
  begin
    v_result := post_receipt(p_receipt_id, p_device_uid, p_is_offline);
    perform notify_receipt_event(p_receipt_id, v_created_by, 'system', 'Receipt Posted', format('Receipt %s was posted successfully.', v_receipt_number));
    return v_result;
  exception when others then
    perform notify_receipt_event(p_receipt_id, v_created_by, 'system', 'Receipt Posting Failed', format('Receipt %s failed to post: %s', v_receipt_number, sqlerrm));
    raise;
  end;
end;
$$;
grant execute on function post_receipt_notified(uuid, text, boolean) to authenticated;

create or replace function create_receipt_reversal_request_notified(p_receipt_id uuid, p_reason text)
returns uuid language plpgsql security definer as $$
declare v_request_id uuid; v_created_by uuid; v_receipt_number text;
begin
  v_request_id := create_receipt_reversal_request(p_receipt_id, p_reason);
  select created_by, receipt_number into v_created_by, v_receipt_number from receipt_vouchers where id = p_receipt_id;
  perform notify_receipt_event(p_receipt_id, v_created_by, 'system', 'Reversal Requested', format('A reversal was requested for receipt %s.', v_receipt_number));
  return v_request_id;
end;
$$;
grant execute on function create_receipt_reversal_request_notified(uuid, text) to authenticated;

create or replace function return_cheque_notified(p_payment_component_id uuid, p_return_reason text, p_bank_charges numeric default 0, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_return_id uuid; v_receipt_id uuid; v_created_by uuid; v_receipt_number text;
begin
  select receipt_id into v_receipt_id from receipt_payment_components where id = p_payment_component_id;
  v_return_id := return_cheque(p_payment_component_id, p_return_reason, p_bank_charges, p_notes);
  select created_by, receipt_number into v_created_by, v_receipt_number from receipt_vouchers where id = v_receipt_id;
  perform notify_receipt_event(v_receipt_id, v_created_by, 'system', 'Cheque Returned', format('A cheque on receipt %s was returned: %s', v_receipt_number, p_return_reason));
  return v_return_id;
end;
$$;
grant execute on function return_cheque_notified(uuid, text, numeric, text) to authenticated;

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
    'payment_promises_broken_this_month', (select count(*) from payment_promises where company_id = v_company_id and status = 'broken' and promise_date >= v_month_start)
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function dashboard_stats() to authenticated;
