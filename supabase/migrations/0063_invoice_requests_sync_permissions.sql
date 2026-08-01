-- ============================================================================
-- 0063_invoice_requests_sync_permissions.sql
-- Continues 0059-0062.
-- ============================================================================

create table sales_invoice_price_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  invoice_item_id uuid not null references sales_invoice_items(id) on delete cascade,
  original_price numeric(12,2) not null,
  current_price numeric(12,2) not null,
  requested_price numeric(12,2) not null,
  reason text,
  requested_by uuid references app_users(id),
  request_time timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);
create index idx_sales_invoice_price_requests_invoice on sales_invoice_price_requests(invoice_id);

alter table sales_invoice_price_requests enable row level security;
create policy sales_invoice_price_requests_isolation on sales_invoice_price_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_discount_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  invoice_item_id uuid references sales_invoice_items(id) on delete cascade,
  requested_discount_pct numeric(5,2),
  requested_discount_amount numeric(12,2),
  allowed_discount_pct numeric(5,2),
  difference_pct numeric(5,2),
  reason text,
  requested_by uuid references app_users(id),
  request_time timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);
create index idx_sales_invoice_discount_requests_invoice on sales_invoice_discount_requests(invoice_id);

alter table sales_invoice_discount_requests enable row level security;
create policy sales_invoice_discount_requests_isolation on sales_invoice_discount_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_invoice_free_quantity_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  invoice_item_id uuid references sales_invoice_items(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  requested_free_quantity numeric(12,3) not null,
  scheme_free_quantity numeric(12,3) not null default 0,
  additional_free_quantity numeric(12,3) not null default 0,
  reason text,
  requested_by uuid references app_users(id),
  request_time timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);
create index idx_sales_invoice_free_quantity_requests_invoice on sales_invoice_free_quantity_requests(invoice_id);

alter table sales_invoice_free_quantity_requests enable row level security;
create policy sales_invoice_free_quantity_requests_isolation on sales_invoice_free_quantity_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function request_invoice_price_override(p_invoice_item_id uuid, p_requested_price numeric, p_reason text)
returns uuid language plpgsql security definer as $$
declare
  v_item sales_invoice_items%rowtype;
  v_invoice sales_invoices%rowtype;
  v_request_id uuid;
begin
  if not has_permission('sales_invoices:request_price_override') then raise exception 'Not permitted'; end if;
  select * into v_item from sales_invoice_items where id = p_invoice_item_id;
  if not found then raise exception 'Invoice item not found'; end if;
  select * into v_invoice from sales_invoices where id = v_item.invoice_id;

  insert into sales_invoice_price_requests (company_id, invoice_id, invoice_item_id, original_price, current_price, requested_price, reason, requested_by)
  values (v_invoice.company_id, v_invoice.id, p_invoice_item_id, v_item.original_price, v_item.applied_price, p_requested_price, p_reason, auth.uid())
  returning id into v_request_id;

  return v_request_id;
end;
$$;
grant execute on function request_invoice_price_override(uuid, numeric, text) to authenticated;

create or replace function request_invoice_discount_override(p_invoice_item_id uuid, p_requested_discount_pct numeric, p_allowed_discount_pct numeric, p_reason text)
returns uuid language plpgsql security definer as $$
declare
  v_invoice_id uuid;
  v_company_id uuid;
  v_request_id uuid;
begin
  if not has_permission('sales_invoices:request_discount_override') then raise exception 'Not permitted'; end if;
  select invoice_id into v_invoice_id from sales_invoice_items where id = p_invoice_item_id;
  if v_invoice_id is null then raise exception 'Invoice item not found'; end if;
  select company_id into v_company_id from sales_invoices where id = v_invoice_id;

  insert into sales_invoice_discount_requests (company_id, invoice_id, invoice_item_id, requested_discount_pct, allowed_discount_pct, difference_pct, reason, requested_by)
  values (v_company_id, v_invoice_id, p_invoice_item_id, p_requested_discount_pct, p_allowed_discount_pct, p_requested_discount_pct - p_allowed_discount_pct, p_reason, auth.uid())
  returning id into v_request_id;

  return v_request_id;
end;
$$;
grant execute on function request_invoice_discount_override(uuid, numeric, numeric, text) to authenticated;

create or replace function request_invoice_manual_free_quantity(
  p_invoice_item_id uuid, p_product_id uuid, p_requested_free_quantity numeric, p_scheme_free_quantity numeric, p_reason text
) returns uuid language plpgsql security definer as $$
declare
  v_invoice_id uuid;
  v_company_id uuid;
  v_request_id uuid;
begin
  if not has_permission('sales_invoices:request_manual_free_quantity') then raise exception 'Not permitted'; end if;
  select invoice_id into v_invoice_id from sales_invoice_items where id = p_invoice_item_id;
  if v_invoice_id is null then raise exception 'Invoice item not found'; end if;
  select company_id into v_company_id from sales_invoices where id = v_invoice_id;

  insert into sales_invoice_free_quantity_requests (
    company_id, invoice_id, invoice_item_id, product_id, requested_free_quantity, scheme_free_quantity, additional_free_quantity, reason, requested_by
  ) values (
    v_company_id, v_invoice_id, p_invoice_item_id, p_product_id, p_requested_free_quantity, p_scheme_free_quantity,
    greatest(p_requested_free_quantity - p_scheme_free_quantity, 0), p_reason, auth.uid()
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;
grant execute on function request_invoice_manual_free_quantity(uuid, uuid, numeric, numeric, text) to authenticated;

create table sales_invoice_sync_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  status text not null default 'local_draft' check (status in (
    'local_draft', 'pending_upload', 'uploading', 'uploaded', 'pending_revalidation',
    'returned_for_correction', 'synced', 'sync_failed', 'conflict'
  )),
  last_error text,
  uploaded_at timestamptz,
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (invoice_id, device_id)
);

alter table sales_invoice_sync_status enable row level security;
create policy sales_invoice_sync_status_isolation on sales_invoice_sync_status for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function set_invoice_sync_status(p_invoice_id uuid, p_device_uid text, p_status text, p_error text default null)
returns void language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_device_id uuid;
begin
  select company_id into v_company_id from sales_invoices where id = p_invoice_id;
  select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid;

  insert into sales_invoice_sync_status (company_id, invoice_id, device_id, status, last_error, uploaded_at, synced_at)
  values (v_company_id, p_invoice_id, v_device_id, p_status, p_error,
    case when p_status = 'uploaded' then now() end, case when p_status = 'synced' then now() end)
  on conflict (invoice_id, device_id) do update set
    status = p_status, last_error = p_error, updated_at = now(),
    uploaded_at = case when p_status = 'uploaded' then now() else sales_invoice_sync_status.uploaded_at end,
    synced_at = case when p_status = 'synced' then now() else sales_invoice_sync_status.synced_at end;
end;
$$;
grant execute on function set_invoice_sync_status(uuid, text, text, text) to authenticated;

create table sales_invoice_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references sales_invoices(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  conflict_type text not null check (conflict_type in (
    'duplicate_invoice', 'customer_blocked', 'customer_deactivated', 'product_deactivated', 'price_changed',
    'promotion_expired', 'uom_changed', 'tax_rule_changed', 'order_already_edited', 'order_already_cancelled', 'order_already_converted'
  )),
  conflict_details jsonb not null default '{}',
  resolution text check (resolution in (
    'use_server_values', 'keep_local_pending_approval', 'return_to_creator', 'supervisor_decision', 'cancel_local_version'
  ) or resolution is null),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detected_at timestamptz not null default now(),
  resolved_by uuid references app_users(id),
  resolved_at timestamptz,
  resolution_notes text
);
create index idx_sales_invoice_sync_conflicts_invoice on sales_invoice_sync_conflicts(invoice_id);
create index idx_sales_invoice_sync_conflicts_status on sales_invoice_sync_conflicts(company_id, status);

alter table sales_invoice_sync_conflicts enable row level security;
create policy sales_invoice_sync_conflicts_isolation on sales_invoice_sync_conflicts for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

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
  if v_invoice.status != 'sync_pending' then raise exception 'Invoice is not pending sync (status: %)', v_invoice.status; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_invoice.company_id and device_uid = p_device_uid;
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

  if v_conflict_count > 0 then
    perform change_sales_invoice_status(p_invoice_id, 'conflict', 'Sync revalidation found conflicts');
  else
    perform change_sales_invoice_status(p_invoice_id, 'submitted', 'Synced and revalidated with no conflicts');
  end if;

  return v_conflict_count;
end;
$$;
grant execute on function revalidate_synced_invoice(uuid, text) to authenticated;

create or replace function resolve_invoice_sync_conflict(p_conflict_id uuid, p_resolution text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_conflict sales_invoice_sync_conflicts%rowtype;
begin
  if not has_permission('sales_invoices:resolve_sync_conflict') then raise exception 'Not permitted'; end if;
  select * into v_conflict from sales_invoice_sync_conflicts where id = p_conflict_id;
  if not found then raise exception 'Conflict not found'; end if;

  update sales_invoice_sync_conflicts set
    resolution = p_resolution, status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_notes = p_notes
  where id = p_conflict_id;

  if p_resolution = 'cancel_local_version' then
    perform cancel_sales_invoice(v_conflict.invoice_id, 'Sync conflict resolved by cancelling local version', p_notes);
  elsif p_resolution = 'return_to_creator' then
    perform change_sales_invoice_status(v_conflict.invoice_id, 'draft', 'Returned to creator to resolve sync conflict');
  end if;

  if not exists (select 1 from sales_invoice_sync_conflicts where invoice_id = v_conflict.invoice_id and status = 'open') then
    if (select status from sales_invoices where id = v_conflict.invoice_id) = 'conflict' then
      perform change_sales_invoice_status(v_conflict.invoice_id, 'submitted', 'All sync conflicts resolved');
    end if;
  end if;
end;
$$;
grant execute on function resolve_invoice_sync_conflict(uuid, text, text) to authenticated;

insert into permissions (module, action, description)
select 'sales_invoices', a, 'Sales invoices: ' || a
from unnest(array[
  'view', 'create', 'create_direct', 'create_walk_in', 'convert_sales_order', 'partially_convert_sales_order',
  'edit_draft', 'cancel_draft', 'delete_unsynced_draft', 'view_credit_indicator', 'view_pricing',
  'request_price_override', 'apply_allowed_discount', 'request_discount_override', 'apply_promotion',
  'request_manual_free_quantity', 'change_tax_date', 'create_from_visit', 'create_without_visit',
  'view_reports', 'export_reports', 'resolve_sync_conflict', 'create_for_inactive'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'sales_invoices'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'sales_invoices', 'sales_invoice_items', 'sales_invoice_price_requests', 'sales_invoice_discount_requests',
    'sales_invoice_free_quantity_requests', 'sales_invoice_sync_conflicts'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s', v_table);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function log_audit_change()', v_table);
  end loop;
end;
$$;
