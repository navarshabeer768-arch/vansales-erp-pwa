-- ============================================================================
-- 0103_return_offline_printing_permissions_audit.sql
-- Continues 0096-0102.
-- ============================================================================

alter table sales_return_sync_conflicts drop constraint if exists sales_return_sync_conflicts_conflict_type_check;
alter table sales_return_sync_conflicts add constraint sales_return_sync_conflicts_conflict_type_check check (conflict_type in (
  'invoice_voided', 'invoice_reversed', 'quantity_already_returned', 'batch_mismatch', 'serial_already_returned',
  'return_period_expired', 'customer_changed', 'product_deactivated', 'replacement_product_unavailable', 'duplicate_return',
  'return_already_posted', 'inspection_requirement_changed', 'approval_rule_changed', 'credit_eligibility_changed'
));

create or replace function revalidate_synced_return(p_return_id uuid, p_device_uid text default null)
returns integer language plpgsql security definer as $$
declare
  v_return sales_returns%rowtype;
  v_customer customers%rowtype;
  v_device_id uuid;
  v_item record;
  v_current_remaining numeric;
  v_conflict_count integer := 0;
begin
  select * into v_return from sales_returns where id = p_return_id and company_id = current_company_id();
  if not found then raise exception 'Return not found'; end if;
  if v_return.status not in ('sync_pending') then raise exception 'Return is not pending sync (status: %)', v_return.status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_return.company_id and device_uid = p_device_uid;
  end if;

  if v_return.posting_status = 'posted' then
    insert into sales_return_sync_conflicts (company_id, return_id, device_id, conflict_type, conflict_details)
    values (v_return.company_id, p_return_id, v_device_id, 'return_already_posted', '{}');
    v_conflict_count := v_conflict_count + 1;
  end if;

  select * into v_customer from customers where id = v_return.customer_id;
  if v_customer.status = 'deleted' then
    insert into sales_return_sync_conflicts (company_id, return_id, device_id, conflict_type, conflict_details)
    values (v_return.company_id, p_return_id, v_device_id, 'customer_changed', jsonb_build_object('customer_status', v_customer.status));
    v_conflict_count := v_conflict_count + 1;
  end if;

  if v_return.original_invoice_id is not null and not invoice_eligible_for_return(v_return.original_invoice_id, v_return.customer_id) then
    insert into sales_return_sync_conflicts (company_id, return_id, device_id, conflict_type, conflict_details)
    values (v_return.company_id, p_return_id, v_device_id, 'invoice_voided', jsonb_build_object('invoice_id', v_return.original_invoice_id));
    v_conflict_count := v_conflict_count + 1;
  end if;

  for v_item in select * from sales_return_items where return_id = p_return_id and item_status = 'active' and original_invoice_item_id is not null loop
    select base_quantity - invoice_item_returned_quantity(id) + v_item.base_return_quantity into v_current_remaining
    from sales_invoice_items where id = v_item.original_invoice_item_id;

    if v_current_remaining < v_item.base_return_quantity - 0.001 then
      insert into sales_return_sync_conflicts (company_id, return_id, device_id, conflict_type, conflict_details)
      values (v_return.company_id, p_return_id, v_device_id, 'quantity_already_returned', jsonb_build_object(
        'return_item_id', v_item.id, 'requested', v_item.base_return_quantity, 'current_remaining', v_current_remaining
      ));
      v_conflict_count := v_conflict_count + 1;
    end if;

    if v_item.serial_required and exists (
      select 1 from sales_return_item_serials srs where srs.return_item_id = v_item.id
      and exists (select 1 from product_serials ps where ps.id = srs.serial_id and ps.status = 'returned')
    ) then
      insert into sales_return_sync_conflicts (company_id, return_id, device_id, conflict_type, conflict_details)
      values (v_return.company_id, p_return_id, v_device_id, 'serial_already_returned', jsonb_build_object('return_item_id', v_item.id));
      v_conflict_count := v_conflict_count + 1;
    end if;
  end loop;

  if v_conflict_count > 0 then
    perform change_return_status(p_return_id, 'conflict', 'Sync revalidation found conflicts');
  else
    perform change_return_status(p_return_id, 'pending_validation', 'Synced and revalidated with no conflicts');
  end if;

  return v_conflict_count;
end;
$$;
grant execute on function revalidate_synced_return(uuid, text) to authenticated;

create table sales_return_offline_acceptance_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  employee_id uuid references app_users(id) on delete set null,
  idempotency_key text not null,
  locally_accepted_at timestamptz,
  synced_at timestamptz,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'reconciled', 'reconciliation_failed', 'conflict')),
  reconciliation_error text,
  unique (company_id, idempotency_key)
);
create index idx_sales_return_offline_acceptance_logs_return on sales_return_offline_acceptance_logs(return_id);

alter table sales_return_offline_acceptance_logs enable row level security;
create policy sales_return_offline_acceptance_logs_isolation on sales_return_offline_acceptance_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function check_return_offline_acceptance_eligibility(p_device_uid text)
returns table (eligible boolean, reason text, van_id uuid, employee_id uuid) language plpgsql stable as $$
declare v_device devices%rowtype;
begin
  select * into v_device from devices where company_id = current_company_id() and device_uid = p_device_uid;
  if not found then return query select false, 'Device not registered', null::uuid, null::uuid; return; end if;
  if v_device.status != 'active' then return query select false, format('Device is %s', v_device.status), null::uuid, null::uuid; return; end if;
  if v_device.assigned_van_id is null then return query select false, 'Device has no assigned van — offline acceptance requires exclusive van custody', null::uuid, null::uuid; return; end if;
  if v_device.assigned_employee_id is null then return query select false, 'Device has no assigned employee', v_device.assigned_van_id, null::uuid; return; end if;
  return query select true, 'Eligible'::text, v_device.assigned_van_id, v_device.assigned_employee_id;
end;
$$;
grant execute on function check_return_offline_acceptance_eligibility(text) to authenticated;

create table sales_return_print_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  print_type text not null check (print_type in ('original', 'duplicate', 'reprint')),
  paper_size text not null check (paper_size in ('58mm', '80mm', 'a4')),
  reprint_count integer not null default 0,
  reprint_reason text,
  printed_by uuid references app_users(id),
  printed_at timestamptz not null default now(),
  printer_name text,
  printer_type text check (printer_type in ('bluetooth', 'usb', 'wifi', 'network', 'browser')),
  device_id uuid references devices(id) on delete set null
);
create index idx_sales_return_print_history_return on sales_return_print_history(return_id);

alter table sales_return_print_history enable row level security;
create policy sales_return_print_history_isolation on sales_return_print_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_return_print_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  printer_name text,
  printer_type text,
  error_message text not null,
  device_id uuid references devices(id) on delete set null,
  occurred_by uuid references app_users(id),
  occurred_at timestamptz not null default now()
);
create index idx_sales_return_print_errors_return on sales_return_print_errors(return_id);

alter table sales_return_print_errors enable row level security;
create policy sales_return_print_errors_isolation on sales_return_print_errors for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function record_return_print_error(
  p_return_id uuid, p_error_message text, p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_device_id uuid; v_error_id uuid;
begin
  select company_id into v_company_id from sales_returns where id = p_return_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  insert into sales_return_print_errors (company_id, return_id, printer_name, printer_type, error_message, device_id, occurred_by)
  values (v_company_id, p_return_id, p_printer_name, p_printer_type, p_error_message, v_device_id, auth.uid())
  returning id into v_error_id;

  return v_error_id;
end;
$$;
grant execute on function record_return_print_error(uuid, text, text, text, text) to authenticated;

create or replace function record_return_print(
  p_return_id uuid, p_paper_size text, p_print_type text default null, p_reprint_reason text default null,
  p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_device_id uuid;
  v_prior_count integer;
  v_type text;
  v_history_id uuid;
begin
  if not has_permission('sales_returns:print_return_voucher') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from sales_returns where id = p_return_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  select count(*) into v_prior_count from sales_return_print_history where return_id = p_return_id;

  if p_print_type is not null then
    v_type := p_print_type;
  else
    v_type := case when v_prior_count = 0 then 'original' else 'reprint' end;
  end if;
  if v_type = 'reprint' and not has_permission('sales_returns:reprint_return_voucher') then raise exception 'Not permitted to reprint'; end if;

  insert into sales_return_print_history (company_id, return_id, print_type, paper_size, reprint_count, reprint_reason, printed_by, printer_name, printer_type, device_id)
  values (v_company_id, p_return_id, v_type, p_paper_size, greatest(v_prior_count, 0), p_reprint_reason, auth.uid(), p_printer_name, p_printer_type, v_device_id)
  returning id into v_history_id;

  insert into print_logs (company_id, device_id, employee_id, document_type, reference_id, printer_type, copies)
  values (v_company_id, v_device_id, auth.uid(), 'sales_return', p_return_id,
    case p_paper_size when 'a4' then 'browser_a4' when '58mm' then 'browser_58mm' else 'browser_80mm' end, 1);

  return v_history_id;
end;
$$;
grant execute on function record_return_print(uuid, text, text, text, text, text, text) to authenticated;

insert into permissions (module, action, description)
select 'sales_returns', a, 'Sales returns: ' || a
from unnest(array[
  'validate_return', 'submit_for_approval', 'approve_return', 'reject_return', 'return_for_correction',
  'place_on_hold', 'release_hold', 'inspect_return', 'select_stock_destination', 'restock_saleable_goods',
  'post_damaged_return', 'post_expired_return', 'post_quarantine_return', 'override_batch_mismatch',
  'override_serial_mismatch', 'post_return', 'retry_posting', 'generate_credit_note', 'approve_credit_note',
  'create_cash_refund_request', 'approve_replacement', 'create_replacement_order', 'create_replacement_invoice_draft',
  'request_reversal', 'approve_return_reversal', 'use_controlled_offline_acceptance', 'resolve_offline_conflict',
  'print_return_voucher', 'reprint_return_voucher', 'view_customer_balance_impact', 'view_cost', 'view_reports', 'export_reports'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'sales_returns'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'sales_return_inspections', 'sales_return_inspection_items', 'sales_return_approvals', 'sales_return_approval_steps',
    'sales_return_approval_history', 'sales_return_hold_history', 'sales_return_stock_postings', 'sales_return_posting_history',
    'sales_return_credit_adjustments', 'sales_return_credit_notes', 'sales_return_credit_note_allocations',
    'sales_return_cash_refund_requests', 'sales_return_replacement_orders', 'sales_return_cancellations',
    'sales_return_reversal_requests', 'sales_return_reversals', 'sales_return_partial_reversals'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
