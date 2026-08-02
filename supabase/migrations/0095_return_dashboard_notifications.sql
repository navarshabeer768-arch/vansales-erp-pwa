-- ============================================================================
-- 0095_return_dashboard_notifications.sql
-- Continues 0091-0094. Extends dashboard_stats() with real Part 1 return
-- draft KPIs — full prior widget set preserved and appended to.
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

create or replace function create_sales_return_draft_notified(
  p_return_type_code text, p_customer_id uuid, p_items jsonb, p_client_uuid text, p_original_invoice_id uuid default null,
  p_return_reason_code text default null, p_route_id uuid default null, p_beat_plan_id uuid default null,
  p_customer_visit_id uuid default null, p_daily_visit_plan_id uuid default null, p_van_id uuid default null,
  p_warehouse_id uuid default null, p_responsible_employee_id uuid default null, p_return_source text default 'web',
  p_customer_reference text default null, p_customer_complaint_reference text default null, p_replacement_requested boolean default false,
  p_notes text default null, p_internal_notes text default null, p_device_uid text default null, p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare v_return_id uuid; v_return sales_returns%rowtype; v_return_type_code text;
begin
  v_return_id := create_sales_return_draft(
    p_return_type_code, p_customer_id, p_items, p_client_uuid, p_original_invoice_id, p_return_reason_code, p_route_id,
    p_beat_plan_id, p_customer_visit_id, p_daily_visit_plan_id, p_van_id, p_warehouse_id, p_responsible_employee_id,
    p_return_source, p_customer_reference, p_customer_complaint_reference, p_replacement_requested, p_notes, p_internal_notes,
    p_device_uid, p_is_offline
  );
  select * into v_return from sales_returns where id = v_return_id;

  if p_original_invoice_id is null then
    perform notify_return_event(v_return_id, v_return.created_by, 'system', 'Return Without Invoice Created', format('Return %s was created without an invoice.', v_return.return_number));
  else
    perform notify_return_event(v_return_id, v_return.created_by, 'system', 'Return Draft Created', format('Return %s was created as a draft.', v_return.return_number));
  end if;

  if v_return.replacement_requested then
    perform notify_return_event(v_return_id, v_return.created_by, 'system', 'Replacement Requested', format('Return %s requests a replacement.', v_return.return_number));
  end if;

  return v_return_id;
end;
$$;
grant execute on function create_sales_return_draft_notified(
  text, uuid, jsonb, text, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, boolean, text, text, text, boolean
) to authenticated;

create or replace function change_return_status_notified(p_return_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_return sales_returns%rowtype;
begin
  perform change_return_status(p_return_id, p_new_status, p_reason);
  select * into v_return from sales_returns where id = p_return_id;

  if p_new_status = 'submitted' then
    perform notify_return_event(p_return_id, v_return.created_by, 'system', 'Return Draft Submitted', format('Return %s was submitted.', v_return.return_number));
  elsif p_new_status = 'returned_for_correction' then
    perform notify_return_event(p_return_id, v_return.created_by, 'system', 'Return Returned for Correction', format('Return %s was returned: %s', v_return.return_number, coalesce(p_reason, '')));
  elsif p_new_status = 'cancelled_before_posting' then
    perform notify_return_event(p_return_id, v_return.created_by, 'system', 'Return Draft Cancelled', format('Return %s was cancelled: %s', v_return.return_number, coalesce(p_reason, '')));
  end if;
end;
$$;
grant execute on function change_return_status_notified(uuid, text, text) to authenticated;

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
    )
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function dashboard_stats() to authenticated;
