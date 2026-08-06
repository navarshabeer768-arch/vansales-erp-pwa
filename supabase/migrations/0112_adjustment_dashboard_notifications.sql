-- ============================================================================
-- 0112_adjustment_dashboard_notifications.sql
-- Continues 0105-0111. Extends dashboard_stats() with real Part 1
-- financial-adjustment draft KPIs — full prior widget set preserved
-- and appended to (checked against 0104's actual output).
-- ============================================================================

create or replace function notify_adjustment_event(p_document_table text, p_document_id uuid, p_user_id uuid, p_type text, p_title text, p_message text)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  if p_user_id is null then return; end if;
  execute format('select company_id from %I where id = $1', p_document_table) into v_company_id using p_document_id;
  insert into notifications (company_id, user_id, type, title, message, reference_table, reference_id)
  values (v_company_id, p_user_id, p_type, p_title, p_message, p_document_table, p_document_id);
end;
$$;
grant execute on function notify_adjustment_event(text, uuid, uuid, text, text, text) to authenticated;

create or replace function create_credit_note_draft_notified(
  p_document_type_code text, p_customer_id uuid, p_client_uuid text, p_items jsonb default '[]', p_amount_only_value numeric default null,
  p_original_invoice_id uuid default null, p_original_return_id uuid default null, p_reason_code text default null,
  p_adjustment_type text default null, p_reference_number text default null, p_internal_notes text default null,
  p_customer_notes text default null, p_document_source text default 'web', p_responsible_employee_id uuid default null,
  p_route_id uuid default null, p_van_id uuid default null, p_device_uid text default null, p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare v_id uuid; v_created_by uuid; v_number text;
begin
  v_id := create_credit_note_draft(
    p_document_type_code, p_customer_id, p_client_uuid, p_items, p_amount_only_value, p_original_invoice_id, p_original_return_id,
    p_reason_code, p_adjustment_type, p_reference_number, p_internal_notes, p_customer_notes, p_document_source,
    p_responsible_employee_id, p_route_id, p_van_id, p_device_uid, p_is_offline
  );
  select created_by, document_number into v_created_by, v_number from credit_notes where id = v_id;
  perform notify_adjustment_event('credit_notes', v_id, v_created_by, 'system', 'Credit Note Draft Created', format('Credit note %s was created as a draft.', v_number));
  return v_id;
end;
$$;
grant execute on function create_credit_note_draft_notified(
  text, uuid, text, jsonb, numeric, uuid, uuid, text, text, text, text, text, text, uuid, uuid, uuid, text, boolean
) to authenticated;

create or replace function create_debit_note_draft_notified(
  p_document_type_code text, p_customer_id uuid, p_client_uuid text, p_items jsonb default '[]', p_amount_only_value numeric default null,
  p_original_invoice_id uuid default null, p_reason_code text default null, p_adjustment_type text default null,
  p_reference_number text default null, p_internal_notes text default null, p_customer_notes text default null,
  p_document_source text default 'web', p_responsible_employee_id uuid default null, p_route_id uuid default null,
  p_van_id uuid default null, p_device_uid text default null, p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare v_id uuid; v_created_by uuid; v_number text;
begin
  v_id := create_debit_note_draft(
    p_document_type_code, p_customer_id, p_client_uuid, p_items, p_amount_only_value, p_original_invoice_id,
    p_reason_code, p_adjustment_type, p_reference_number, p_internal_notes, p_customer_notes, p_document_source,
    p_responsible_employee_id, p_route_id, p_van_id, p_device_uid, p_is_offline
  );
  select created_by, document_number into v_created_by, v_number from debit_notes where id = v_id;
  perform notify_adjustment_event('debit_notes', v_id, v_created_by, 'system', 'Debit Note Draft Created', format('Debit note %s was created as a draft.', v_number));
  return v_id;
end;
$$;
grant execute on function create_debit_note_draft_notified(
  text, uuid, text, jsonb, numeric, uuid, text, text, text, text, text, text, uuid, uuid, uuid, text, boolean
) to authenticated;

create or replace function create_customer_adjustment_draft_notified(
  p_document_type_code text, p_customer_id uuid, p_original_invoice_id uuid, p_client_uuid text, p_items jsonb,
  p_reason_code text default null, p_adjustment_type text default null, p_reference_number text default null,
  p_internal_notes text default null, p_customer_notes text default null, p_document_source text default 'web',
  p_responsible_employee_id uuid default null, p_route_id uuid default null, p_van_id uuid default null,
  p_device_uid text default null, p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare v_id uuid; v_created_by uuid; v_number text;
begin
  v_id := create_customer_adjustment_draft(
    p_document_type_code, p_customer_id, p_original_invoice_id, p_client_uuid, p_items, p_reason_code, p_adjustment_type,
    p_reference_number, p_internal_notes, p_customer_notes, p_document_source, p_responsible_employee_id, p_route_id,
    p_van_id, p_device_uid, p_is_offline
  );
  select created_by, document_number into v_created_by, v_number from customer_adjustments where id = v_id;
  perform notify_adjustment_event('customer_adjustments', v_id, v_created_by, 'system', 'Customer Adjustment Draft Created', format('Adjustment %s was created as a draft.', v_number));
  return v_id;
end;
$$;
grant execute on function create_customer_adjustment_draft_notified(
  text, uuid, uuid, text, jsonb, text, text, text, text, text, text, uuid, uuid, uuid, text, boolean
) to authenticated;

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
    'return_reversal_requests_pending', (select count(*) from sales_return_reversal_requests where company_id = v_company_id and approval_status = 'pending'),

    -- Phase 5B.4 Part 1 widgets — drafts only, never posted documents.
    'credit_notes_today', (select count(*) from credit_notes where company_id = v_company_id and document_date = v_today and status != 'cancelled'),
    'debit_notes_today', (select count(*) from debit_notes where company_id = v_company_id and document_date = v_today and status != 'cancelled'),
    'customer_adjustments_today', (select count(*) from customer_adjustments where company_id = v_company_id and document_date = v_today and status != 'cancelled'),
    'adjustment_pending_drafts', (
      (select count(*) from credit_notes where company_id = v_company_id and status = 'draft') +
      (select count(*) from debit_notes where company_id = v_company_id and status = 'draft') +
      (select count(*) from customer_adjustments where company_id = v_company_id and status = 'draft')
    ),
    'adjustment_offline_drafts', (
      (select count(*) from credit_notes where company_id = v_company_id and status = 'sync_pending') +
      (select count(*) from debit_notes where company_id = v_company_id and status = 'sync_pending') +
      (select count(*) from customer_adjustments where company_id = v_company_id and status = 'sync_pending')
    ),
    'adjustment_sync_failures', (
      (select count(*) from credit_notes where company_id = v_company_id and status = 'sync_failed') +
      (select count(*) from debit_notes where company_id = v_company_id and status = 'sync_failed') +
      (select count(*) from customer_adjustments where company_id = v_company_id and status = 'sync_failed')
    )
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function dashboard_stats() to authenticated;
