-- ============================================================================
-- 0116_adjustment_offline_printing_permissions_audit.sql
-- Continues 0113-0115.
--
-- Fixes a real pre-existing bug: print_logs.document_type's original
-- CHECK constraint (0033) never included 'sales_return' or 'receipt' —
-- values the Sales Returns (0103) and Receipts (0089) print functions
-- have been inserting since those phases shipped. Extended here with
-- those two plus the three new document types this phase adds.
-- ============================================================================

alter table print_logs drop constraint if exists print_logs_document_type_check;
alter table print_logs add constraint print_logs_document_type_check check (document_type in (
  'loading_slip', 'unload_slip', 'invoice', 'collection_receipt', 'return_receipt',
  'stock_count_report', 'daily_summary', 'customer_statement',
  'sales_return', 'receipt', 'credit_notes', 'debit_notes', 'customer_adjustments'
));

create or replace function revalidate_synced_adjustment(p_document_table text, p_document_id uuid, p_device_uid text default null)
returns integer language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_status text;
  v_posting_status text;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_customer customers%rowtype;
  v_device_id uuid;
  v_conflict_count integer := 0;
begin
  if p_document_table not in ('credit_notes', 'debit_notes', 'customer_adjustments') then
    raise exception 'Unknown document table: %', p_document_table;
  end if;

  execute format('select company_id, status, posting_status, customer_id, original_invoice_id from %I where id = $1', p_document_table)
    into v_company_id, v_status, v_posting_status, v_customer_id, v_invoice_id using p_document_id;
  if v_company_id is null then raise exception 'Document not found'; end if;
  if v_status != 'sync_pending' then raise exception 'Document is not pending sync (status: %)', v_status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid;
  end if;

  if v_posting_status = 'posted' then
    insert into adjustment_sync_conflicts (company_id, document_table, document_id, device_id, conflict_type, conflict_details)
    values (v_company_id, p_document_table, p_document_id, v_device_id, 'duplicate_document', '{}');
    v_conflict_count := v_conflict_count + 1;
  end if;

  select * into v_customer from customers where id = v_customer_id;
  if v_customer.status = 'deleted' then
    insert into adjustment_sync_conflicts (company_id, document_table, document_id, device_id, conflict_type, conflict_details)
    values (v_company_id, p_document_table, p_document_id, v_device_id, 'customer_changed', jsonb_build_object('customer_status', v_customer.status));
    v_conflict_count := v_conflict_count + 1;
  end if;

  if v_invoice_id is not null and not invoice_eligible_for_adjustment(v_invoice_id, v_customer_id) then
    insert into adjustment_sync_conflicts (company_id, document_table, document_id, device_id, conflict_type, conflict_details)
    values (v_company_id, p_document_table, p_document_id, v_device_id, 'invoice_voided', jsonb_build_object('invoice_id', v_invoice_id));
    v_conflict_count := v_conflict_count + 1;
  end if;

  if v_conflict_count > 0 then
    execute format('select change_%s_status($1, $2, $3)',
      case p_document_table when 'credit_notes' then 'credit_note' when 'debit_notes' then 'debit_note' else 'customer_adjustment' end
    ) using p_document_id, 'conflict', 'Sync revalidation found conflicts';
  else
    execute format('select change_%s_status($1, $2, $3)',
      case p_document_table when 'credit_notes' then 'credit_note' when 'debit_notes' then 'debit_note' else 'customer_adjustment' end
    ) using p_document_id, 'pending_validation', 'Synced and revalidated with no conflicts';
  end if;

  return v_conflict_count;
end;
$$;
grant execute on function revalidate_synced_adjustment(text, uuid, text) to authenticated;

create table customer_adjustment_print_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  print_type text not null check (print_type in ('original', 'duplicate', 'reprint')),
  paper_size text not null check (paper_size in ('58mm', '80mm', 'a4', 'pdf')),
  reprint_count integer not null default 0,
  reprint_reason text,
  printed_by uuid references app_users(id),
  printed_at timestamptz not null default now(),
  printer_name text,
  printer_type text check (printer_type in ('bluetooth', 'usb', 'wifi', 'network', 'browser')),
  device_id uuid references devices(id) on delete set null
);
create index idx_customer_adjustment_print_history_document on customer_adjustment_print_history(document_table, document_id);

alter table customer_adjustment_print_history enable row level security;
create policy customer_adjustment_print_history_isolation on customer_adjustment_print_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_adjustment_print_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_table text not null check (document_table in ('credit_notes', 'debit_notes', 'customer_adjustments')),
  document_id uuid not null,
  printer_name text,
  printer_type text,
  error_message text not null,
  device_id uuid references devices(id) on delete set null,
  occurred_by uuid references app_users(id),
  occurred_at timestamptz not null default now()
);
create index idx_customer_adjustment_print_errors_document on customer_adjustment_print_errors(document_table, document_id);

alter table customer_adjustment_print_errors enable row level security;
create policy customer_adjustment_print_errors_isolation on customer_adjustment_print_errors for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function record_adjustment_print_error(
  p_document_table text, p_document_id uuid, p_error_message text, p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid; v_device_id uuid; v_error_id uuid;
begin
  execute format('select company_id from %I where id = $1', p_document_table) into v_company_id using p_document_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  insert into customer_adjustment_print_errors (company_id, document_table, document_id, printer_name, printer_type, error_message, device_id, occurred_by)
  values (v_company_id, p_document_table, p_document_id, p_printer_name, p_printer_type, p_error_message, v_device_id, auth.uid())
  returning id into v_error_id;

  return v_error_id;
end;
$$;
grant execute on function record_adjustment_print_error(text, uuid, text, text, text, text) to authenticated;

create or replace function record_adjustment_print(
  p_document_table text, p_document_id uuid, p_paper_size text, p_print_type text default null, p_reprint_reason text default null,
  p_printer_name text default null, p_printer_type text default null, p_device_uid text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_device_id uuid;
  v_prior_count integer;
  v_type text;
  v_history_id uuid;
begin
  if not has_permission('financial_adjustments:print_documents') then raise exception 'Not permitted'; end if;
  execute format('select company_id from %I where id = $1', p_document_table) into v_company_id using p_document_id;
  if p_device_uid is not null then select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid; end if;

  select count(*) into v_prior_count from customer_adjustment_print_history where document_table = p_document_table and document_id = p_document_id;

  v_type := coalesce(p_print_type, case when v_prior_count = 0 then 'original' else 'reprint' end);

  insert into customer_adjustment_print_history (company_id, document_table, document_id, print_type, paper_size, reprint_count, reprint_reason, printed_by, printer_name, printer_type, device_id)
  values (v_company_id, p_document_table, p_document_id, v_type, p_paper_size, greatest(v_prior_count, 0), p_reprint_reason, auth.uid(), p_printer_name, p_printer_type, v_device_id)
  returning id into v_history_id;

  insert into print_logs (company_id, device_id, employee_id, document_type, reference_id, printer_type, copies)
  values (v_company_id, v_device_id, auth.uid(), p_document_table, p_document_id,
    case p_paper_size when 'a4' then 'browser_a4' when 'pdf' then 'browser_a4' when '58mm' then 'browser_58mm' else 'browser_80mm' end, 1);

  return v_history_id;
end;
$$;
grant execute on function record_adjustment_print(text, uuid, text, text, text, text, text, text) to authenticated;

insert into permissions (module, action, description)
select 'financial_adjustments', a, 'Financial adjustments: ' || a
from unnest(array[
  'approve_credit_note', 'approve_debit_note', 'post_credit_note', 'post_debit_note', 'allocate_credits',
  'allocate_debits', 'reverse_documents', 'print_documents', 'resolve_sync_conflict'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'financial_adjustments'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'financial_adjustment_approvals', 'financial_adjustment_approval_steps', 'customer_adjustment_approval_history',
    'credit_note_postings', 'debit_note_postings', 'customer_adjustment_posting_history', 'debit_note_invoice_links',
    'customer_adjustment_reversals'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
