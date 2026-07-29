-- ============================================================================
-- 0029_van_staff_assignment.sql
-- Replaces the fixed vans.driver_id/salesman_id columns and the rigid
-- one-active-person-per-role van_assignments table (0027) with a genuinely
-- flexible model: any van can have any number of employees, each employee
-- can hold any number of roles on that van, one of which is marked primary.
-- Supports: one person doing everything, two salesmen on one van, a
-- salesman with no driver, etc. — nothing here assumes a fixed staffing
-- shape.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ROLE CATALOG — system roles available to every company, plus company-
-- specific custom roles (e.g. "Auditor", "Trainee").
-- ---------------------------------------------------------------------------
create table van_staff_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade, -- null = system role, available to all companies
  label text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- A composite primary key on (code, company_id) would implicitly force
-- company_id NOT NULL in Postgres, which breaks "null = system role" —
-- partial unique indexes instead, one for each meaning of company_id.
create unique index van_staff_roles_system_code_key on van_staff_roles(code) where company_id is null;
create unique index van_staff_roles_company_code_key on van_staff_roles(code, company_id) where company_id is not null;

insert into van_staff_roles (code, company_id, label, is_system) values
  ('driver', null, 'Driver', true),
  ('salesman', null, 'Salesman', true),
  ('collector', null, 'Collector', true),
  ('helper', null, 'Helper', true),
  ('supervisor', null, 'Supervisor', true),
  ('manager', null, 'Manager', true),
  ('stock_keeper', null, 'Stock Keeper', true);

alter table van_staff_roles enable row level security;
-- System roles (company_id is null) are visible to everyone; custom roles only to their own company.
create policy van_staff_roles_select on van_staff_roles for select
  using (company_id is null or company_id = current_company_id());
create policy van_staff_roles_write on van_staff_roles for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id() and has_permission('settings:edit'));

-- ---------------------------------------------------------------------------
-- VAN STAFF ASSIGNMENTS — one row per (van, employee, role). An employee
-- can have several active rows for the same van (multiple roles), and
-- several employees can hold the same role on the same van (e.g. two
-- salesmen). Uniqueness is only enforced on the *active* combination of
-- van+employee+role, so re-assigning after removal is always possible.
-- ---------------------------------------------------------------------------
create table van_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  employee_id uuid not null references app_users(id) on delete cascade,
  role_code text not null,
  is_primary boolean not null default false,
  assigned_date date not null default current_date,
  removed_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_van_staff_van on van_staff_assignments(van_id, status);
create index idx_van_staff_employee on van_staff_assignments(employee_id, status);
create unique index idx_van_staff_active_unique on van_staff_assignments(van_id, employee_id, role_code) where status = 'active';

alter table van_staff_assignments enable row level security;
create policy van_staff_assignments_isolation on van_staff_assignments for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- Migrate existing data from the old rigid van_assignments table (0027),
-- then retire it — this project's "one unified module, no duplication"
-- requirement means the old table shouldn't keep existing alongside the
-- new one.
-- ---------------------------------------------------------------------------
insert into van_staff_assignments (company_id, van_id, employee_id, role_code, is_primary, assigned_date, removed_date, status, created_by, created_at)
select company_id, van_id, user_id, role_type, (role_type in ('driver', 'salesman')), start_date, end_date,
       case when is_active then 'active' else 'inactive' end, created_by, created_at
from van_assignments;

drop function if exists assign_van_user(uuid, uuid, text, text, date, date, text);
drop function if exists end_van_assignment(uuid);
drop function if exists is_assigned_to_van(uuid);
drop table if exists van_assignments;

-- ---------------------------------------------------------------------------
-- assign_van_staff(): assigns one employee to a van with one or more
-- roles in a single call. Re-running with a role the employee already
-- actively holds is a no-op for that role (idempotent). Exactly one role
-- in the given list is marked primary.
-- ---------------------------------------------------------------------------
create or replace function assign_van_staff(
  p_van_id uuid, p_employee_id uuid, p_role_codes text[], p_primary_role_code text,
  p_assigned_date date default current_date
) returns void language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_role text;
begin
  if not has_permission('van_loading:edit') and not has_permission('hr:edit') then
    raise exception 'Not permitted to assign van staff';
  end if;
  if array_length(p_role_codes, 1) is null then
    raise exception 'At least one role is required';
  end if;

  foreach v_role in array p_role_codes loop
    insert into van_staff_assignments (company_id, van_id, employee_id, role_code, is_primary, assigned_date, created_by, updated_by)
    values (v_company_id, p_van_id, p_employee_id, v_role, (v_role = p_primary_role_code), p_assigned_date, auth.uid(), auth.uid())
    on conflict (van_id, employee_id, role_code) where status = 'active'
    do update set is_primary = (v_role = p_primary_role_code), updated_by = auth.uid(), updated_at = now();
  end loop;

  -- Only one primary role per employee per van.
  update van_staff_assignments
  set is_primary = (role_code = p_primary_role_code), updated_by = auth.uid(), updated_at = now()
  where van_id = p_van_id and employee_id = p_employee_id and status = 'active';
end;
$$;

grant execute on function assign_van_staff(uuid, uuid, text[], text, date) to authenticated;

-- Ends a single role for an employee on a van (they keep any other active roles there).
create or replace function remove_van_staff_role(p_assignment_id uuid)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:edit') and not has_permission('hr:edit') then
    raise exception 'Not permitted to remove van staff';
  end if;
  update van_staff_assignments
  set status = 'inactive', removed_date = coalesce(removed_date, current_date), updated_by = auth.uid(), updated_at = now()
  where id = p_assignment_id;
end;
$$;

grant execute on function remove_van_staff_role(uuid) to authenticated;

-- Ends ALL of an employee's active roles on a van in one call (full removal from the van).
create or replace function remove_van_staff(p_van_id uuid, p_employee_id uuid)
returns void language plpgsql security definer as $$
begin
  if not has_permission('van_loading:edit') and not has_permission('hr:edit') then
    raise exception 'Not permitted to remove van staff';
  end if;
  update van_staff_assignments
  set status = 'inactive', removed_date = coalesce(removed_date, current_date), updated_by = auth.uid(), updated_at = now()
  where van_id = p_van_id and employee_id = p_employee_id and status = 'active';
end;
$$;

grant execute on function remove_van_staff(uuid, uuid) to authenticated;

-- Van-based access check, rewritten against the new table.
create or replace function is_assigned_to_van(p_van_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from van_staff_assignments
    where van_id = p_van_id and employee_id = auth.uid() and status = 'active'
  ) or has_permission('van_loading:approve');
$$;

grant execute on function is_assigned_to_van(uuid) to authenticated;

-- "Auto-detect on login": the caller's own active van/role assignments,
-- with the van's route for convenience. Used to default the UI to a
-- person's own van instead of asking them to pick every time.
create or replace function my_van_staff_assignments()
returns table (
  assignment_id uuid, van_id uuid, van_name text, role_code text, is_primary boolean, route_id uuid, route_name text
) language sql stable security definer as $$
  select vsa.id, v.id, v.name, vsa.role_code, vsa.is_primary, r.id, r.name
  from van_staff_assignments vsa
  join vans v on v.id = vsa.van_id
  left join routes r on r.van_id = v.id and r.is_active = true
  where vsa.employee_id = auth.uid() and vsa.status = 'active';
$$;

grant execute on function my_van_staff_assignments() to authenticated;

-- ---------------------------------------------------------------------------
-- Retire the fixed columns on vans — staffing now lives entirely in
-- van_staff_assignments. (Data was not migrated from these columns because
-- van_assignments, migrated above, is already the authoritative source —
-- these two columns were kept in sync from it as a compatibility shim.)
-- ---------------------------------------------------------------------------
alter table vans drop column if exists driver_id;
alter table vans drop column if exists salesman_id;
