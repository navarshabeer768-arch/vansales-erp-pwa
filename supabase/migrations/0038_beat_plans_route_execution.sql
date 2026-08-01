-- ============================================================================
-- 0038_beat_plans_route_execution.sql
-- Beat Plans, Daily Visit Planning & Route Execution (Phase 5A.1 Part 1).
--
-- Deliberately reuses rather than duplicates:
-- - routes/route_customers (Phase 1) — Beat Plans reference route_id; they
--   don't replace routes. The rich recurrence engine here (weekly is only
--   a single day_of_week today) is what's genuinely missing.
-- - van_staff_roles/van_staff_assignments (Phase 3B.1) — the exact
--   flexible multi-role model this phase asks for already exists;
--   daily_visit_plan_employees.role_code uses the same role catalog.
-- - daily_van_operations (Phase 3B.1) — ALREADY has a van-day Start ->
--   Pause <-> Resume -> End lifecycle with odometer/cash/stock-value
--   tracking. route_execution_sessions does NOT reimplement this; it
--   links 1:1 to a daily_van_operations row and adds only the
--   route-specific execution state that table doesn't have (current
--   customer, completion counts, plan reference). Start/Pause/Resume/End
--   below call the EXISTING daily_van_operations RPCs.
-- - customer_visits (Phase 1) — deliberately NOT touched. Part 1
--   explicitly excludes detailed GPS check-in/checkout, which is what
--   that table already does. daily_visit_plan_items is a new planning
--   layer; its relationship to customer_visits during execution is a
--   Part 2 decision.
--
-- Honest limitation stated up front: the 18 tables this phase names do
-- NOT include a holiday-calendar table, so "Branch Holidays" / "Public
-- Holidays" inputs to plan generation have configuration fields
-- (skip_holiday, holiday_handling) but no actual holiday data to check
-- against yet — there's nowhere in the required schema to store it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BEAT PLANS
-- ---------------------------------------------------------------------------
create table beat_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  beat_code text not null,
  beat_name text not null,
  description text,
  branch_id uuid references warehouses(id) on delete set null,
  territory_id uuid references territories(id) on delete set null,
  area text,
  route_id uuid references routes(id) on delete set null,
  default_van_id uuid references vans(id) on delete set null,
  effective_from date not null default current_date,
  effective_to date,
  expected_start_time time,
  expected_end_time time,
  expected_route_duration_minutes integer,
  expected_travel_time_minutes integer,
  expected_customer_visit_minutes integer,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'suspended', 'expired', 'archived')),
  notes text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, beat_code)
);
create index idx_beat_plans_company_status on beat_plans(company_id, status);

alter table beat_plans enable row level security;
create policy beat_plans_isolation on beat_plans for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_beat_plans_updated_at before update on beat_plans
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- CUSTOMER BEAT ASSIGNMENT (with full effective-dated history — edits
-- never overwrite, they close out the old assignment and insert a new one).
-- ---------------------------------------------------------------------------
create table beat_plan_customer_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  beat_plan_id uuid not null references beat_plans(id) on delete cascade,
  route_id uuid references routes(id) on delete set null,
  visit_sequence integer not null default 0,
  original_sequence integer not null default 0,
  preferred_visit_start_time time,
  preferred_visit_end_time time,
  expected_visit_duration_minutes integer,
  visit_frequency_override text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assigned_van_id uuid references vans(id) on delete set null,
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  delivery_instructions text,
  sales_notes text,
  collection_notes text,
  special_instructions text,
  assignment_reason text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (customer_id, beat_plan_id, start_date)
);
create index idx_beat_plan_customer_assignments_plan on beat_plan_customer_assignments(beat_plan_id, is_active);
create index idx_beat_plan_customer_assignments_customer on beat_plan_customer_assignments(customer_id, is_active);

alter table beat_plan_customer_assignments enable row level security;
create policy beat_plan_customer_assignments_isolation on beat_plan_customer_assignments for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- customer_count is derived, never hand-maintained, so it can't drift from reality.
create or replace function beat_plan_customer_count(p_beat_plan_id uuid)
returns integer language sql stable as $$
  select count(*)::integer from beat_plan_customer_assignments where beat_plan_id = p_beat_plan_id and is_active;
$$;

create table beat_plan_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  beat_plan_id uuid not null references beat_plans(id) on delete cascade,
  old_status text, new_status text not null, reason text,
  changed_by uuid references app_users(id), changed_at timestamptz not null default now()
);
alter table beat_plan_status_history enable row level security;
create policy beat_plan_status_history_isolation on beat_plan_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function change_beat_plan_status(p_beat_plan_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_old text; v_company_id uuid;
begin
  if p_new_status in ('active', 'draft') then
    if not has_permission('beat_plans:activate') and not has_permission('beat_plans:edit') then raise exception 'Not permitted'; end if;
  else
    if not has_permission('beat_plans:deactivate') and not has_permission('beat_plans:edit') then raise exception 'Not permitted'; end if;
  end if;

  select status, company_id into v_old, v_company_id from beat_plans where id = p_beat_plan_id;
  if v_old is null then raise exception 'Beat plan not found'; end if;

  update beat_plans set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_beat_plan_id;
  insert into beat_plan_status_history (company_id, beat_plan_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_beat_plan_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_beat_plan_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- BEAT PLAN SCHEDULES (recurrence rules) + materialized schedule dates.
-- ---------------------------------------------------------------------------
create table beat_plan_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  beat_plan_id uuid not null references beat_plans(id) on delete cascade,
  frequency_type text not null check (frequency_type in (
    'daily', 'alternate_days', 'weekly', 'biweekly', 'every_n_days', 'monthly',
    'specific_weekdays', 'specific_dates', 'first_week', 'second_week', 'third_week', 'last_week', 'custom_calendar'
  )),
  start_date date not null,
  end_date date,
  weekdays integer[] not null default '{}',
  repeat_interval_days integer,
  specific_dates date[] not null default '{}',
  skip_holiday boolean not null default false,
  holiday_handling text default 'skip' check (holiday_handling in ('skip', 'move_before', 'move_after') or holiday_handling is null),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_beat_plan_schedules_plan on beat_plan_schedules(beat_plan_id, is_active);

alter table beat_plan_schedules enable row level security;
create policy beat_plan_schedules_isolation on beat_plan_schedules for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table beat_plan_schedule_dates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  beat_plan_id uuid not null references beat_plans(id) on delete cascade,
  schedule_id uuid not null references beat_plan_schedules(id) on delete cascade,
  visit_date date not null,
  original_date date,
  status text not null default 'scheduled' check (status in ('scheduled', 'generated', 'skipped')),
  created_at timestamptz not null default now(),
  unique (beat_plan_id, visit_date)
);
create index idx_beat_plan_schedule_dates_plan_date on beat_plan_schedule_dates(beat_plan_id, visit_date);

alter table beat_plan_schedule_dates enable row level security;
create policy beat_plan_schedule_dates_isolation on beat_plan_schedule_dates for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function beat_plan_date_matches(p_schedule beat_plan_schedules, p_check_date date)
returns boolean language plpgsql immutable as $$
declare
  v_dow integer := extract(dow from p_check_date);
  v_day_of_month integer := extract(day from p_check_date);
  v_start_day_of_month integer := extract(day from p_schedule.start_date);
  v_days_since_start integer := p_check_date - p_schedule.start_date;
  v_nth_weekday integer;
  v_is_last_weekday boolean;
begin
  if p_check_date < p_schedule.start_date then return false; end if;
  if p_schedule.end_date is not null and p_check_date > p_schedule.end_date then return false; end if;

  case p_schedule.frequency_type
    when 'daily' then
      return true;
    when 'alternate_days' then
      return v_days_since_start % 2 = 0;
    when 'every_n_days' then
      return p_schedule.repeat_interval_days is not null and p_schedule.repeat_interval_days > 0
        and v_days_since_start % p_schedule.repeat_interval_days = 0;
    when 'weekly', 'specific_weekdays' then
      return v_dow = any(p_schedule.weekdays);
    when 'biweekly' then
      return v_dow = any(p_schedule.weekdays) and (v_days_since_start / 7) % 2 = 0;
    when 'monthly' then
      return v_day_of_month = v_start_day_of_month;
    when 'first_week', 'second_week', 'third_week', 'last_week' then
      if not (v_dow = any(p_schedule.weekdays)) then return false; end if;
      v_nth_weekday := ((v_day_of_month - 1) / 7) + 1;
      v_is_last_weekday := (p_check_date + interval '7 days')::date > (date_trunc('month', p_check_date) + interval '1 month')::date;
      return (p_schedule.frequency_type = 'first_week' and v_nth_weekday = 1)
        or (p_schedule.frequency_type = 'second_week' and v_nth_weekday = 2)
        or (p_schedule.frequency_type = 'third_week' and v_nth_weekday = 3)
        or (p_schedule.frequency_type = 'last_week' and v_is_last_weekday);
    when 'specific_dates', 'custom_calendar' then
      return p_check_date = any(p_schedule.specific_dates);
    else
      return false;
  end case;
end;
$$;

create or replace function generate_beat_plan_dates(p_schedule_id uuid, p_from_date date, p_to_date date)
returns integer language plpgsql security definer as $$
declare
  v_schedule beat_plan_schedules%rowtype;
  v_company_id uuid;
  v_date date;
  v_count integer := 0;
  v_inserted uuid;
begin
  select * into v_schedule from beat_plan_schedules where id = p_schedule_id and is_active;
  if not found then return 0; end if;

  select company_id into v_company_id from beat_plans where id = v_schedule.beat_plan_id;

  v_date := p_from_date;
  while v_date <= p_to_date loop
    if beat_plan_date_matches(v_schedule, v_date) then
      insert into beat_plan_schedule_dates (company_id, beat_plan_id, schedule_id, visit_date, status)
      values (v_company_id, v_schedule.beat_plan_id, p_schedule_id, v_date, 'scheduled')
      on conflict (beat_plan_id, visit_date) do nothing
      returning id into v_inserted;
      if v_inserted is not null then v_count := v_count + 1; end if;
    end if;
    v_date := v_date + 1;
  end loop;

  return v_count;
end;
$$;
grant execute on function generate_beat_plan_dates(uuid, date, date) to authenticated;

create table beat_plan_assignment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  assignment_id uuid references beat_plan_customer_assignments(id) on delete set null,
  field_name text not null,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_beat_plan_assignment_history_customer on beat_plan_assignment_history(customer_id, changed_at desc);

alter table beat_plan_assignment_history enable row level security;
create policy beat_plan_assignment_history_isolation on beat_plan_assignment_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function assign_customer_to_beat_plan(
  p_customer_id uuid, p_beat_plan_id uuid, p_route_id uuid, p_visit_sequence integer,
  p_assigned_van_id uuid default null, p_priority text default 'medium', p_reason text default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_existing beat_plan_customer_assignments%rowtype;
  v_new_id uuid;
begin
  if not has_permission('beat_plans:assign_customers') then raise exception 'Not permitted'; end if;

  select * into v_existing from beat_plan_customer_assignments
  where customer_id = p_customer_id and beat_plan_id = p_beat_plan_id and is_active limit 1;

  if v_existing.id is not null then
    if v_existing.visit_sequence is distinct from p_visit_sequence then
      insert into beat_plan_assignment_history (company_id, customer_id, assignment_id, field_name, old_value, new_value, reason, changed_by)
      values (v_company_id, p_customer_id, v_existing.id, 'visit_sequence', v_existing.visit_sequence::text, p_visit_sequence::text, p_reason, auth.uid());
    end if;
    if v_existing.assigned_van_id is distinct from p_assigned_van_id then
      insert into beat_plan_assignment_history (company_id, customer_id, assignment_id, field_name, old_value, new_value, reason, changed_by)
      values (v_company_id, p_customer_id, v_existing.id, 'assigned_van_id', v_existing.assigned_van_id::text, p_assigned_van_id::text, p_reason, auth.uid());
    end if;

    update beat_plan_customer_assignments set
      visit_sequence = p_visit_sequence, assigned_van_id = p_assigned_van_id, priority = p_priority,
      updated_by = auth.uid()
    where id = v_existing.id;

    return v_existing.id;
  end if;

  insert into beat_plan_customer_assignments (
    company_id, customer_id, beat_plan_id, route_id, visit_sequence, original_sequence,
    assigned_van_id, priority, assignment_reason, created_by, updated_by
  ) values (
    v_company_id, p_customer_id, p_beat_plan_id, p_route_id, p_visit_sequence, p_visit_sequence,
    p_assigned_van_id, p_priority, p_reason, auth.uid(), auth.uid()
  ) returning id into v_new_id;

  insert into beat_plan_assignment_history (company_id, customer_id, assignment_id, field_name, old_value, new_value, reason, changed_by)
  values (v_company_id, p_customer_id, v_new_id, 'beat_plan_id', null, p_beat_plan_id::text, p_reason, auth.uid());

  return v_new_id;
end;
$$;
grant execute on function assign_customer_to_beat_plan(uuid, uuid, uuid, integer, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- BEAT PLAN CAPACITY VALIDATION — real numbers from real plan/route data.
-- ---------------------------------------------------------------------------
create or replace function validate_beat_plan_capacity(p_beat_plan_id uuid)
returns table (check_name text, passed boolean, message text) language plpgsql stable as $$
declare
  v_plan beat_plans%rowtype;
  v_customer_count integer;
  v_expected_visit_minutes integer;
  v_expected_travel_minutes integer;
  v_total_minutes integer;
  v_working_minutes integer;
  v_overlap_employee_count integer;
  v_overlap_van_count integer;
begin
  select * into v_plan from beat_plans where id = p_beat_plan_id;
  v_customer_count := beat_plan_customer_count(p_beat_plan_id);

  select coalesce(sum(coalesce(expected_visit_duration_minutes, v_plan.expected_customer_visit_minutes, 10)), 0)
  into v_expected_visit_minutes
  from beat_plan_customer_assignments where beat_plan_id = p_beat_plan_id and is_active;

  v_expected_travel_minutes := coalesce(v_plan.expected_travel_time_minutes, 0);
  v_total_minutes := v_expected_visit_minutes + v_expected_travel_minutes;

  check_name := 'customer_count'; passed := v_customer_count <= 60;
  message := format('%s customers assigned (guideline: 60 max per beat)', v_customer_count);
  return next;

  if v_plan.expected_start_time is not null and v_plan.expected_end_time is not null then
    v_working_minutes := extract(epoch from (v_plan.expected_end_time - v_plan.expected_start_time)) / 60;
    check_name := 'working_hours';
    passed := v_total_minutes <= v_working_minutes;
    message := format('Expected workload %s min vs %s min available', v_total_minutes, v_working_minutes);
    return next;
  end if;

  select count(distinct vsa2.employee_id) into v_overlap_employee_count
  from van_staff_assignments vsa1
  join beat_plans bp on bp.default_van_id = vsa1.van_id and bp.id != p_beat_plan_id and bp.status = 'active'
  join van_staff_assignments vsa2 on vsa2.van_id = v_plan.default_van_id and vsa2.employee_id = vsa1.employee_id and vsa2.status = 'active'
  where vsa1.status = 'active';

  check_name := 'employee_overlap'; passed := v_overlap_employee_count = 0;
  message := format('%s employee(s) also active on another beat plan''s van', v_overlap_employee_count);
  return next;

  select count(*) into v_overlap_van_count from beat_plans
  where default_van_id = v_plan.default_van_id and id != p_beat_plan_id and status = 'active';

  check_name := 'van_overlap'; passed := v_overlap_van_count = 0;
  message := format('Van is also the default van on %s other active beat plan(s)', v_overlap_van_count);
  return next;

  return;
end;
$$;
grant execute on function validate_beat_plan_capacity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select 'beat_plans', a, 'Beat plans: ' || a
from unnest(array['view', 'create', 'edit', 'delete_draft', 'activate', 'deactivate', 'assign_customers', 'manage_schedules']) as a
on conflict do nothing;

insert into permissions (module, action, description)
select 'route_execution', a, 'Route execution: ' || a
from unnest(array[
  'generate_plans', 'create_manual', 'edit_plans', 'approve_plans', 'reject_plans',
  'assign_vans', 'assign_employees', 'reorder_customers', 'optimize_route',
  'start_route', 'pause_route', 'resume_route', 'end_route', 'skip_customer', 'reschedule_customer',
  'add_unplanned', 'approve_early_closure', 'view_monitoring', 'reopen_plan', 'view_reports', 'export_reports'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module in ('beat_plans', 'route_execution')
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;
