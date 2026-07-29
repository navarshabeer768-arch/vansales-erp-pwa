-- ============================================================================
-- 0027_fleet_management.sql
-- Extends vans with full vehicle detail fields + archive/restore, and adds
-- proper assignment history (driver/salesman/helper/collector, permanent/
-- temporary/replacement) plus vehicle documents and images.
-- ============================================================================

alter table vans add column if not exists vin_number text;
alter table vans add column if not exists chassis_number text;
alter table vans add column if not exists engine_number text;
alter table vans add column if not exists vehicle_type text;
alter table vans add column if not exists capacity text;
alter table vans add column if not exists current_odometer numeric(10,1);
alter table vans add column if not exists purchase_date date;
alter table vans add column if not exists road_permit_no text;
alter table vans add column if not exists permit_expiry date;
alter table vans add column if not exists registration_expiry date;
alter table vans add column if not exists notes text;
alter table vans add column if not exists is_archived boolean not null default false;

-- ---------------------------------------------------------------------------
-- VAN ASSIGNMENTS (history) — replaces the single driver_id/salesman_id
-- columns as the source of truth for "who can currently use this van".
-- driver_id/salesman_id on vans stay in place (used elsewhere already) and
-- are kept in sync by assign_van_user()/end_van_assignment() below, but this
-- table is what actually tracks helper/collector roles and full history.
-- ---------------------------------------------------------------------------
create table van_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role_type text not null check (role_type in ('driver', 'salesman', 'helper', 'collector')),
  assignment_type text not null default 'permanent' check (assignment_type in ('permanent', 'temporary', 'replacement')),
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  replaced_assignment_id uuid references van_assignments(id) on delete set null,
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_van_assignments_van on van_assignments(van_id, is_active);
create index idx_van_assignments_user on van_assignments(user_id, is_active);

alter table van_assignments enable row level security;
create policy van_assignments_isolation on van_assignments for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- Assign a user to a van. Ends any existing active assignment of the same
-- role_type on that van first (so "driver" is always exactly one active
-- person at a time, same for the other three roles), keeps history intact,
-- and syncs vans.driver_id/salesman_id for driver/salesman roles so
-- existing code that reads those columns keeps working unchanged.
-- ---------------------------------------------------------------------------
create or replace function assign_van_user(
  p_van_id uuid, p_user_id uuid, p_role_type text, p_assignment_type text default 'permanent',
  p_start_date date default current_date, p_end_date date default null, p_notes text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_new_id uuid;
  v_replaced_id uuid;
begin
  if not has_permission('van_loading:edit') and not has_permission('hr:edit') then
    raise exception 'Not permitted to assign van users';
  end if;

  select id into v_replaced_id from van_assignments
  where van_id = p_van_id and role_type = p_role_type and is_active = true
  limit 1;

  if v_replaced_id is not null then
    update van_assignments set is_active = false, end_date = coalesce(end_date, current_date) where id = v_replaced_id;
  end if;

  insert into van_assignments (company_id, van_id, user_id, role_type, assignment_type, start_date, end_date, replaced_assignment_id, notes, created_by)
  values (v_company_id, p_van_id, p_user_id, p_role_type, p_assignment_type, p_start_date, p_end_date, v_replaced_id, p_notes, auth.uid())
  returning id into v_new_id;

  if p_role_type = 'driver' then
    update vans set driver_id = p_user_id where id = p_van_id;
  elsif p_role_type = 'salesman' then
    update vans set salesman_id = p_user_id where id = p_van_id;
  end if;

  return v_new_id;
end;
$$;

grant execute on function assign_van_user(uuid, uuid, text, text, date, date, text) to authenticated;

create or replace function end_van_assignment(p_assignment_id uuid)
returns void language plpgsql security definer as $$
declare
  v_van_id uuid;
  v_role_type text;
begin
  if not has_permission('van_loading:edit') and not has_permission('hr:edit') then
    raise exception 'Not permitted to end van assignments';
  end if;

  select van_id, role_type into v_van_id, v_role_type from van_assignments where id = p_assignment_id;
  update van_assignments set is_active = false, end_date = coalesce(end_date, current_date) where id = p_assignment_id;

  if v_role_type = 'driver' then
    update vans set driver_id = null where id = v_van_id and driver_id = (select user_id from van_assignments where id = p_assignment_id);
  elsif v_role_type = 'salesman' then
    update vans set salesman_id = null where id = v_van_id and salesman_id = (select user_id from van_assignments where id = p_assignment_id);
  end if;
end;
$$;

grant execute on function end_van_assignment(uuid) to authenticated;

-- Convenience check used by the client to restrict "which van can I use"
-- pickers for salesman/driver/helper/collector roles.
create or replace function is_assigned_to_van(p_van_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from van_assignments
    where van_id = p_van_id and user_id = auth.uid() and is_active = true
  ) or has_permission('van_loading:approve'); -- managers/admins with approval rights can use any van
$$;

grant execute on function is_assigned_to_van(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- VEHICLE DOCUMENTS
-- ---------------------------------------------------------------------------
create table vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  document_type text not null check (document_type in ('insurance', 'registration', 'permit', 'fitness', 'warranty', 'service_book', 'other')),
  document_no text,
  issue_date date,
  expiry_date date,
  file_url text,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_vehicle_documents_van on vehicle_documents(van_id);
create index idx_vehicle_documents_expiry on vehicle_documents(company_id, expiry_date);

alter table vehicle_documents enable row level security;
create policy vehicle_documents_isolation on vehicle_documents for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- ---------------------------------------------------------------------------
-- VEHICLE IMAGES
-- ---------------------------------------------------------------------------
create table vehicle_images (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  van_id uuid not null references vans(id) on delete cascade,
  image_url text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_vehicle_images_van on vehicle_images(van_id);

alter table vehicle_images enable row level security;
create policy vehicle_images_isolation on vehicle_images for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());
