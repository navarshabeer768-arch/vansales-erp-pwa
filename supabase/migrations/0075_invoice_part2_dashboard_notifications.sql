-- ============================================================================
-- 0075_invoice_part2_dashboard_notifications.sql
-- Continues 0066-0074.
-- ============================================================================

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
    'average_invoice_value_today', coalesce((select round(avg(net_amount), 2) from sales_invoices where company_id = v_company_id and posting_status = 'posted' and posted_date::date = v_today), 0)
  ) into v_result;

  return v_result;
end;
$$;
grant execute on function dashboard_stats() to authenticated;

create or replace function submit_invoice_for_approval_notified(p_invoice_id uuid)
returns uuid language plpgsql security definer as $$
declare v_approval_id uuid; v_invoice sales_invoices%rowtype;
begin
  v_approval_id := submit_invoice_for_approval(p_invoice_id);
  select * into v_invoice from sales_invoices where id = p_invoice_id;
  if v_invoice.approval_status = 'pending' then
    perform notify_invoice_event(p_invoice_id, v_invoice.created_by, 'approval_notification', 'Invoice Pending Approval', format('Invoice %s is pending approval.', v_invoice.invoice_number));
  end if;
  return v_approval_id;
end;
$$;
grant execute on function submit_invoice_for_approval_notified(uuid) to authenticated;

create or replace function process_invoice_approval_action_notified(p_step_id uuid, p_action text, p_reason text default null, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_invoice_id uuid; v_created_by uuid; v_invoice_number text;
begin
  perform process_invoice_approval_action(p_step_id, p_action, p_reason, p_notes);
  select a.invoice_id into v_invoice_id from sales_invoice_approval_steps s join sales_invoice_approvals a on a.id = s.approval_id where s.id = p_step_id;
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = v_invoice_id;

  if p_action = 'approve' then
    perform notify_invoice_event(v_invoice_id, v_created_by, 'approval_notification', 'Invoice Approved', format('Invoice %s was approved.', v_invoice_number));
  elsif p_action = 'reject' then
    perform notify_invoice_event(v_invoice_id, v_created_by, 'system', 'Invoice Rejected', format('Invoice %s was rejected: %s', v_invoice_number, coalesce(p_reason, '')));
  elsif p_action = 'return_for_correction' then
    perform notify_invoice_event(v_invoice_id, v_created_by, 'system', 'Invoice Returned for Correction', format('Invoice %s was returned: %s', v_invoice_number, coalesce(p_reason, '')));
  end if;
end;
$$;
grant execute on function process_invoice_approval_action_notified(uuid, text, text, text) to authenticated;

create or replace function place_invoice_on_hold_notified(p_invoice_id uuid, p_reason text, p_notes text default null)
returns uuid language plpgsql security definer as $$
declare v_hold_id uuid; v_created_by uuid; v_invoice_number text;
begin
  v_hold_id := place_invoice_on_hold(p_invoice_id, p_reason, p_notes);
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = p_invoice_id;
  perform notify_invoice_event(p_invoice_id, v_created_by, 'system', 'Invoice on Hold', format('Invoice %s is on hold: %s', v_invoice_number, p_reason));
  return v_hold_id;
end;
$$;
grant execute on function place_invoice_on_hold_notified(uuid, text, text) to authenticated;

create or replace function release_invoice_hold_notified(p_hold_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_invoice_id uuid; v_created_by uuid; v_invoice_number text;
begin
  select invoice_id into v_invoice_id from sales_invoice_hold_history where id = p_hold_id;
  perform release_invoice_hold(p_hold_id, p_notes);
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = v_invoice_id;
  perform notify_invoice_event(v_invoice_id, v_created_by, 'system', 'Invoice Released', format('Invoice %s was released from hold.', v_invoice_number));
end;
$$;
grant execute on function release_invoice_hold_notified(uuid, text) to authenticated;

create or replace function post_sales_invoice_notified(p_invoice_id uuid, p_device_uid text default null, p_is_offline boolean default false)
returns jsonb language plpgsql security definer as $$
declare v_result jsonb; v_created_by uuid; v_invoice_number text;
begin
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = p_invoice_id;
  begin
    v_result := post_sales_invoice(p_invoice_id, p_device_uid, p_is_offline);
    perform notify_invoice_event(p_invoice_id, v_created_by, 'system', 'Invoice Posted', format('Invoice %s was posted successfully.', v_invoice_number));
    return v_result;
  exception when others then
    perform notify_invoice_event(p_invoice_id, v_created_by, 'system', 'Invoice Posting Failed', format('Invoice %s failed to post: %s', v_invoice_number, sqlerrm));
    raise;
  end;
end;
$$;
grant execute on function post_sales_invoice_notified(uuid, text, boolean) to authenticated;

create or replace function record_invoice_print_error_notified(
  p_invoice_id uuid, p_error_message text, p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare v_error_id uuid; v_created_by uuid; v_invoice_number text;
begin
  v_error_id := record_invoice_print_error(p_invoice_id, p_error_message, p_printer_name, p_printer_type, p_device_uid);
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = p_invoice_id;
  perform notify_invoice_event(p_invoice_id, v_created_by, 'system', 'Print Failed', format('Printing invoice %s failed: %s', v_invoice_number, p_error_message));
  return v_error_id;
end;
$$;
grant execute on function record_invoice_print_error_notified(uuid, text, text, text, text) to authenticated;

create or replace function create_invoice_void_request_notified(p_invoice_id uuid, p_reason text)
returns uuid language plpgsql security definer as $$
declare v_request_id uuid; v_created_by uuid; v_invoice_number text;
begin
  v_request_id := create_invoice_void_request(p_invoice_id, p_reason);
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = p_invoice_id;
  perform notify_invoice_event(p_invoice_id, v_created_by, 'system', 'Void Requested', format('A void was requested for invoice %s.', v_invoice_number));
  return v_request_id;
end;
$$;
grant execute on function create_invoice_void_request_notified(uuid, text) to authenticated;
