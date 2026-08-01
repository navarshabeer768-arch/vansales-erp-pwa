-- ============================================================================
-- 0065_invoice_notifications.sql
-- Wires notifications for Phase 5B.1 Part 1's named triggers, reusing the
-- existing notifications table and the notify_order_event() pattern.
-- ============================================================================

create or replace function notify_invoice_event(p_invoice_id uuid, p_user_id uuid, p_type text, p_title text, p_message text)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  if p_user_id is null then return; end if;
  select company_id into v_company_id from sales_invoices where id = p_invoice_id;
  insert into notifications (company_id, user_id, type, title, message, reference_table, reference_id)
  values (v_company_id, p_user_id, p_type, p_title, p_message, 'sales_invoices', p_invoice_id);
end;
$$;
grant execute on function notify_invoice_event(uuid, uuid, text, text, text) to authenticated;

create or replace function create_sales_invoice_notified(
  p_invoice_type_code text, p_items jsonb, p_client_uuid text, p_customer_id uuid default null,
  p_walk_in_name text default null, p_walk_in_phone text default null, p_walk_in_address text default null, p_walk_in_tax_number text default null,
  p_branch_id uuid default null, p_route_id uuid default null, p_beat_plan_id uuid default null, p_daily_visit_plan_id uuid default null,
  p_customer_visit_id uuid default null, p_salesman_id uuid default null, p_van_id uuid default null, p_warehouse_id uuid default null,
  p_billing_address_id uuid default null, p_delivery_address_id uuid default null, p_contact_person text default null,
  p_delivery_date date default null, p_payment_type text default 'cash', p_payment_term_id uuid default null,
  p_customer_reference text default null, p_customer_po text default null, p_notes text default null, p_internal_notes text default null,
  p_is_direct_invoice boolean default true, p_direct_invoice_source text default null, p_manual_invoice_number text default null,
  p_invoice_source text default 'web', p_device_uid text default null, p_tax_inclusive boolean default false,
  p_latitude numeric default null, p_longitude numeric default null, p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_invoice_id uuid;
  v_invoice sales_invoices%rowtype;
begin
  v_invoice_id := create_sales_invoice(
    p_invoice_type_code, p_items, p_client_uuid, p_customer_id, p_walk_in_name, p_walk_in_phone, p_walk_in_address, p_walk_in_tax_number,
    p_branch_id, p_route_id, p_beat_plan_id, p_daily_visit_plan_id, p_customer_visit_id, p_salesman_id, p_van_id, p_warehouse_id,
    p_billing_address_id, p_delivery_address_id, p_contact_person, p_delivery_date, p_payment_type, p_payment_term_id,
    p_customer_reference, p_customer_po, p_notes, p_internal_notes, p_is_direct_invoice, p_direct_invoice_source, p_manual_invoice_number,
    p_invoice_source, p_device_uid, p_tax_inclusive, p_latitude, p_longitude, p_is_offline
  );
  select * into v_invoice from sales_invoices where id = v_invoice_id;

  if v_invoice.sales_order_id is not null then
    perform notify_invoice_event(v_invoice_id, v_invoice.created_by, 'system',
      case when v_invoice.invoice_type_id = (select id from sales_invoice_types where code = 'partial_order_invoice') then 'Partial Conversion Created' else 'Order Converted to Invoice Draft' end,
      format('Invoice %s was created from Sales Order.', v_invoice.invoice_number));
  else
    perform notify_invoice_event(v_invoice_id, v_invoice.created_by, 'system', 'Invoice Draft Created',
      format('Invoice %s was created as a draft.', v_invoice.invoice_number));
  end if;

  return v_invoice_id;
end;
$$;
grant execute on function create_sales_invoice_notified(
  text, jsonb, text, uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, date, text, uuid, text, text,
  text, text, boolean, text, text, text, text, boolean, numeric, numeric, numeric, boolean
) to authenticated;

create or replace function change_sales_invoice_status_notified(p_invoice_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_invoice sales_invoices%rowtype;
begin
  perform change_sales_invoice_status(p_invoice_id, p_new_status, p_reason);
  select * into v_invoice from sales_invoices where id = p_invoice_id;

  if p_new_status = 'pending_submission' then
    perform notify_invoice_event(p_invoice_id, v_invoice.created_by, 'system', 'Draft Pending Submission',
      format('Invoice %s is pending submission.', v_invoice.invoice_number));
  elsif p_new_status = 'returned_for_correction' then
    perform notify_invoice_event(p_invoice_id, v_invoice.created_by, 'system', 'Draft Returned for Correction',
      format('Invoice %s was returned for correction: %s', v_invoice.invoice_number, coalesce(p_reason, '')));
  elsif p_new_status = 'cancelled_before_posting' then
    perform notify_invoice_event(p_invoice_id, v_invoice.created_by, 'system', 'Draft Cancelled',
      format('Invoice %s was cancelled: %s', v_invoice.invoice_number, coalesce(p_reason, '')));
  end if;
end;
$$;
grant execute on function change_sales_invoice_status_notified(uuid, text, text) to authenticated;

create or replace function request_invoice_price_override_notified(p_invoice_item_id uuid, p_requested_price numeric, p_reason text)
returns uuid language plpgsql security definer as $$
declare v_request_id uuid; v_invoice_id uuid; v_created_by uuid;
begin
  v_request_id := request_invoice_price_override(p_invoice_item_id, p_requested_price, p_reason);
  select invoice_id into v_invoice_id from sales_invoice_items where id = p_invoice_item_id;
  select created_by into v_created_by from sales_invoices where id = v_invoice_id;
  perform notify_invoice_event(v_invoice_id, v_created_by, 'system', 'Price Request Created', 'A price override request was created for your invoice.');
  return v_request_id;
end;
$$;
grant execute on function request_invoice_price_override_notified(uuid, numeric, text) to authenticated;

create or replace function request_invoice_discount_override_notified(p_invoice_item_id uuid, p_requested_discount_pct numeric, p_allowed_discount_pct numeric, p_reason text)
returns uuid language plpgsql security definer as $$
declare v_request_id uuid; v_invoice_id uuid; v_created_by uuid;
begin
  v_request_id := request_invoice_discount_override(p_invoice_item_id, p_requested_discount_pct, p_allowed_discount_pct, p_reason);
  select invoice_id into v_invoice_id from sales_invoice_items where id = p_invoice_item_id;
  select created_by into v_created_by from sales_invoices where id = v_invoice_id;
  perform notify_invoice_event(v_invoice_id, v_created_by, 'system', 'Discount Request Created', 'A discount override request was created for your invoice.');
  return v_request_id;
end;
$$;
grant execute on function request_invoice_discount_override_notified(uuid, numeric, numeric, text) to authenticated;

create or replace function request_invoice_manual_free_quantity_notified(
  p_invoice_item_id uuid, p_product_id uuid, p_requested_free_quantity numeric, p_scheme_free_quantity numeric, p_reason text
) returns uuid language plpgsql security definer as $$
declare v_request_id uuid; v_invoice_id uuid; v_created_by uuid;
begin
  v_request_id := request_invoice_manual_free_quantity(p_invoice_item_id, p_product_id, p_requested_free_quantity, p_scheme_free_quantity, p_reason);
  select invoice_id into v_invoice_id from sales_invoice_items where id = p_invoice_item_id;
  select created_by into v_created_by from sales_invoices where id = v_invoice_id;
  perform notify_invoice_event(v_invoice_id, v_created_by, 'system', 'Manual Free Quantity Request Created', 'A manual free-quantity request was created for your invoice.');
  return v_request_id;
end;
$$;
grant execute on function request_invoice_manual_free_quantity_notified(uuid, uuid, numeric, numeric, text) to authenticated;

create or replace function notify_invoice_sync_failed(p_invoice_id uuid)
returns void language plpgsql security definer as $$
declare v_created_by uuid; v_invoice_number text;
begin
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = p_invoice_id;
  perform notify_invoice_event(p_invoice_id, v_created_by, 'system', 'Offline Draft Sync Failed', format('Invoice %s failed to sync.', v_invoice_number));
end;
$$;
grant execute on function notify_invoice_sync_failed(uuid) to authenticated;

create or replace function notify_invoice_conflict(p_invoice_id uuid)
returns void language plpgsql security definer as $$
declare v_created_by uuid; v_invoice_number text;
begin
  select created_by, invoice_number into v_created_by, v_invoice_number from sales_invoices where id = p_invoice_id;
  perform notify_invoice_event(p_invoice_id, v_created_by, 'system', 'Draft Conflict Detected', format('Invoice %s has a sync conflict requiring review.', v_invoice_number));
end;
$$;
grant execute on function notify_invoice_conflict(uuid) to authenticated;

-- Redefines cancel_sales_invoice() (0062) to also notify, since
-- cancellation is its own dedicated function rather than a generic
-- status change routed through change_sales_invoice_status_notified().
create or replace function cancel_sales_invoice(p_invoice_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_invoice sales_invoices%rowtype;
begin
  if not has_permission('sales_invoices:cancel_draft') then raise exception 'Not permitted'; end if;
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled_before_posting' then return; end if;
  if v_invoice.posting_status != 'not_posted' then raise exception 'Posted invoices cannot be cancelled through this function'; end if;

  perform change_sales_invoice_status(p_invoice_id, 'cancelled_before_posting', p_reason);
  if p_notes is not null then
    insert into sales_invoice_notes (company_id, invoice_id, note, note_type, created_by)
    values (v_invoice.company_id, p_invoice_id, p_notes, 'internal', auth.uid());
  end if;

  perform notify_invoice_event(p_invoice_id, v_invoice.created_by, 'system', 'Draft Cancelled',
    format('Invoice %s was cancelled: %s', v_invoice.invoice_number, p_reason));
end;
$$;
grant execute on function cancel_sales_invoice(uuid, text, text) to authenticated;
