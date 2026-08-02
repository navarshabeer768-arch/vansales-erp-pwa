-- ============================================================================
-- 0089_receipt_printing_permissions_audit.sql
-- Continues 0081-0088.
-- ============================================================================

create table receipt_print_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
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
create index idx_receipt_print_history_receipt on receipt_print_history(receipt_id);

alter table receipt_print_history enable row level security;
create policy receipt_print_history_isolation on receipt_print_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table receipt_print_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  printer_name text,
  printer_type text,
  error_message text not null,
  device_id uuid references devices(id) on delete set null,
  occurred_by uuid references app_users(id),
  occurred_at timestamptz not null default now()
);
create index idx_receipt_print_errors_receipt on receipt_print_errors(receipt_id);

alter table receipt_print_errors enable row level security;
create policy receipt_print_errors_isolation on receipt_print_errors for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function record_receipt_print_error(
  p_receipt_id uuid, p_error_message text, p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_device_id uuid; v_error_id uuid;
begin
  select company_id into v_company_id from receipt_vouchers where id = p_receipt_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  insert into receipt_print_errors (company_id, receipt_id, printer_name, printer_type, error_message, device_id, occurred_by)
  values (v_company_id, p_receipt_id, p_printer_name, p_printer_type, p_error_message, v_device_id, auth.uid())
  returning id into v_error_id;

  return v_error_id;
end;
$$;
grant execute on function record_receipt_print_error(uuid, text, text, text, text) to authenticated;

create or replace function record_receipt_print(
  p_receipt_id uuid, p_paper_size text, p_print_type text default null, p_reprint_reason text default null,
  p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_device_id uuid;
  v_prior_count integer;
  v_type text;
  v_history_id uuid;
begin
  if not has_permission('receipt_vouchers:print_receipt') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from receipt_vouchers where id = p_receipt_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  select count(*) into v_prior_count from receipt_print_history where receipt_id = p_receipt_id;

  if p_print_type is not null then
    v_type := p_print_type;
  else
    v_type := case when v_prior_count = 0 then 'original' else 'reprint' end;
  end if;
  if v_type = 'reprint' and not has_permission('receipt_vouchers:reprint_receipt') then raise exception 'Not permitted to reprint'; end if;

  insert into receipt_print_history (company_id, receipt_id, print_type, paper_size, reprint_count, reprint_reason, printed_by, printer_name, printer_type, device_id)
  values (v_company_id, p_receipt_id, v_type, p_paper_size, greatest(v_prior_count, 0), p_reprint_reason, auth.uid(), p_printer_name, p_printer_type, v_device_id)
  returning id into v_history_id;

  insert into print_logs (company_id, device_id, employee_id, document_type, reference_id, printer_type, copies)
  values (v_company_id, v_device_id, auth.uid(), 'receipt', p_receipt_id,
    case p_paper_size when 'a4' then 'browser_a4' when '58mm' then 'browser_58mm' else 'browser_80mm' end, 1);

  return v_history_id;
end;
$$;
grant execute on function record_receipt_print(uuid, text, text, text, text, text, text) to authenticated;

insert into permissions (module, action, description)
select 'receipt_vouchers', a, 'Receipt vouchers: ' || a
from unnest(array[
  'validate_receipt', 'submit_for_approval', 'approve_receipt', 'reject_receipt', 'return_for_correction',
  'place_on_hold', 'release_hold', 'post_receipt', 'retry_posting', 'reverse_receipt', 'request_reversal',
  'approve_reversal', 'allocate_advance', 'allocate_unallocated_credit', 'verify_cheque', 'deposit_cheque',
  'mark_cheque_cleared', 'mark_cheque_returned', 'replace_returned_cheque', 'verify_bank_transfer',
  'verify_card_payment', 'print_receipt', 'reprint_receipt', 'use_controlled_offline_posting',
  'resolve_offline_conflict', 'view_customer_balance', 'view_reports', 'export_reports'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'receipt_vouchers'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'posted_receipt_allocations', 'customer_advance_balances', 'customer_advance_allocations',
    'customer_unallocated_credits', 'customer_unallocated_allocations', 'receipt_approvals', 'receipt_approval_steps',
    'receipt_approval_history', 'receipt_hold_history', 'cheque_status_history', 'cheque_deposit_batches',
    'cheque_deposit_batch_items', 'cheque_clearance_records', 'cheque_return_records', 'cheque_replacement_links',
    'receipt_reversal_requests', 'receipt_reversals', 'receipt_partial_reversals', 'receipt_duplicate_matches',
    'receipt_posting_history', 'cash_collection_records', 'card_collection_records', 'bank_transfer_collection_records',
    'digital_payment_records'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
