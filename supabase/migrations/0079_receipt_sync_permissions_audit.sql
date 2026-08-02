-- ============================================================================
-- 0079_receipt_sync_permissions_audit.sql
-- Continues 0076-0078.
-- ============================================================================

create table receipt_sync_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  status text not null default 'local_draft' check (status in (
    'local_draft', 'pending_upload', 'uploading', 'uploaded', 'pending_revalidation',
    'returned_for_correction', 'synced', 'sync_failed', 'conflict'
  )),
  last_error text,
  uploaded_at timestamptz,
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (receipt_id, device_id)
);

alter table receipt_sync_status enable row level security;
create policy receipt_sync_status_isolation on receipt_sync_status for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function set_receipt_sync_status(p_receipt_id uuid, p_device_uid text, p_status text, p_error text default null)
returns void language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_device_id uuid;
begin
  select company_id into v_company_id from receipt_vouchers where id = p_receipt_id;
  select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid;

  insert into receipt_sync_status (company_id, receipt_id, device_id, status, last_error, uploaded_at, synced_at)
  values (v_company_id, p_receipt_id, v_device_id, p_status, p_error,
    case when p_status = 'uploaded' then now() end, case when p_status = 'synced' then now() end)
  on conflict (receipt_id, device_id) do update set
    status = p_status, last_error = p_error, updated_at = now(),
    uploaded_at = case when p_status = 'uploaded' then now() else receipt_sync_status.uploaded_at end,
    synced_at = case when p_status = 'synced' then now() else receipt_sync_status.synced_at end;
end;
$$;
grant execute on function set_receipt_sync_status(uuid, text, text, text) to authenticated;

create table receipt_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  conflict_type text not null check (conflict_type in (
    'duplicate_receipt', 'customer_blocked', 'customer_inactive', 'invoice_already_settled',
    'invoice_outstanding_changed', 'invoice_voided', 'over_allocation', 'device_assignment_changed'
  )),
  conflict_details jsonb not null default '{}',
  resolution text check (resolution in (
    'use_server_values', 'keep_local_pending_approval', 'return_to_creator', 'supervisor_decision', 'cancel_local_version', 'reduce_allocation'
  ) or resolution is null),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detected_at timestamptz not null default now(),
  resolved_by uuid references app_users(id),
  resolved_at timestamptz,
  resolution_notes text
);
create index idx_receipt_sync_conflicts_receipt on receipt_sync_conflicts(receipt_id);
create index idx_receipt_sync_conflicts_status on receipt_sync_conflicts(company_id, status);

alter table receipt_sync_conflicts enable row level security;
create policy receipt_sync_conflicts_isolation on receipt_sync_conflicts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function revalidate_synced_receipt(p_receipt_id uuid, p_device_uid text default null)
returns integer language plpgsql security definer as $$
declare
  v_receipt receipt_vouchers%rowtype;
  v_customer customers%rowtype;
  v_device_id uuid;
  v_alloc record;
  v_current_outstanding numeric;
  v_conflict_count integer := 0;
begin
  select * into v_receipt from receipt_vouchers where id = p_receipt_id and company_id = current_company_id();
  if not found then raise exception 'Receipt not found'; end if;
  if v_receipt.status != 'sync_pending' then raise exception 'Receipt is not pending sync (status: %)', v_receipt.status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_receipt.company_id and device_uid = p_device_uid;
  end if;

  select * into v_customer from customers where id = v_receipt.customer_id;
  if v_customer.status = 'deleted' then
    insert into receipt_sync_conflicts (company_id, receipt_id, device_id, conflict_type, conflict_details)
    values (v_receipt.company_id, p_receipt_id, v_device_id, 'customer_inactive', jsonb_build_object('customer_status', v_customer.status));
    v_conflict_count := v_conflict_count + 1;
  end if;

  for v_alloc in select * from receipt_invoice_allocations where receipt_id = p_receipt_id and status = 'active' loop
    select net_amount - invoice_allocated_amount(id) + v_alloc.allocated_amount into v_current_outstanding
    from sales_invoices where id = v_alloc.invoice_id;

    if not exists (select 1 from sales_invoices where id = v_alloc.invoice_id and posting_status = 'posted' and status not in ('void_requested', 'voided')) then
      insert into receipt_sync_conflicts (company_id, receipt_id, device_id, conflict_type, conflict_details)
      values (v_receipt.company_id, p_receipt_id, v_device_id, 'invoice_voided', jsonb_build_object('invoice_id', v_alloc.invoice_id));
      v_conflict_count := v_conflict_count + 1;
    elsif v_current_outstanding < v_alloc.allocated_amount - 0.001 then
      insert into receipt_sync_conflicts (company_id, receipt_id, device_id, conflict_type, conflict_details)
      values (v_receipt.company_id, p_receipt_id, v_device_id, 'invoice_outstanding_changed', jsonb_build_object(
        'invoice_id', v_alloc.invoice_id, 'allocated', v_alloc.allocated_amount, 'current_outstanding', v_current_outstanding
      ));
      v_conflict_count := v_conflict_count + 1;
    end if;
  end loop;

  if v_conflict_count > 0 then
    perform change_receipt_status(p_receipt_id, 'conflict', 'Sync revalidation found conflicts');
  else
    perform change_receipt_status(p_receipt_id, 'submitted', 'Synced and revalidated with no conflicts');
  end if;

  return v_conflict_count;
end;
$$;
grant execute on function revalidate_synced_receipt(uuid, text) to authenticated;

create or replace function resolve_receipt_sync_conflict(p_conflict_id uuid, p_resolution text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_conflict receipt_sync_conflicts%rowtype;
begin
  if not has_permission('receipt_vouchers:resolve_sync_conflict') then raise exception 'Not permitted'; end if;
  select * into v_conflict from receipt_sync_conflicts where id = p_conflict_id;
  if not found then raise exception 'Conflict not found'; end if;

  update receipt_sync_conflicts set
    resolution = p_resolution, status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_notes = p_notes
  where id = p_conflict_id;

  if p_resolution = 'cancel_local_version' then
    perform cancel_receipt_draft(v_conflict.receipt_id, 'Sync conflict resolved by cancelling local version', p_notes);
  elsif p_resolution = 'return_to_creator' then
    perform change_receipt_status(v_conflict.receipt_id, 'draft', 'Returned to creator to resolve sync conflict');
  end if;

  if not exists (select 1 from receipt_sync_conflicts where receipt_id = v_conflict.receipt_id and status = 'open') then
    if (select status from receipt_vouchers where id = v_conflict.receipt_id) = 'conflict' then
      perform change_receipt_status(v_conflict.receipt_id, 'submitted', 'All sync conflicts resolved');
    end if;
  end if;
end;
$$;
grant execute on function resolve_receipt_sync_conflict(uuid, text, text) to authenticated;

insert into permissions (module, action, description)
select 'receipt_vouchers', a, 'Receipt vouchers: ' || a
from unnest(array[
  'view', 'create', 'create_customer_collection', 'create_advance_payment_draft', 'create_unallocated_receipt_draft',
  'create_cash_collection_draft', 'create_card_collection_draft', 'create_bank_transfer_draft', 'create_cheque_collection_draft',
  'create_mixed_payment_draft', 'allocate_invoice', 'use_automatic_allocation', 'edit_draft', 'cancel_draft',
  'delete_unsynced_draft', 'view_customer_outstanding', 'view_customer_credit_details', 'create_from_visit',
  'create_without_visit', 'create_payment_promise', 'view_reports', 'export_reports', 'resolve_sync_conflict'
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
    'receipt_vouchers', 'receipt_payment_components', 'receipt_invoice_allocations', 'receipt_advance_details',
    'receipt_unallocated_details', 'cheque_receipt_details', 'card_receipt_details', 'bank_transfer_receipt_details',
    'wallet_receipt_details', 'payment_promises', 'receipt_sync_conflicts'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
