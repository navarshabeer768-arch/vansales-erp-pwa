-- ============================================================================
-- 0001_core_tenancy_auth.sql
-- Multi-tenant core: companies (tenants), users, roles, permissions
-- ============================================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  slug text unique not null,
  logo_url text,
  currency text not null default 'QAR',
  tax_number text,
  tax_rate numeric(5,2) not null default 0,
  address text,
  phone text,
  email text,
  timezone text not null default 'Asia/Qatar',
  subscription_plan text not null default 'trial' check (subscription_plan in ('trial','basic','professional','enterprise')),
  subscription_status text not null default 'active' check (subscription_status in ('active','suspended','cancelled')),
  trial_ends_at timestamptz,
  is_active boolean not null default true,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table companies is 'Tenant root. Every business table has company_id and is isolated via RLS.';

-- ---------------------------------------------------------------------------
-- ROLES (system-defined + custom per-company)
-- ---------------------------------------------------------------------------
create table roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade, -- null = system role template
  name text not null,
  code text not null, -- super_admin, company_admin, warehouse_manager, van_sales_manager, salesman, driver, cash_collector, accounts, auditor, stock_controller
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique(company_id, code)
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null, -- dashboard, sales, van_loading, van_unloading, route_planning, customer_visit, inventory, warehouse, purchases, payments, collections, returns, accounting, reports, hr, gps_tracking, settings
  action text not null, -- view, create, edit, delete, approve, export
  code text generated always as (module || ':' || action) stored unique,
  description text
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- USERS (mirrors auth.users, one row per app user, always scoped to a company)
-- ---------------------------------------------------------------------------
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role_id uuid not null references roles(id),
  employee_code text,
  full_name text not null,
  email text not null,
  phone text,
  avatar_url text,
  device_id text, -- registered device for PDT lock-down
  device_registered_at timestamptz,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, employee_code)
);
create index idx_app_users_company on app_users(company_id);

-- ---------------------------------------------------------------------------
-- AUDIT & ACTIVITY LOGS
-- ---------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  entity_table text not null,
  entity_id uuid,
  action text not null, -- insert, update, delete, approve, reject
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_company_entity on audit_logs(company_id, entity_table, entity_id);

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  activity text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_activity_logs_company on activity_logs(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS for RLS (security definer, avoids recursive RLS lookups)
-- ---------------------------------------------------------------------------
create or replace function current_company_id()
returns uuid
language sql stable security definer
as $$
  select company_id from app_users where id = auth.uid();
$$;

create or replace function current_role_code()
returns text
language sql stable security definer
as $$
  select r.code from app_users u join roles r on r.id = u.role_id where u.id = auth.uid();
$$;

create or replace function has_permission(p_code text)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from app_users u
    join role_permissions rp on rp.role_id = u.role_id
    join permissions p on p.id = rp.permission_id and p.code = p_code
    where u.id = auth.uid()
  );
$$;

create or replace function is_super_admin()
returns boolean
language sql stable security definer
as $$
  select coalesce(current_role_code() = 'super_admin', false);
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (reused by every table with updated_at)
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_companies_updated_at before update on companies
  for each row execute function set_updated_at();
create trigger trg_app_users_updated_at before update on app_users
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table companies enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table app_users enable row level security;
alter table audit_logs enable row level security;
alter table activity_logs enable row level security;

create policy companies_select on companies for select
  using (id = current_company_id() or is_super_admin());
create policy companies_update on companies for update
  using (id = current_company_id() and has_permission('settings:edit'));

create policy roles_select on roles for select
  using (company_id is null or company_id = current_company_id() or is_super_admin());
create policy roles_write on roles for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id());

create policy permissions_select on permissions for select using (true);

create policy role_permissions_select on role_permissions for select
  using (exists (select 1 from roles r where r.id = role_id and (r.company_id is null or r.company_id = current_company_id())));

create policy app_users_select on app_users for select
  using (company_id = current_company_id() or is_super_admin());
create policy app_users_write on app_users for all
  using (company_id = current_company_id() and has_permission('hr:edit'))
  with check (company_id = current_company_id());

create policy audit_logs_select on audit_logs for select
  using (company_id = current_company_id() and has_permission('reports:view'));
create policy audit_logs_insert on audit_logs for insert
  with check (company_id = current_company_id());

create policy activity_logs_select on activity_logs for select
  using (company_id = current_company_id());
create policy activity_logs_insert on activity_logs for insert
  with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- SEED: system permission catalog (module:action grid)
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select m, a, initcap(a) || ' access to ' || m
from unnest(array[
  'dashboard','sales','van_loading','van_unloading','route_planning','customer_visit',
  'inventory','warehouse','purchases','payments','collections','returns',
  'accounting','reports','hr','gps_tracking','settings'
]) as m
cross join unnest(array['view','create','edit','delete','approve','export']) as a
on conflict do nothing;
