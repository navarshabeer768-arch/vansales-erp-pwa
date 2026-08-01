-- ============================================================================
-- 0040_route_execution_sessions.sql
-- Route Execution (Phase 5A.1 Part 1, final). Continues 0038 and 0039.
-- ============================================================================

create table route_execution_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  van_operation_id uuid references daily_van_operations(id) on delete set null,
  device_id uuid references devices(id) on delete set null,
  started_by uuid references app_users(id),
  start_time timestamptz,
  start_latitude numeric(9,6),
  start_longitude numeric(9,6),
  start_odometer numeric(10,1),
  was_offline_at_start boolean not null default false,
  current_item_index integer not null default 0,
  end_time timestamptz,
  end_latitude numeric(9,6),
  end_longitude numeric(9,6),
  end_odometer numeric(10,1),
  total_pause_minutes integer not null default 0,
  completion_pct numeric(5,2) not null default 0,
  closing_notes text,
  ended_by uuid references app_users(id),
  early_closure_reason text,
  early_closure_approved_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (plan_id)
);
create index idx_route_execution_sessions_van_op on route_execution_sessions(van_operation_id);

alter table route_execution_sessions enable row level security;
create policy route_execution_sessions_isolation on route_execution_sessions for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table route_pause_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  session_id uuid not null references route_execution_sessions(id) on delete cascade,
  reason text not null check (reason in ('break', 'fuel', 'vehicle_issue', 'personal_emergency', 'warehouse_return', 'manager_instruction', 'other')),
  notes text,
  paused_by uuid references app_users(id),
  pause_time timestamptz not null default now(),
  resume_time timestamptz,
  duration_minutes integer
);
create index idx_route_pause_logs_session on route_pause_logs(session_id);

alter table route_pause_logs enable row level security;
create policy route_pause_logs_isolation on route_pause_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table route_deviation_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  session_id uuid not null references route_execution_sessions(id) on delete cascade,
  deviation_type text not null check (deviation_type in (
    'out_of_sequence', 'outside_route', 'unplanned_stop', 'long_idle', 'late_start',
    'early_end', 'excessive_duration', 'plan_changed'
  )),
  description text,
  detected_at timestamptz not null default now()
);
create index idx_route_deviation_logs_session on route_deviation_logs(session_id);

alter table route_deviation_logs enable row level security;
create policy route_deviation_logs_isolation on route_deviation_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function start_route_execution(
  p_plan_id uuid, p_opening_odometer numeric, p_opening_cash numeric default 0,
  p_latitude numeric default null, p_longitude numeric default null,
  p_device_uid text default null, p_is_offline boolean default false
) returns uuid language plpgsql security definer as $$
declare
  v_plan daily_visit_plans%rowtype;
  v_van_op_id uuid;
  v_session_id uuid;
  v_device_id uuid;
begin
  if not has_permission('route_execution:start_route') then raise exception 'Not permitted'; end if;

  select * into v_plan from daily_visit_plans where id = p_plan_id and company_id = current_company_id();
  if not found then raise exception 'Plan not found'; end if;
  if v_plan.status not in ('approved', 'ready') then raise exception 'Plan must be Approved or Ready to start (currently %)', v_plan.status; end if;
  if v_plan.van_id is null then raise exception 'No van assigned to this plan'; end if;

  if p_device_uid is not null then
    select id into v_device_id from devices where company_id = v_plan.company_id and device_uid = p_device_uid;
  end if;

  v_van_op_id := start_daily_operation(v_plan.van_id, v_plan.route_id, p_opening_odometer, p_opening_cash, null, null);

  insert into route_execution_sessions (
    company_id, plan_id, van_operation_id, device_id, started_by, start_time,
    start_latitude, start_longitude, start_odometer, was_offline_at_start
  ) values (
    v_plan.company_id, p_plan_id, v_van_op_id, v_device_id, auth.uid(), now(),
    p_latitude, p_longitude, p_opening_odometer, p_is_offline
  ) returning id into v_session_id;

  perform change_daily_plan_status(p_plan_id, 'started', 'Route started');
  update daily_visit_plan_items set visit_status = 'ready' where plan_id = p_plan_id and visit_status = 'pending';

  return v_session_id;
end;
$$;
grant execute on function start_route_execution(uuid, numeric, numeric, numeric, numeric, text, boolean) to authenticated;

create or replace function pause_route_execution(p_plan_id uuid, p_reason text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_session route_execution_sessions%rowtype;
begin
  if not has_permission('route_execution:pause_route') then raise exception 'Not permitted'; end if;
  select * into v_session from route_execution_sessions where plan_id = p_plan_id;
  if not found then raise exception 'No execution session for this plan'; end if;

  perform pause_daily_operation(v_session.van_operation_id);
  perform change_daily_plan_status(p_plan_id, 'paused', p_notes);

  insert into route_pause_logs (company_id, session_id, reason, notes, paused_by)
  values (v_session.company_id, v_session.id, p_reason, p_notes, auth.uid());
end;
$$;
grant execute on function pause_route_execution(uuid, text, text) to authenticated;

create or replace function resume_route_execution(p_plan_id uuid)
returns void language plpgsql security definer as $$
declare
  v_session route_execution_sessions%rowtype;
  v_open_pause route_pause_logs%rowtype;
  v_minutes integer;
begin
  if not has_permission('route_execution:resume_route') then raise exception 'Not permitted'; end if;
  select * into v_session from route_execution_sessions where plan_id = p_plan_id;
  if not found then raise exception 'No execution session for this plan'; end if;

  perform resume_daily_operation(v_session.van_operation_id);
  perform change_daily_plan_status(p_plan_id, 'started', 'Route resumed');

  select * into v_open_pause from route_pause_logs where session_id = v_session.id and resume_time is null order by pause_time desc limit 1;
  if v_open_pause.id is not null then
    v_minutes := extract(epoch from (now() - v_open_pause.pause_time)) / 60;
    update route_pause_logs set resume_time = now(), duration_minutes = v_minutes where id = v_open_pause.id;
    update route_execution_sessions set total_pause_minutes = total_pause_minutes + v_minutes where id = v_session.id;
  end if;
end;
$$;
grant execute on function resume_route_execution(uuid) to authenticated;

create or replace function route_progress(p_plan_id uuid)
returns table (
  total_customers integer, completed integer, pending integer, missed integer,
  skipped integer, rescheduled integer, cancelled integer, unplanned integer, completion_pct numeric
) language plpgsql stable as $$
begin
  select
    count(*) filter (where visit_status != 'not_applicable'),
    count(*) filter (where visit_status = 'completed'),
    count(*) filter (where visit_status in ('pending', 'ready', 'in_progress')),
    count(*) filter (where visit_status = 'missed'),
    count(*) filter (where visit_status = 'skipped'),
    count(*) filter (where visit_status = 'rescheduled'),
    count(*) filter (where visit_status = 'cancelled'),
    count(*) filter (where is_unplanned)
  into total_customers, completed, pending, missed, skipped, rescheduled, cancelled, unplanned
  from daily_visit_plan_items where plan_id = p_plan_id;

  completion_pct := case when total_customers > 0 then round(completed::numeric / total_customers * 100, 1) else 0 end;
  return next;
end;
$$;
grant execute on function route_progress(uuid) to authenticated;

create or replace function end_route_execution(
  p_plan_id uuid, p_closing_odometer numeric, p_closing_cash numeric default 0,
  p_latitude numeric default null, p_longitude numeric default null,
  p_closing_notes text default null, p_early_closure_reason text default null
) returns void language plpgsql security definer as $$
declare
  v_session route_execution_sessions%rowtype;
  v_pending_count integer;
  v_progress record;
begin
  if not has_permission('route_execution:end_route') then raise exception 'Not permitted'; end if;
  select * into v_session from route_execution_sessions where plan_id = p_plan_id;
  if not found then raise exception 'No execution session for this plan'; end if;

  select * into v_progress from route_progress(p_plan_id);
  v_pending_count := v_progress.pending;

  if v_pending_count > 0 and p_early_closure_reason is null then
    raise exception 'This route has % pending customer(s) — a reason is required to end early', v_pending_count;
  end if;

  perform end_daily_operation(v_session.van_operation_id, p_closing_odometer, p_closing_cash, null, p_closing_notes);

  update route_execution_sessions set
    end_time = now(), end_latitude = p_latitude, end_longitude = p_longitude, end_odometer = p_closing_odometer,
    completion_pct = v_progress.completion_pct, closing_notes = p_closing_notes,
    early_closure_reason = p_early_closure_reason, ended_by = auth.uid()
  where id = v_session.id;

  perform change_daily_plan_status(p_plan_id, case when v_pending_count > 0 then 'partially_completed' else 'completed' end, p_closing_notes);

  if v_pending_count > 0 then
    insert into route_deviation_logs (company_id, session_id, deviation_type, description)
    values (v_session.company_id, v_session.id, 'early_end', p_early_closure_reason);
  end if;
end;
$$;
grant execute on function end_route_execution(uuid, numeric, numeric, numeric, numeric, text, text) to authenticated;

create table route_sequence_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  item_id uuid not null references daily_visit_plan_items(id) on delete cascade,
  old_sequence integer not null,
  new_sequence integer not null,
  reason text,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_route_sequence_history_plan on route_sequence_history(plan_id);

alter table route_sequence_history enable row level security;
create policy route_sequence_history_isolation on route_sequence_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function reorder_plan_item(p_item_id uuid, p_new_sequence integer, p_reason text default null)
returns void language plpgsql security definer as $$
declare v_item daily_visit_plan_items%rowtype;
begin
  if not has_permission('route_execution:reorder_customers') then raise exception 'Not permitted'; end if;
  select * into v_item from daily_visit_plan_items where id = p_item_id;
  if not found then raise exception 'Plan item not found'; end if;

  update daily_visit_plan_items set sequence = p_new_sequence where id = p_item_id;
  insert into route_sequence_history (company_id, plan_id, item_id, old_sequence, new_sequence, reason, changed_by)
  values (v_item.company_id, v_item.plan_id, p_item_id, v_item.sequence, p_new_sequence, p_reason, auth.uid());
end;
$$;
grant execute on function reorder_plan_item(uuid, integer, text) to authenticated;

create table route_unplanned_customer_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  log_type text not null default 'unplanned_add' check (log_type in ('unplanned_add', 'skip')),
  reason text,
  notes text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  performed_by uuid references app_users(id),
  reschedule_required boolean not null default false,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'not_required')),
  created_at timestamptz not null default now()
);
create index idx_route_unplanned_customer_logs_plan on route_unplanned_customer_logs(plan_id);

alter table route_unplanned_customer_logs enable row level security;
create policy route_unplanned_customer_logs_isolation on route_unplanned_customer_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function skip_plan_customer(
  p_item_id uuid, p_reason text, p_notes text default null,
  p_latitude numeric default null, p_longitude numeric default null, p_reschedule_required boolean default false
) returns void language plpgsql security definer as $$
declare v_item daily_visit_plan_items%rowtype;
begin
  if not has_permission('route_execution:skip_customer') then raise exception 'Not permitted'; end if;
  select * into v_item from daily_visit_plan_items where id = p_item_id;
  if not found then raise exception 'Plan item not found'; end if;

  update daily_visit_plan_items set visit_status = 'skipped' where id = p_item_id;

  insert into route_unplanned_customer_logs (company_id, plan_id, customer_id, log_type, reason, notes, latitude, longitude, performed_by, reschedule_required)
  values (v_item.company_id, v_item.plan_id, v_item.customer_id, 'skip', p_reason, p_notes, p_latitude, p_longitude, auth.uid(), p_reschedule_required);
end;
$$;
grant execute on function skip_plan_customer(uuid, text, text, numeric, numeric, boolean) to authenticated;

create table route_reschedule_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  original_item_id uuid references daily_visit_plan_items(id) on delete set null,
  customer_id uuid not null references customers(id) on delete cascade,
  new_plan_id uuid references daily_visit_plans(id) on delete set null,
  new_date date not null,
  new_beat_plan_id uuid references beat_plans(id) on delete set null,
  new_route_id uuid references routes(id) on delete set null,
  preferred_time time,
  reason text,
  notes text,
  rescheduled_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_route_reschedule_logs_customer on route_reschedule_logs(customer_id);

alter table route_reschedule_logs enable row level security;
create policy route_reschedule_logs_isolation on route_reschedule_logs for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function reschedule_plan_customer(
  p_item_id uuid, p_new_date date, p_new_beat_plan_id uuid default null, p_new_route_id uuid default null,
  p_preferred_time time default null, p_reason text default null, p_notes text default null
) returns uuid language plpgsql security definer as $$
declare
  v_item daily_visit_plan_items%rowtype;
  v_plan daily_visit_plans%rowtype;
  v_new_plan_id uuid;
  v_log_id uuid;
begin
  if not has_permission('route_execution:reschedule_customer') then raise exception 'Not permitted'; end if;
  select * into v_item from daily_visit_plan_items where id = p_item_id;
  select * into v_plan from daily_visit_plans where id = v_item.plan_id;
  if v_item.id is null then raise exception 'Plan item not found'; end if;

  select id into v_new_plan_id from daily_visit_plans
  where plan_date = p_new_date and (beat_plan_id = coalesce(p_new_beat_plan_id, v_plan.beat_plan_id))
  limit 1;

  if v_new_plan_id is not null then
    insert into daily_visit_plan_items (company_id, plan_id, customer_id, sequence, original_sequence, priority, visit_status)
    select v_item.company_id, v_new_plan_id, v_item.customer_id,
      coalesce((select max(sequence) + 1 from daily_visit_plan_items where plan_id = v_new_plan_id), 1),
      v_item.original_sequence, v_item.priority, 'pending'
    on conflict (plan_id, customer_id) do nothing;
  end if;

  update daily_visit_plan_items set visit_status = 'rescheduled' where id = p_item_id;

  insert into route_reschedule_logs (
    company_id, original_item_id, customer_id, new_plan_id, new_date, new_beat_plan_id, new_route_id,
    preferred_time, reason, notes, rescheduled_by
  ) values (
    v_item.company_id, p_item_id, v_item.customer_id, v_new_plan_id, p_new_date, p_new_beat_plan_id, p_new_route_id,
    p_preferred_time, p_reason, p_notes, auth.uid()
  ) returning id into v_log_id;

  return v_log_id;
end;
$$;
grant execute on function reschedule_plan_customer(uuid, date, uuid, uuid, time, text, text) to authenticated;

create or replace function add_unplanned_customer(
  p_plan_id uuid, p_customer_id uuid, p_reason text, p_latitude numeric default null, p_longitude numeric default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_item_id uuid;
  v_next_seq integer;
begin
  if not has_permission('route_execution:add_unplanned') then raise exception 'Not permitted'; end if;
  select company_id into v_company_id from daily_visit_plans where id = p_plan_id;
  if v_company_id is null then raise exception 'Plan not found'; end if;

  select coalesce(max(sequence), 0) + 1 into v_next_seq from daily_visit_plan_items where plan_id = p_plan_id;

  insert into daily_visit_plan_items (company_id, plan_id, customer_id, sequence, original_sequence, is_unplanned, visit_status)
  values (v_company_id, p_plan_id, p_customer_id, v_next_seq, v_next_seq, true, 'unplanned')
  on conflict (plan_id, customer_id) do nothing
  returning id into v_item_id;

  insert into route_unplanned_customer_logs (company_id, plan_id, customer_id, log_type, reason, latitude, longitude, performed_by)
  values (v_company_id, p_plan_id, p_customer_id, 'unplanned_add', p_reason, p_latitude, p_longitude, auth.uid());

  insert into route_deviation_logs (company_id, session_id, deviation_type, description)
  select v_company_id, res.id, 'unplanned_stop', 'Unplanned customer added: ' || p_reason
  from route_execution_sessions res where res.plan_id = p_plan_id;

  return v_item_id;
end;
$$;
grant execute on function add_unplanned_customer(uuid, uuid, text, numeric, numeric) to authenticated;

create table route_supervisor_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  action_type text not null check (action_type in (
    'approve_plan', 'reject_plan', 'return_for_correction', 'change_employee', 'change_van',
    'add_customer', 'remove_customer', 'change_sequence', 'pause_route', 'request_closure',
    'approve_early_closure', 'transfer_pending', 'reopen_plan'
  )),
  notes text,
  performed_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index idx_route_supervisor_actions_plan on route_supervisor_actions(plan_id);

alter table route_supervisor_actions enable row level security;
create policy route_supervisor_actions_isolation on route_supervisor_actions for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function log_supervisor_action(p_plan_id uuid, p_action_type text, p_notes text default null)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from daily_visit_plans where id = p_plan_id;
  insert into route_supervisor_actions (company_id, plan_id, action_type, notes, performed_by)
  values (v_company_id, p_plan_id, p_action_type, p_notes, auth.uid());
end;
$$;
grant execute on function log_supervisor_action(uuid, text, text) to authenticated;

create table daily_visit_plan_reopen_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  reason text not null,
  requested_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  plan_snapshot jsonb not null,
  reopened_at timestamptz not null default now()
);
alter table daily_visit_plan_reopen_log enable row level security;
create policy daily_visit_plan_reopen_log_isolation on daily_visit_plan_reopen_log for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function reopen_daily_plan(p_plan_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_plan daily_visit_plans%rowtype;
  v_snapshot jsonb;
begin
  if not has_permission('route_execution:reopen_plan') then raise exception 'Not permitted'; end if;

  select * into v_plan from daily_visit_plans where id = p_plan_id;
  if v_plan.status not in ('completed', 'partially_completed', 'closed') then
    raise exception 'Only completed/closed plans can be reopened (currently %)', v_plan.status;
  end if;

  select jsonb_build_object(
    'plan', to_jsonb(dvp), 'items', (select jsonb_agg(to_jsonb(i)) from daily_visit_plan_items i where i.plan_id = p_plan_id)
  ) into v_snapshot from daily_visit_plans dvp where dvp.id = p_plan_id;

  insert into daily_visit_plan_reopen_log (company_id, plan_id, reason, requested_by, approved_by, plan_snapshot)
  values (v_plan.company_id, p_plan_id, p_reason, auth.uid(), auth.uid(), v_snapshot);

  update daily_visit_plans set status = 'approved', updated_by = auth.uid(), updated_at = now() where id = p_plan_id;
  insert into daily_visit_plan_status_history (company_id, plan_id, old_status, new_status, reason, changed_by)
  values (v_plan.company_id, p_plan_id, v_plan.status, 'approved', p_reason, auth.uid());

  perform log_supervisor_action(p_plan_id, 'reopen_plan', p_reason);
end;
$$;
grant execute on function reopen_daily_plan(uuid, text) to authenticated;

create table route_sync_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  plan_id uuid not null references daily_visit_plans(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  status text not null default 'not_downloaded' check (status in (
    'not_downloaded', 'ready_offline', 'pending_upload', 'syncing', 'synced', 'sync_failed', 'conflict'
  )),
  last_error text,
  conflict_details jsonb,
  downloaded_at timestamptz,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (plan_id, device_id)
);

alter table route_sync_status enable row level security;
create policy route_sync_status_isolation on route_sync_status for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function set_route_sync_status(p_plan_id uuid, p_device_uid text, p_status text, p_error text default null)
returns void language plpgsql security definer as $$
declare
  v_company_id uuid;
  v_device_id uuid;
begin
  select company_id into v_company_id from daily_visit_plans where id = p_plan_id;
  select id into v_device_id from devices where company_id = v_company_id and device_uid = p_device_uid;

  insert into route_sync_status (company_id, plan_id, device_id, status, last_error, downloaded_at, last_synced_at)
  values (v_company_id, p_plan_id, v_device_id, p_status, p_error,
    case when p_status = 'ready_offline' then now() end, case when p_status = 'synced' then now() end)
  on conflict (plan_id, device_id) do update set
    status = p_status, last_error = p_error, updated_at = now(),
    downloaded_at = case when p_status = 'ready_offline' then now() else route_sync_status.downloaded_at end,
    last_synced_at = case when p_status = 'synced' then now() else route_sync_status.last_synced_at end;
end;
$$;
grant execute on function set_route_sync_status(uuid, text, text, text) to authenticated;

drop trigger if exists trg_audit_route_execution_sessions on route_execution_sessions;
create trigger trg_audit_route_execution_sessions after insert or update or delete on route_execution_sessions
  for each row execute function log_audit_change();
