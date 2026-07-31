-- ============================================================================
-- 0033_pdt_devices.sql
-- Device Management, universal scan/print logging (works for camera, HID
-- Bluetooth/USB scanners, and PDT built-in scanners running in keyboard-
-- wedge mode — see README for why that covers Zebra/Chainway/Urovo/
-- Honeywell/Sunmi/Newland without any device-specific code), print
-- settings, recent/favourite products, and sync/offline-activity logging.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- New permission module: devices (register/assign/delete/print/scan/
-- offline_access/sync/manage). Free-text action column, so these don't
-- need to match the standard 6-action pattern used elsewhere.
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select 'devices', a, 'Device management: ' || a
from unnest(array['register', 'assign', 'delete', 'print', 'scan', 'offline_access', 'sync', 'manage']) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'devices'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- DEVICES
-- ---------------------------------------------------------------------------
create table devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  device_uid text not null, -- persistent client-generated id (same pattern as the existing getDeviceId())
  device_name text not null,
  device_model text,
  manufacturer text, -- free text: Zebra / Chainway / Urovo / Honeywell / Sunmi / Newland / Generic / Other
  os_version text,
  device_type text not null default 'android_pdt' check (device_type in ('android_pdt', 'tablet', 'desktop', 'other')),
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  assigned_employee_id uuid references app_users(id) on delete set null,
  assigned_van_id uuid references vans(id) on delete set null,
  assigned_warehouse_id uuid references warehouses(id) on delete set null,
  last_sync_at timestamptz,
  last_login_at timestamptz,
  registered_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, device_uid)
);
create index idx_devices_company on devices(company_id, status);

alter table devices enable row level security;
create policy devices_isolation on devices for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_devices_updated_at before update on devices
  for each row execute function set_updated_at();

create table device_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  employee_id uuid references app_users(id) on delete set null,
  login_at timestamptz not null default now(),
  logout_at timestamptz,
  user_agent text
);
create index idx_device_sessions_device on device_sessions(device_id, login_at desc);

alter table device_sessions enable row level security;
create policy device_sessions_isolation on device_sessions for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function register_device_login(
  p_device_uid text, p_device_name text, p_device_model text, p_manufacturer text,
  p_os_version text, p_user_agent text
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_device_id uuid;
begin
  insert into devices (company_id, device_uid, device_name, device_model, manufacturer, os_version, last_login_at, registered_by)
  values (v_company_id, p_device_uid, p_device_name, p_device_model, p_manufacturer, p_os_version, now(), auth.uid())
  on conflict (company_id, device_uid) do update set
    last_login_at = now(), device_model = coalesce(excluded.device_model, devices.device_model),
    os_version = coalesce(excluded.os_version, devices.os_version), updated_at = now()
  returning id into v_device_id;

  insert into device_sessions (company_id, device_id, employee_id, user_agent)
  values (v_company_id, v_device_id, auth.uid(), p_user_agent);

  return v_device_id;
end;
$$;

grant execute on function register_device_login(text, text, text, text, text, text) to authenticated;

create or replace function touch_device_sync(p_device_uid text)
returns void language plpgsql security definer as $$
begin
  update devices set last_sync_at = now() where company_id = current_company_id() and device_uid = p_device_uid;
end;
$$;

grant execute on function touch_device_sync(text) to authenticated;

-- ---------------------------------------------------------------------------
-- SCAN LOGS — every barcode/QR read, however it arrived (camera, HID
-- Bluetooth/USB scanner, or a PDT's built-in engine in keyboard-wedge mode
-- all land here identically, since they all just produce a text value).
-- ---------------------------------------------------------------------------
create table scan_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  employee_id uuid references app_users(id) on delete set null,
  scan_type text not null check (scan_type in ('barcode', 'qr')),
  scanned_value text not null,
  lookup_type text check (lookup_type in ('product', 'batch', 'serial', 'customer', 'invoice', 'van', 'warehouse', 'unknown')),
  lookup_result_id uuid,
  lookup_success boolean not null default false,
  context text, -- which screen the scan happened on, e.g. 'pos', 'loading', 'unloading', 'search'
  created_at timestamptz not null default now()
);
create index idx_scan_logs_company on scan_logs(company_id, created_at desc);
create index idx_scan_logs_device on scan_logs(device_id, created_at desc);

alter table scan_logs enable row level security;
create policy scan_logs_isolation on scan_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- PRINT LOGS + PRINT SETTINGS
-- ---------------------------------------------------------------------------
create table print_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  employee_id uuid references app_users(id) on delete set null,
  document_type text not null check (document_type in (
    'loading_slip', 'unload_slip', 'invoice', 'collection_receipt', 'return_receipt',
    'stock_count_report', 'daily_summary', 'customer_statement'
  )),
  reference_id uuid,
  printer_type text not null check (printer_type in ('thermal_bluetooth', 'browser_a4', 'browser_58mm', 'browser_80mm')),
  copies integer not null default 1,
  created_at timestamptz not null default now()
);
create index idx_print_logs_company on print_logs(company_id, created_at desc);

alter table print_logs enable row level security;
create policy print_logs_isolation on print_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table print_settings (
  company_id uuid primary key references companies(id) on delete cascade,
  copies integer not null default 1,
  show_logo boolean not null default false,
  logo_url text,
  header_text text,
  footer_text text,
  show_qr boolean not null default false,
  show_barcode boolean not null default true,
  terms_text text,
  show_signature boolean not null default true,
  paper_size text not null default '80mm' check (paper_size in ('58mm', '80mm', 'a4')),
  margin_mm integer not null default 5,
  updated_at timestamptz not null default now()
);

alter table print_settings enable row level security;
create policy print_settings_isolation on print_settings for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- RECENT / FAVOURITE PRODUCTS (per employee, for fast product search)
-- ---------------------------------------------------------------------------
create table product_recent_views (
  employee_id uuid not null references app_users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (employee_id, product_id)
);

alter table product_recent_views enable row level security;
create policy product_recent_views_own on product_recent_views for all
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

create or replace function record_product_view(p_product_id uuid)
returns void language plpgsql security definer as $$
begin
  insert into product_recent_views (employee_id, product_id, viewed_at)
  values (auth.uid(), p_product_id, now())
  on conflict (employee_id, product_id) do update set viewed_at = now();
end;
$$;
grant execute on function record_product_view(uuid) to authenticated;

create table product_favourites (
  employee_id uuid not null references app_users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_id, product_id)
);

alter table product_favourites enable row level security;
create policy product_favourites_own on product_favourites for all
  using (employee_id = auth.uid()) with check (employee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- SYNC HISTORY + OFFLINE ACTIVITY — the actual queue lives client-side in
-- IndexedDB (that's inherent to how offline-first works; there's nothing
-- to queue server-side before it's reached the server). These tables are
-- the server-side record of what synced, when, and how — backing the Sync
-- Report and Offline Activity Report.
-- ---------------------------------------------------------------------------
create table sync_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  employee_id uuid references app_users(id) on delete set null,
  entity_type text not null,
  records_synced integer not null default 0,
  records_failed integer not null default 0,
  status text not null check (status in ('success', 'partial', 'failed')),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_sync_history_company on sync_history(company_id, started_at desc);

alter table sync_history enable row level security;
create policy sync_history_isolation on sync_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table offline_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  employee_id uuid references app_users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  offline_created_at timestamptz not null,
  synced_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'synced', 'failed', 'conflict')),
  conflict_notes text,
  created_at timestamptz not null default now()
);
create index idx_offline_transactions_company on offline_transactions(company_id, status, offline_created_at desc);

alter table offline_transactions enable row level security;
create policy offline_transactions_isolation on offline_transactions for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());
