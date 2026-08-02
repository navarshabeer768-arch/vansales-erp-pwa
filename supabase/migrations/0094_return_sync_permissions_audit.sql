-- ============================================================================
-- 0094_return_sync_permissions_audit.sql
-- Continues 0091-0093.
-- ============================================================================

create table sales_return_sync_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  status text not null default 'local_draft' check (status in (
    'local_draft', 'pending_upload', 'uploading', 'uploaded', 'pending_revalidation',
    'returned_for_correction', 'synced', 'sync_failed', 'conflict'
  )),
  last_error text,
  uploaded_at timestamptz,
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (return_id, device_id)
);

alter table sales_return_sync_status enable row level security;
create policy sales_return_sync_status_isolation on sales_return_sync_status for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function set_return_sync_status(p_return_id uuid, p_device_uid text, p_status text, p_error text default null)
returns void language plpgsql security definer as $$
declare v_company_id uuid; v_device_id uuid;
begin
  select company_id into v_company_id from sales_returns where id = p_return_id;
  select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid;

  insert into sales_return_sync_status (company_id, return_id, device_id, status, last_error, uploaded_at, synced_at)
  values (v_company_id, p_return_id, v_device_id, p_status, p_error,
    case when p_status = 'uploaded' then now() end, case when p_status = 'synced' then now() end)
  on conflict (return_id, device_id) do update set
    status = p_status, last_error = p_error, updated_at = now(),
    uploaded_at = case when p_status = 'uploaded' then now() else sales_return_sync_status.uploaded_at end,
    synced_at = case when p_status = 'synced' then now() else sales_return_sync_status.synced_at end;
end;
$$;
grant execute on function set_return_sync_status(uuid, text, text, text) to authenticated;

create table sales_return_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  conflict_type text not null check (conflict_type in (
    'invoice_voided', 'invoice_reversed', 'quantity_already_returned', 'batch_mismatch', 'serial_already_returned',
    'return_period_expired', 'customer_changed', 'product_deactivated', 'replacement_product_unavailable', 'duplicate_return'
  )),
  conflict_details jsonb not null default '{}',
  resolution text check (resolution in (
    'use_server_values', 'keep_local_pending_approval', 'return_to_creator', 'supervisor_decision', 'cancel_local_version', 'reduce_quantity'
  ) or resolution is null),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detected_at timestamptz not null default now(),
  resolved_by uuid references app_users(id),
  resolved_at timestamptz,
  resolution_notes text
);
create index idx_sales_return_sync_conflicts_return on sales_return_sync_conflicts(return_id);
create index idx_sales_return_sync_conflicts_status on sales_return_sync_conflicts(company_id, status);

alter table sales_return_sync_conflicts enable row level security;
create policy sales_return_sync_conflicts_isolation on sales_return_sync_conflicts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

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

create or replace function resolve_return_sync_conflict(p_conflict_id uuid, p_resolution text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_conflict sales_return_sync_conflicts%rowtype;
begin
  if not has_permission('sales_returns:resolve_sync_conflict') then raise exception 'Not permitted'; end if;
  select * into v_conflict from sales_return_sync_conflicts where id = p_conflict_id;
  if not found then raise exception 'Conflict not found'; end if;

  update sales_return_sync_conflicts set
    resolution = p_resolution, status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_notes = p_notes
  where id = p_conflict_id;

  if p_resolution = 'cancel_local_version' then
    perform cancel_return_draft(v_conflict.return_id, 'Sync conflict resolved by cancelling local version', p_notes);
  elsif p_resolution = 'return_to_creator' then
    perform change_return_status(v_conflict.return_id, 'draft', 'Returned to creator to resolve sync conflict');
  end if;

  if not exists (select 1 from sales_return_sync_conflicts where return_id = v_conflict.return_id and status = 'open') then
    if (select status from sales_returns where id = v_conflict.return_id) = 'conflict' then
      perform change_return_status(v_conflict.return_id, 'pending_validation', 'All sync conflicts resolved');
    end if;
  end if;
end;
$$;
grant execute on function resolve_return_sync_conflict(uuid, text, text) to authenticated;

create table sales_return_duplicate_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  return_id uuid not null references sales_returns(id) on delete cascade,
  matched_return_id uuid references sales_returns(id) on delete set null,
  matched_on text not null,
  decision text not null check (decision in ('confirmed_legitimate', 'cancelled_as_duplicate')),
  decided_by uuid references app_users(id),
  decided_at timestamptz not null default now(),
  notes text
);
create index idx_sales_return_duplicate_matches_return on sales_return_duplicate_matches(return_id);

alter table sales_return_duplicate_matches enable row level security;
create policy sales_return_duplicate_matches_isolation on sales_return_duplicate_matches for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function record_return_duplicate_decision(
  p_return_id uuid, p_matched_return_id uuid, p_matched_on text, p_decision text, p_notes text default null
) returns uuid language plpgsql security definer as $$
declare v_company_id uuid := current_company_id(); v_id uuid;
begin
  insert into sales_return_duplicate_matches (company_id, return_id, matched_return_id, matched_on, decision, decided_by, notes)
  values (v_company_id, p_return_id, p_matched_return_id, p_matched_on, p_decision, auth.uid(), p_notes)
  returning id into v_id;

  if p_decision = 'cancelled_as_duplicate' then
    perform cancel_return_draft(p_return_id, 'Confirmed duplicate of ' || coalesce((select return_number from sales_returns where id = p_matched_return_id), 'another return'), p_notes);
  end if;

  return v_id;
end;
$$;
grant execute on function record_return_duplicate_decision(uuid, uuid, text, text, text) to authenticated;

insert into permissions (module, action, description)
select 'sales_returns', a, 'Sales returns: ' || a
from unnest(array[
  'view', 'create', 'create_return_from_invoice', 'create_return_without_invoice', 'create_damaged_return',
  'create_expired_return', 'create_replacement_request', 'edit_return_draft', 'cancel_return_draft',
  'delete_unsynced_draft', 'view_invoice_history', 'view_returnable_quantity', 'select_batch', 'select_serial',
  'override_return_period', 'request_value_override', 'create_from_visit', 'create_without_visit',
  'view_reports', 'export_reports', 'resolve_sync_conflict'
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
    'sales_returns', 'sales_return_items', 'sales_return_item_batches', 'sales_return_item_serials',
    'sales_return_replacement_requests', 'sales_return_value_override_requests', 'sales_return_sync_conflicts',
    'sales_return_duplicate_matches'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
