-- ============================================================================
-- 0111_adjustment_offline_permissions_audit.sql
-- Continues 0105-0110.
-- ============================================================================

create or replace function set_adjustment_sync_status(p_document_table text, p_document_id uuid, p_device_uid text, p_status text, p_error text default null)
returns void language plpgsql security definer as $$
declare v_company_id uuid; v_device_id uuid;
begin
  execute format('select company_id from %I where id = $1', p_document_table) into v_company_id using p_document_id;
  select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid;

  insert into adjustment_sync_status (company_id, document_table, document_id, device_id, status, last_error, uploaded_at, synced_at)
  values (v_company_id, p_document_table, p_document_id, v_device_id, p_status, p_error,
    case when p_status = 'uploaded' then now() end, case when p_status = 'synced' then now() end)
  on conflict (document_table, document_id, device_id) do update set
    status = p_status, last_error = p_error, updated_at = now(),
    uploaded_at = case when p_status = 'uploaded' then now() else adjustment_sync_status.uploaded_at end,
    synced_at = case when p_status = 'synced' then now() else adjustment_sync_status.synced_at end;
end;
$$;
grant execute on function set_adjustment_sync_status(text, uuid, text, text, text) to authenticated;

create or replace function revalidate_synced_adjustment(p_document_table text, p_document_id uuid, p_device_uid text default null)
returns integer language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_status text;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_customer customers%rowtype;
  v_device_id uuid;
  v_conflict_count integer := 0;
begin
  if p_document_table not in ('credit_notes', 'debit_notes', 'customer_adjustments') then
    raise exception 'Unknown document table: %', p_document_table;
  end if;

  execute format('select company_id, status, customer_id, original_invoice_id from %I where id = $1', p_document_table)
    into v_company_id, v_status, v_customer_id, v_invoice_id using p_document_id;
  if v_company_id is null then raise exception 'Document not found'; end if;
  if v_status != 'sync_pending' then raise exception 'Document is not pending sync (status: %)', v_status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid;
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

create or replace function resolve_adjustment_sync_conflict(p_conflict_id uuid, p_resolution text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_conflict adjustment_sync_conflicts%rowtype; v_status_fn text;
begin
  if not has_permission('financial_adjustments:resolve_sync_conflict') then raise exception 'Not permitted'; end if;
  select * into v_conflict from adjustment_sync_conflicts where id = p_conflict_id;
  if not found then raise exception 'Conflict not found'; end if;

  update adjustment_sync_conflicts set
    resolution = p_resolution, status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_notes = p_notes
  where id = p_conflict_id;

  v_status_fn := case v_conflict.document_table when 'credit_notes' then 'change_credit_note_status' when 'debit_notes' then 'change_debit_note_status' else 'change_customer_adjustment_status' end;

  if p_resolution = 'cancel_local_version' then
    execute format('select %s($1, $2, $3)', v_status_fn) using v_conflict.document_id, 'cancelled', 'Sync conflict resolved by cancelling local version';
  elsif p_resolution = 'return_to_creator' then
    execute format('select %s($1, $2, $3)', v_status_fn) using v_conflict.document_id, 'draft', 'Returned to creator to resolve sync conflict';
  end if;

  if not exists (select 1 from adjustment_sync_conflicts where document_table = v_conflict.document_table and document_id = v_conflict.document_id and status = 'open') then
    execute format('select %s($1, $2, $3)', v_status_fn) using v_conflict.document_id, 'pending_validation', 'All sync conflicts resolved';
  end if;
end;
$$;
grant execute on function resolve_adjustment_sync_conflict(uuid, text, text) to authenticated;

insert into permissions (module, action, description)
select 'financial_adjustments', a, 'Financial adjustments: ' || a
from unnest(array[
  'view', 'create_credit_note', 'create_debit_note', 'create_adjustment', 'edit_draft', 'cancel_draft',
  'view_reports', 'export_reports', 'mobile_entry', 'offline_entry', 'resolve_sync_conflict'
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
    'credit_notes', 'credit_note_items', 'debit_notes', 'debit_note_items',
    'customer_adjustments', 'customer_adjustment_items', 'adjustment_sync_conflicts'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
