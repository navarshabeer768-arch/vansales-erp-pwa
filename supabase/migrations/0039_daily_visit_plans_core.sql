-- ============================================================================
-- 0039_daily_visit_plans_core.sql
-- Daily Visit Plans core (Phase 5A.1 Part 1, continued). Continues 0038.
-- ============================================================================

create table daily_visit_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_date date not null,
  branch_id uuid references warehouses(id) on delete set null,
  territory_id uuid references territories(id) on delete set null,
  route_id uuid references routes(id) on delete set null,
  beat_plan_id uuid references beat_plans(id) on delete set null,
  van_id uuid references vans(id) on delete set null,
  primary_employee_id uuid references app_users(id) on delete set null,
  supervisor_id uuid references app_users(id) on delete set null,
  planned_start_time time,
  planned_end_time time,
  expected_distance_km numeric(8,1),
  expected_duration_minutes integer,
  status text not null default 'draft' check (status in (
    'draft', 'generated', 'pending_approval', 'approved', 'ready', 'started',
    'paused', 'completed', 'partially_completed', 'cancelled', 'closed'
  )),
  generation_type text not null default 'manual' check (generation_type in ('automatic', 'manual', 'bulk')),
  notes text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (beat_plan_id, plan_date)
);
create index idx_daily_visit_plans_company_date on daily_visit_plans(company_id, plan_date);
create index idx_daily_visit_plans_status on daily_visit_plans(company_id, status);

alter table daily_visit_plans enable row level security;
create policy daily_visit_plans_isolation on daily_visit_plans for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_daily_visit_plans_updated_at before update on daily_visit_plans
  for each row execute function set_updated_at();

create table daily_visit_plan_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  employee_id uuid not null references app_users(id) on delete cascade,
  role_code text not null check (role_code in ('driver', 'salesman', 'collector', 'helper', 'supervisor', 'manager', 'stock_keeper', 'custom')),
  is_primary boolean not null default false,
  is_supervisor boolean not null default false,
  is_route_executor boolean not null default false,
  created_at timestamptz not null default now(),
  unique (plan_id, employee_id, role_code)
);
create index idx_daily_visit_plan_employees_plan on daily_visit_plan_employees(plan_id);

alter table daily_visit_plan_employees enable row level security;
create policy daily_visit_plan_employees_isolation on daily_visit_plan_employees for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table daily_visit_plan_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  sequence integer not null default 0,
  original_sequence integer not null default 0,
  scheduled_time time,
  estimated_arrival_time time,
  expected_duration_minutes integer,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assigned_employee_id uuid references app_users(id) on delete set null,
  special_instructions text,
  plan_notes text,
  visit_status text not null default 'pending' check (visit_status in (
    'pending', 'ready', 'in_progress', 'completed', 'missed', 'skipped',
    'cancelled', 'rescheduled', 'unplanned', 'not_applicable'
  )),
  is_unplanned boolean not null default false,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  unique (plan_id, customer_id)
);
create index idx_daily_visit_plan_items_plan on daily_visit_plan_items(plan_id, sequence);
create index idx_daily_visit_plan_items_customer on daily_visit_plan_items(customer_id);

alter table daily_visit_plan_items enable row level security;
create policy daily_visit_plan_items_isolation on daily_visit_plan_items for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table daily_visit_plan_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  old_status text, new_status text not null, reason text,
  changed_by uuid references app_users(id), changed_at timestamptz not null default now()
);
alter table daily_visit_plan_status_history enable row level security;
create policy daily_visit_plan_status_history_isolation on daily_visit_plan_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table daily_visit_plan_approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  action text not null check (action in ('submit', 'approve', 'reject', 'return_for_correction', 'resubmit', 'cancel')),
  requested_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  rejected_by uuid references app_users(id),
  reason text,
  notes text,
  created_at timestamptz not null default now()
);
alter table daily_visit_plan_approval_history enable row level security;
create policy daily_visit_plan_approval_history_isolation on daily_visit_plan_approval_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function change_daily_plan_status(p_plan_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old text;
  v_company_id uuid;
  v_valid boolean := false;
begin
  select status, company_id into v_old, v_company_id from daily_visit_plans where id = p_plan_id;
  if v_old is null then raise exception 'Plan not found'; end if;

  v_valid := case v_old
    when 'draft' then p_new_status in ('generated', 'cancelled')
    when 'generated' then p_new_status in ('pending_approval', 'approved', 'cancelled')
    when 'pending_approval' then p_new_status in ('approved', 'draft', 'cancelled')
    when 'approved' then p_new_status in ('ready', 'cancelled')
    when 'ready' then p_new_status in ('started', 'cancelled')
    when 'started' then p_new_status in ('paused', 'completed', 'partially_completed')
    when 'paused' then p_new_status in ('started', 'completed', 'partially_completed', 'cancelled')
    when 'completed' then p_new_status in ('closed')
    when 'partially_completed' then p_new_status in ('closed')
    when 'closed' then false
    when 'cancelled' then false
    else false
  end;

  if not v_valid then raise exception 'Cannot move plan from % to %', v_old, p_new_status; end if;

  update daily_visit_plans set status = p_new_status, updated_by = auth.uid(), updated_at = now() where id = p_plan_id;
  insert into daily_visit_plan_status_history (company_id, plan_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_plan_id, v_old, p_new_status, p_reason, auth.uid());
end;
$$;
grant execute on function change_daily_plan_status(uuid, text, text) to authenticated;

create or replace function submit_daily_plan(p_plan_id uuid, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  if not has_permission('route_execution:edit_plans') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from daily_visit_plans where id = p_plan_id;
  perform change_daily_plan_status(p_plan_id, 'pending_approval', p_notes);
  insert into daily_visit_plan_approval_history (company_id, plan_id, action, requested_by, notes)
  values (v_company_id, p_plan_id, 'submit', auth.uid(), p_notes);
end;
$$;
grant execute on function submit_daily_plan(uuid, text) to authenticated;

create or replace function decide_daily_plan(p_plan_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  if not has_permission('route_execution:approve_plans') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from daily_visit_plans where id = p_plan_id;
  perform change_daily_plan_status(p_plan_id, case when p_approve then 'approved' else 'draft' end, p_reason);
  insert into daily_visit_plan_approval_history (company_id, plan_id, action, approved_by, rejected_by, reason)
  values (v_company_id, p_plan_id, case when p_approve then 'approve' else 'reject' end,
    case when p_approve then auth.uid() end, case when not p_approve then auth.uid() end, p_reason);
end;
$$;
grant execute on function decide_daily_plan(uuid, boolean, text) to authenticated;

create or replace function generate_daily_visit_plan(p_beat_plan_id uuid, p_plan_date date)
returns uuid language plpgsql security definer as $$
declare
  v_plan beat_plans%rowtype;
  v_company_id uuid := current_company_id();
  v_plan_id uuid;
  v_has_schedule_date boolean;
  v_assignment record;
  v_seq integer := 1;
begin
  if not has_permission('route_execution:generate_plans') then raise exception 'Not permitted'; end if;

  select * into v_plan from beat_plans where id = p_beat_plan_id and company_id = v_company_id;
  if not found then raise exception 'Beat plan not found'; end if;

  if v_plan.status != 'active' then raise exception 'Beat plan is % — only active beat plans can generate visits', v_plan.status; end if;
  if p_plan_date < v_plan.effective_from or (v_plan.effective_to is not null and p_plan_date > v_plan.effective_to) then
    raise exception 'Date is outside the beat plan''s effective range';
  end if;

  select exists (
    select 1 from beat_plan_schedule_dates where beat_plan_id = p_beat_plan_id and visit_date = p_plan_date and status != 'skipped'
  ) into v_has_schedule_date;
  if not v_has_schedule_date then raise exception 'This date is not a scheduled visit date for this beat plan'; end if;

  insert into daily_visit_plans (
    company_id, plan_date, branch_id, territory_id, route_id, beat_plan_id, van_id,
    expected_duration_minutes, planned_start_time, planned_end_time, status, generation_type, created_by, updated_by
  ) values (
    v_company_id, p_plan_date, v_plan.branch_id, v_plan.territory_id, v_plan.route_id, p_beat_plan_id, v_plan.default_van_id,
    v_plan.expected_route_duration_minutes, v_plan.expected_start_time, v_plan.expected_end_time, 'generated', 'automatic', auth.uid(), auth.uid()
  ) returning id into v_plan_id;

  insert into daily_visit_plan_employees (company_id, plan_id, employee_id, role_code, is_primary, is_route_executor)
  select v_company_id, v_plan_id, vsa.employee_id, vsa.role_code, vsa.is_primary, (vsa.role_code in ('driver', 'salesman'))
  from van_staff_assignments vsa
  where vsa.van_id = v_plan.default_van_id and vsa.status = 'active'
  on conflict (plan_id, employee_id, role_code) do nothing;

  update daily_visit_plans set primary_employee_id = (
    select employee_id from daily_visit_plan_employees where plan_id = v_plan_id and is_primary limit 1
  ) where id = v_plan_id;

  for v_assignment in
    select bpca.*, c.status as customer_status, c.business_name
    from beat_plan_customer_assignments bpca
    join customers c on c.id = bpca.customer_id
    where bpca.beat_plan_id = p_beat_plan_id and bpca.is_active
      and (bpca.end_date is null or bpca.end_date >= p_plan_date) and bpca.start_date <= p_plan_date
    order by bpca.visit_sequence
  loop
    if v_assignment.customer_status not in ('active') then
      insert into daily_visit_plan_items (
        company_id, plan_id, customer_id, sequence, original_sequence, visit_status, exclusion_reason
      ) values (
        v_company_id, v_plan_id, v_assignment.customer_id, v_seq, v_assignment.visit_sequence, 'not_applicable',
        'Customer status is ' || v_assignment.customer_status
      );
    else
      insert into daily_visit_plan_items (
        company_id, plan_id, customer_id, sequence, original_sequence, scheduled_time,
        expected_duration_minutes, priority, assigned_employee_id, special_instructions, visit_status
      ) values (
        v_company_id, v_plan_id, v_assignment.customer_id, v_seq, v_assignment.visit_sequence, v_assignment.preferred_visit_start_time,
        v_assignment.expected_visit_duration_minutes, v_assignment.priority, null, v_assignment.special_instructions, 'pending'
      );
    end if;
    v_seq := v_seq + 1;
  end loop;

  return v_plan_id;
end;
$$;
grant execute on function generate_daily_visit_plan(uuid, date) to authenticated;

drop trigger if exists trg_audit_daily_visit_plans on daily_visit_plans;
create trigger trg_audit_daily_visit_plans after insert or update or delete on daily_visit_plans
  for each row execute function log_audit_change();
