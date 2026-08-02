-- ============================================================================
-- 0074_offline_van_posting_and_sync_extension.sql
-- Continues 0066-0073.
-- ============================================================================

create table sales_invoice_offline_posting_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  employee_id uuid references app_users(id) on delete set null,
  local_temporary_number text,
  idempotency_key text not null,
  posting_request_id text,
  submission_version integer not null default 1,
  locally_posted_at timestamptz,
  synced_at timestamptz,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'reconciled', 'reconciliation_failed', 'conflict')),
  reconciliation_error text,
  unique (company_id, idempotency_key)
);
create index idx_sales_invoice_offline_posting_logs_invoice on sales_invoice_offline_posting_logs(invoice_id);

alter table sales_invoice_offline_posting_logs enable row level security;
create policy sales_invoice_offline_posting_logs_isolation on sales_invoice_offline_posting_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function check_offline_posting_eligibility(p_device_uid text)
returns table (eligible boolean, reason text, van_id uuid, employee_id uuid, last_sync_at timestamptz) language plpgsql stable as $$
declare
  v_device devices%rowtype;
  v_operation record;
begin
  select * into v_device from devices where company_id = current_company_id() and device_uid = p_device_uid;
  if not found then
    return query select false, 'Device not registered', null::uuid, null::uuid, null::timestamptz; return;
  end if;
  if v_device.status != 'active' then
    return query select false, format('Device is %s', v_device.status), null::uuid, null::uuid, null::timestamptz; return;
  end if;
  if v_device.assigned_van_id is null then
    return query select false, 'Device has no assigned van — offline posting requires exclusive van stock', null::uuid, null::uuid, null::timestamptz; return;
  end if;
  if v_device.assigned_employee_id is null then
    return query select false, 'Device has no assigned employee', v_device.assigned_van_id, null::uuid, null::timestamptz; return;
  end if;

  select * into v_operation from daily_van_operations
  where van_id = v_device.assigned_van_id and operation_date = current_date and status = 'open'
  order by created_at desc limit 1;
  if v_operation.id is null then
    return query select false, 'No open daily van operation for this van today', v_device.assigned_van_id, v_device.assigned_employee_id, null::timestamptz; return;
  end if;

  return query select true, 'Eligible'::text, v_device.assigned_van_id, v_device.assigned_employee_id, v_device.updated_at;
end;
$$;
grant execute on function check_offline_posting_eligibility(text) to authenticated;

create or replace function reconcile_offline_van_posting(p_invoice_id uuid, p_device_uid text, p_idempotency_key text)
returns jsonb language plpgsql security definer as $$
declare
  v_device devices%rowtype;
  v_existing sales_invoice_offline_posting_logs%rowtype;
  v_company_id uuid;
  v_result jsonb;
begin
  select company_id into v_company_id from sales_invoices where id = p_invoice_id;
  select * into v_existing from sales_invoice_offline_posting_logs where company_id = v_company_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null and v_existing.reconciliation_status = 'reconciled' then
    return jsonb_build_object('already_reconciled', true, 'log_id', v_existing.id);
  end if;

  select * into v_device from devices where company_id = v_company_id and device_uid = p_device_uid;

  if v_existing.id is null then
    insert into sales_invoice_offline_posting_logs (company_id, invoice_id, device_id, van_id, employee_id, idempotency_key, locally_posted_at)
    values (v_company_id, p_invoice_id, v_device.id, v_device.assigned_van_id, v_device.assigned_employee_id, p_idempotency_key, now())
    returning * into v_existing;
  end if;

  begin
    perform revalidate_synced_invoice(p_invoice_id, p_device_uid);

    if (select status from sales_invoices where id = p_invoice_id) = 'conflict' then
      update sales_invoice_offline_posting_logs set reconciliation_status = 'conflict' where id = v_existing.id;
      return jsonb_build_object('reconciled', false, 'conflict', true);
    end if;

    v_result := post_sales_invoice(p_invoice_id, p_device_uid, true);

    update sales_invoice_offline_posting_logs set reconciliation_status = 'reconciled', synced_at = now() where id = v_existing.id;
    return v_result || jsonb_build_object('log_id', v_existing.id);
  exception when others then
    update sales_invoice_offline_posting_logs set reconciliation_status = 'reconciliation_failed', reconciliation_error = sqlerrm where id = v_existing.id;
    raise;
  end;
end;
$$;
grant execute on function reconcile_offline_van_posting(uuid, text, text) to authenticated;

alter table sales_invoice_sync_conflicts drop constraint if exists sales_invoice_sync_conflicts_conflict_type_check;
alter table sales_invoice_sync_conflicts add constraint sales_invoice_sync_conflicts_conflict_type_check check (conflict_type in (
  'duplicate_invoice', 'customer_blocked', 'customer_inactive', 'customer_deactivated', 'product_deactivated', 'price_changed',
  'promotion_expired', 'uom_changed', 'tax_rule_changed', 'tax_changed', 'order_already_edited', 'order_already_cancelled', 'order_already_converted',
  'stock_unavailable', 'batch_unavailable', 'serial_already_sold', 'credit_insufficient', 'reservation_expired',
  'device_assignment_changed', 'invoice_already_posted'
));

alter table sales_invoice_sync_conflicts drop constraint if exists sales_invoice_sync_conflicts_resolution_check;
alter table sales_invoice_sync_conflicts add constraint sales_invoice_sync_conflicts_resolution_check check (resolution in (
  'use_server_values', 'keep_local_pending_approval', 'return_to_creator', 'supervisor_decision', 'cancel_local_version',
  'replace_batch', 'replace_serial', 'reduce_quantity_with_approval', 'convert_credit_to_cash_with_approval'
) or resolution is null);

create or replace function revalidate_synced_invoice(p_invoice_id uuid, p_device_uid text default null)
returns integer language plpgsql security definer as $$
declare
  v_invoice sales_invoices%rowtype;
  v_customer customers%rowtype;
  v_device_id uuid;
  v_item record;
  v_price record;
  v_conflict_count integer := 0;
begin
  select * into v_invoice from sales_invoices where id = p_invoice_id and company_id = current_company_id();
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status not in ('sync_pending') then raise exception 'Invoice is not pending sync (status: %)', v_invoice.status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_invoice.company_id and device_uid = p_device_uid;
  end if;

  if v_invoice.posting_status = 'posted' then
    insert into sales_invoice_sync_conflicts (company_id, invoice_id, device_id, conflict_type, conflict_details)
    values (v_invoice.company_id, p_invoice_id, v_device_id, 'invoice_already_posted', '{}');
    v_conflict_count := v_conflict_count + 1;
  end if;

  if v_invoice.customer_id is not null then
    select * into v_customer from customers where id = v_invoice.customer_id;
    if v_customer.status = 'blocked' then
      insert into sales_invoice_sync_conflicts (company_id, invoice_id, device_id, conflict_type, conflict_details)
      values (v_invoice.company_id, p_invoice_id, v_device_id, 'customer_blocked', jsonb_build_object('customer_status', v_customer.status));
      v_conflict_count := v_conflict_count + 1;
    elsif v_customer.status != 'active' then
      insert into sales_invoice_sync_conflicts (company_id, invoice_id, device_id, conflict_type, conflict_details)
      values (v_invoice.company_id, p_invoice_id, v_device_id, 'customer_deactivated', jsonb_build_object('customer_status', v_customer.status));
      v_conflict_count := v_conflict_count + 1;
    end if;
  end if;

  for v_item in select * from sales_invoice_items where invoice_id = p_invoice_id and not is_free_item loop
    if not exists (select 1 from products where id = v_item.product_id and is_active) then
      insert into sales_invoice_sync_conflicts (company_id, invoice_id, device_id, conflict_type, conflict_details)
      values (v_invoice.company_id, p_invoice_id, v_device_id, 'product_deactivated', jsonb_build_object('invoice_item_id', v_item.id, 'product_id', v_item.product_id));
      v_conflict_count := v_conflict_count + 1;
      continue;
    end if;

    if v_item.price_source not in ('override', 'order_approved_price') and v_invoice.customer_id is not null then
      select * into v_price from resolve_customer_price(v_invoice.customer_id, v_item.product_id, v_item.base_quantity);
      if v_price.price != v_item.applied_price then
        insert into sales_invoice_sync_conflicts (company_id, invoice_id, device_id, conflict_type, conflict_details)
        values (v_invoice.company_id, p_invoice_id, v_device_id, 'price_changed', jsonb_build_object(
          'invoice_item_id', v_item.id, 'offline_price', v_item.applied_price, 'current_price', v_price.price, 'difference', v_price.price - v_item.applied_price
        ));
        v_conflict_count := v_conflict_count + 1;
      end if;
    end if;
  end loop;

  perform validate_invoice_stock(p_invoice_id);
  if (select stock_validation_status from sales_invoices where id = p_invoice_id) in ('unavailable', 'partially_available', 'batch_conflict', 'serial_conflict') then
    insert into sales_invoice_sync_conflicts (company_id, invoice_id, device_id, conflict_type, conflict_details)
    values (v_invoice.company_id, p_invoice_id, v_device_id, 'stock_unavailable', jsonb_build_object(
      'stock_validation_status', (select stock_validation_status from sales_invoices where id = p_invoice_id)
    ));
    v_conflict_count := v_conflict_count + 1;
  end if;

  if v_invoice.payment_type in ('credit', 'hybrid') and v_invoice.customer_id is not null then
    perform validate_invoice_credit(p_invoice_id);
    if (select credit_validation_status from sales_invoices where id = p_invoice_id) in ('over_limit', 'blocked') then
      insert into sales_invoice_sync_conflicts (company_id, invoice_id, device_id, conflict_type, conflict_details)
      values (v_invoice.company_id, p_invoice_id, v_device_id, 'credit_insufficient', jsonb_build_object(
        'credit_validation_status', (select credit_validation_status from sales_invoices where id = p_invoice_id)
      ));
      v_conflict_count := v_conflict_count + 1;
    end if;
  end if;

  if v_conflict_count > 0 then
    perform change_sales_invoice_status(p_invoice_id, 'conflict', 'Sync revalidation found conflicts');
  else
    perform change_sales_invoice_status(p_invoice_id, 'pending_validation', 'Synced and revalidated with no conflicts');
  end if;

  return v_conflict_count;
end;
$$;
grant execute on function revalidate_synced_invoice(uuid, text) to authenticated;
