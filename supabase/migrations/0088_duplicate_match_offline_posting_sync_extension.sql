-- ============================================================================
-- 0088_duplicate_match_offline_posting_sync_extension.sql
-- Continues 0081-0087.
-- ============================================================================

create table receipt_duplicate_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  matched_receipt_id uuid references receipt_vouchers(id) on delete set null,
  matched_on text not null,
  decision text not null check (decision in ('confirmed_legitimate', 'cancelled_as_duplicate')),
  decided_by uuid references app_users(id),
  decided_at timestamptz not null default now(),
  notes text
);
create index idx_receipt_duplicate_matches_receipt on receipt_duplicate_matches(receipt_id);

alter table receipt_duplicate_matches enable row level security;
create policy receipt_duplicate_matches_isolation on receipt_duplicate_matches for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function record_duplicate_payment_decision(
  p_receipt_id uuid, p_matched_receipt_id uuid, p_matched_on text, p_decision text, p_notes text default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid := current_company_id(); v_id uuid;
begin
  insert into receipt_duplicate_matches (company_id, receipt_id, matched_receipt_id, matched_on, decision, decided_by, notes)
  values (v_company_id, p_receipt_id, p_matched_receipt_id, p_matched_on, p_decision, auth.uid(), p_notes)
  returning id into v_id;

  if p_decision = 'cancelled_as_duplicate' then
    perform cancel_receipt_draft(p_receipt_id, 'Confirmed duplicate of ' || coalesce((select receipt_number from receipt_vouchers where id = p_matched_receipt_id), 'another receipt'), p_notes);
  end if;

  return v_id;
end;
$$;
grant execute on function record_duplicate_payment_decision(uuid, uuid, text, text, text) to authenticated;

create table receipt_offline_posting_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  receipt_id uuid not null references receipt_vouchers(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  employee_id uuid references app_users(id) on delete set null,
  idempotency_key text not null,
  locally_posted_at timestamptz,
  synced_at timestamptz,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending', 'reconciled', 'reconciliation_failed', 'conflict')),
  reconciliation_error text,
  unique (company_id, idempotency_key)
);
create index idx_receipt_offline_posting_logs_receipt on receipt_offline_posting_logs(receipt_id);

alter table receipt_offline_posting_logs enable row level security;
create policy receipt_offline_posting_logs_isolation on receipt_offline_posting_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function check_receipt_offline_posting_eligibility(p_device_uid text)
returns table (eligible boolean, reason text, van_id uuid, employee_id uuid) language plpgsql stable as $$
declare v_device devices%rowtype;
begin
  select * into v_device from devices where company_id = current_company_id() and device_uid = p_device_uid;
  if not found then return query select false, 'Device not registered', null::uuid, null::uuid; return; end if;
  if v_device.status != 'active' then return query select false, format('Device is %s', v_device.status), null::uuid, null::uuid; return; end if;
  if v_device.assigned_employee_id is null then return query select false, 'Device has no assigned employee', v_device.assigned_van_id, null::uuid; return; end if;
  return query select true, 'Eligible'::text, v_device.assigned_van_id, v_device.assigned_employee_id;
end;
$$;
grant execute on function check_receipt_offline_posting_eligibility(text) to authenticated;

create or replace function reconcile_offline_receipt_posting(p_receipt_id uuid, p_device_uid text, p_idempotency_key text)
returns jsonb language plpgsql security definer as $$
declare
  v_device devices%rowtype;
  v_existing receipt_offline_posting_logs%rowtype;
  v_company_id uuid;
  v_result jsonb;
begin
  select company_id into v_company_id from receipt_vouchers where id = p_receipt_id;
  select * into v_existing from receipt_offline_posting_logs where company_id = v_company_id and idempotency_key = p_idempotency_key;
  if v_existing.id is not null and v_existing.reconciliation_status = 'reconciled' then
    return jsonb_build_object('already_reconciled', true, 'log_id', v_existing.id);
  end if;

  select * into v_device from devices where company_id = v_company_id and device_uid = p_device_uid;

  if v_existing.id is null then
    insert into receipt_offline_posting_logs (company_id, receipt_id, device_id, van_id, employee_id, idempotency_key, locally_posted_at)
    values (v_company_id, p_receipt_id, v_device.id, v_device.assigned_van_id, v_device.assigned_employee_id, p_idempotency_key, now())
    returning * into v_existing;
  end if;

  begin
    perform revalidate_synced_receipt(p_receipt_id, p_device_uid);

    if (select status from receipt_vouchers where id = p_receipt_id) = 'conflict' then
      update receipt_offline_posting_logs set reconciliation_status = 'conflict' where id = v_existing.id;
      return jsonb_build_object('reconciled', false, 'conflict', true);
    end if;

    v_result := post_receipt(p_receipt_id, p_device_uid, true);

    update receipt_offline_posting_logs set reconciliation_status = 'reconciled', synced_at = now() where id = v_existing.id;
    return v_result || jsonb_build_object('log_id', v_existing.id);
  exception when others then
    update receipt_offline_posting_logs set reconciliation_status = 'reconciliation_failed', reconciliation_error = sqlerrm where id = v_existing.id;
    raise;
  end;
end;
$$;
grant execute on function reconcile_offline_receipt_posting(uuid, text, text) to authenticated;

alter table receipt_sync_conflicts drop constraint if exists receipt_sync_conflicts_conflict_type_check;
alter table receipt_sync_conflicts add constraint receipt_sync_conflicts_conflict_type_check check (conflict_type in (
  'duplicate_receipt', 'customer_blocked', 'customer_inactive', 'invoice_already_settled',
  'invoice_outstanding_changed', 'invoice_voided', 'over_allocation', 'device_assignment_changed',
  'receipt_already_posted', 'cheque_already_processed', 'approval_rule_changed'
));

alter table receipt_sync_conflicts drop constraint if exists receipt_sync_conflicts_resolution_check;
alter table receipt_sync_conflicts add constraint receipt_sync_conflicts_resolution_check check (resolution in (
  'use_server_values', 'keep_local_pending_approval', 'return_to_creator', 'supervisor_decision', 'cancel_local_version',
  'reduce_allocation', 'reallocate_to_available_invoices'
) or resolution is null);

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
  if v_receipt.status not in ('sync_pending') then raise exception 'Receipt is not pending sync (status: %)', v_receipt.status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_receipt.company_id and device_uid = p_device_uid;
  end if;

  if v_receipt.posting_status = 'posted' then
    insert into receipt_sync_conflicts (company_id, receipt_id, device_id, conflict_type, conflict_details)
    values (v_receipt.company_id, p_receipt_id, v_device_id, 'receipt_already_posted', '{}');
    v_conflict_count := v_conflict_count + 1;
  end if;

  select * into v_customer from customers where id = v_receipt.customer_id;
  if v_customer.status = 'deleted' then
    insert into receipt_sync_conflicts (company_id, receipt_id, device_id, conflict_type, conflict_details)
    values (v_receipt.company_id, p_receipt_id, v_device_id, 'customer_inactive', jsonb_build_object('customer_status', v_customer.status));
    v_conflict_count := v_conflict_count + 1;
  end if;

  for v_alloc in select * from receipt_invoice_allocations where receipt_id = p_receipt_id and status = 'active' loop
    if not exists (select 1 from sales_invoices where id = v_alloc.invoice_id and posting_status = 'posted' and status not in ('void_requested', 'voided')) then
      insert into receipt_sync_conflicts (company_id, receipt_id, device_id, conflict_type, conflict_details)
      values (v_receipt.company_id, p_receipt_id, v_device_id, 'invoice_voided', jsonb_build_object('invoice_id', v_alloc.invoice_id));
      v_conflict_count := v_conflict_count + 1;
      continue;
    end if;

    select net_amount - invoice_allocated_amount(id) + v_alloc.allocated_amount into v_current_outstanding
    from sales_invoices where id = v_alloc.invoice_id;

    if v_current_outstanding < v_alloc.allocated_amount - 0.001 then
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
    perform change_receipt_status(p_receipt_id, 'pending_validation', 'Synced and revalidated with no conflicts');
  end if;

  return v_conflict_count;
end;
$$;
grant execute on function revalidate_synced_receipt(uuid, text) to authenticated;
