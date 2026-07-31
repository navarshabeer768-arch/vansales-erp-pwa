-- ============================================================================
-- 0036_customer_credit.sql
-- Customer Credit & Payment Management (Phase 4A.2 Part 1).
--
-- customers.credit_limit/outstanding_balance have existed since Phase 1 and
-- are actively read/written by Collections, the legacy quick-create hook,
-- and the Customer Profile Overview tab. Rather than duplicating credit
-- data across two places, customer_credit_profiles becomes the new
-- authoritative source for credit_limit going forward; a sync trigger
-- keeps customers.credit_limit mirrored so none of those existing screens
-- need to change. outstanding_balance stays exactly where it is — every
-- RPC that reads/writes it (record collections, returns, sales) keeps
-- working unmodified.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PAYMENT METHODS — configurable, system defaults + per-company custom.
-- ---------------------------------------------------------------------------
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_payment_methods_system_code on payment_methods(code) where company_id is null;
create unique index idx_payment_methods_company_code on payment_methods(code, company_id) where company_id is not null;

insert into payment_methods (code, company_id, label, is_system) values
  ('cash', null, 'Cash', true),
  ('card', null, 'Card', true),
  ('bank_transfer', null, 'Bank Transfer', true),
  ('cheque', null, 'Cheque', true),
  ('online', null, 'Online Payment', true),
  ('wallet', null, 'Wallet', true),
  ('credit_account', null, 'Credit Account', true);

alter table payment_methods enable row level security;
create policy payment_methods_select on payment_methods for select
  using (company_id is null or company_id = current_company_id());
create policy payment_methods_write on payment_methods for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id() and has_permission('settings:edit'));

-- ---------------------------------------------------------------------------
-- PAYMENT TERMS — configurable, system defaults + per-company custom.
-- ---------------------------------------------------------------------------
create table payment_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  credit_days integer not null default 0,
  grace_days integer not null default 0,
  allowed_payment_method_codes text[] not null default '{}',
  advance_payment_pct numeric(5,2) not null default 0,
  late_payment_rule text,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_payment_terms_system_code on payment_terms(code) where company_id is null;
create unique index idx_payment_terms_company_code on payment_terms(code, company_id) where company_id is not null;

insert into payment_terms (code, company_id, label, credit_days, grace_days, is_system) values
  ('immediate', null, 'Immediate', 0, 0, true),
  ('cash', null, 'Cash', 0, 0, true),
  ('net7', null, '7 Days', 7, 0, true),
  ('net15', null, '15 Days', 15, 0, true),
  ('net30', null, '30 Days', 30, 0, true),
  ('net45', null, '45 Days', 45, 0, true),
  ('net60', null, '60 Days', 60, 0, true);

alter table payment_terms enable row level security;
create policy payment_terms_select on payment_terms for select
  using (company_id is null or company_id = current_company_id());
create policy payment_terms_write on payment_terms for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id() and has_permission('settings:edit'));

-- ---------------------------------------------------------------------------
-- RISK LEVELS — configurable, system defaults + per-company custom.
-- ---------------------------------------------------------------------------
create table customer_risk_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  company_id uuid references companies(id) on delete cascade,
  label text not null,
  severity integer not null default 0, -- higher = riskier, used for sorting/approval escalation
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index idx_risk_levels_system_code on customer_risk_levels(code) where company_id is null;
create unique index idx_risk_levels_company_code on customer_risk_levels(code, company_id) where company_id is not null;

insert into customer_risk_levels (code, company_id, label, severity, is_system) values
  ('low', null, 'Low', 1, true),
  ('medium', null, 'Medium', 2, true),
  ('high', null, 'High', 3, true),
  ('critical', null, 'Critical', 4, true);

alter table customer_risk_levels enable row level security;
create policy customer_risk_levels_select on customer_risk_levels for select
  using (company_id is null or company_id = current_company_id());
create policy customer_risk_levels_write on customer_risk_levels for all
  using (company_id = current_company_id() and has_permission('settings:edit'))
  with check (company_id = current_company_id() and has_permission('settings:edit'));

-- ---------------------------------------------------------------------------
-- CUSTOMER CREDIT PROFILES — one per customer.
-- ---------------------------------------------------------------------------
create table customer_credit_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  credit_type text not null default 'cash' check (credit_type in ('cash', 'credit', 'hybrid')),
  credit_status text not null default 'normal' check (credit_status in
    ('normal', 'warning', 'near_limit', 'over_limit', 'blocked', 'suspended', 'inactive')),
  credit_limit numeric(14,2) not null default 0,
  temporary_credit_limit numeric(14,2),
  temporary_credit_expiry date,
  credit_days integer not null default 0,
  grace_days integer not null default 0,
  risk_level_id uuid references customer_risk_levels(id) on delete set null,
  default_payment_term_id uuid references payment_terms(id) on delete set null,
  allow_partial_payments boolean not null default true,
  require_approval boolean not null default false,
  require_manager_approval boolean not null default false,
  block_on_overdue boolean not null default true,
  block_on_credit_limit boolean not null default true,
  maximum_outstanding numeric(14,2),
  maximum_pending_orders integer,
  maximum_pending_deliveries integer,
  credit_notes text,
  is_manually_blocked boolean not null default false,
  manual_block_reason text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id)
);
create index idx_customer_credit_profiles_company on customer_credit_profiles(company_id, credit_status);

alter table customer_credit_profiles enable row level security;
create policy customer_credit_profiles_isolation on customer_credit_profiles for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create trigger trg_customer_credit_profiles_updated_at before update on customer_credit_profiles
  for each row execute function set_updated_at();

-- Keep the legacy customers.credit_limit column in sync so every existing
-- screen that reads it (Collections, Customer Profile Overview, the legacy
-- quick-create hook) keeps working unchanged. customer_credit_profiles is
-- authoritative from here on; customers.credit_limit is a read-only mirror.
create or replace function sync_customer_credit_limit()
returns trigger language plpgsql security definer as $$
begin
  update customers set credit_limit = coalesce(new.temporary_credit_limit, new.credit_limit) where id = new.customer_id;
  return new;
end;
$$;

drop trigger if exists trg_sync_customer_credit_limit on customer_credit_profiles;
create trigger trg_sync_customer_credit_limit after insert or update on customer_credit_profiles
  for each row execute function sync_customer_credit_limit();

-- Every customer gets a credit profile automatically — "one credit profile
-- per customer" is a guarantee, not something the UI has to remember to do.
create or replace function create_default_credit_profile()
returns trigger language plpgsql security definer as $$
begin
  insert into customer_credit_profiles (company_id, customer_id, credit_limit)
  values (new.company_id, new.id, coalesce(new.credit_limit, 0))
  on conflict (customer_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_default_credit_profile on customers;
create trigger trg_create_default_credit_profile after insert on customers
  for each row execute function create_default_credit_profile();

-- Backfill profiles for every customer that already existed before this migration.
insert into customer_credit_profiles (company_id, customer_id, credit_limit)
select company_id, id, coalesce(credit_limit, 0) from customers
on conflict (customer_id) do nothing;

-- ---------------------------------------------------------------------------
-- CREDIT / STATUS / TYPE HISTORY — every change is logged, not overwritten.
-- ---------------------------------------------------------------------------
create table customer_credit_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  field_name text not null, -- 'credit_limit' | 'credit_type' | 'risk_level_id' | 'default_payment_term_id' | ...
  old_value text,
  new_value text,
  reason text,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_customer_credit_history_customer on customer_credit_history(customer_id, changed_at desc);

alter table customer_credit_history enable row level security;
create policy customer_credit_history_isolation on customer_credit_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table customer_credit_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  old_status text,
  new_status text not null,
  reason text,
  changed_by uuid references app_users(id),
  changed_at timestamptz not null default now()
);
create index idx_customer_credit_status_history_customer on customer_credit_status_history(customer_id, changed_at desc);

alter table customer_credit_status_history enable row level security;
create policy customer_credit_status_history_isolation on customer_credit_status_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Manual/manager/admin block-unblock, and switching Cash <-> Credit <-> Hybrid
-- (both require a permission and both leave a history trail).
create or replace function set_customer_credit_status(p_customer_id uuid, p_new_status text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old_status text;
  v_company_id uuid;
begin
  if not has_permission('customer_credit:edit') then raise exception 'Not permitted'; end if;

  select credit_status, company_id into v_old_status, v_company_id from customer_credit_profiles where customer_id = p_customer_id;
  if v_old_status is null then raise exception 'Credit profile not found'; end if;

  update customer_credit_profiles set
    credit_status = p_new_status,
    is_manually_blocked = (p_new_status in ('blocked', 'suspended')),
    manual_block_reason = case when p_new_status in ('blocked', 'suspended') then p_reason else null end,
    updated_by = auth.uid()
  where customer_id = p_customer_id;

  insert into customer_credit_status_history (company_id, customer_id, old_status, new_status, reason, changed_by)
  values (v_company_id, p_customer_id, v_old_status, p_new_status, p_reason, auth.uid());
end;
$$;

grant execute on function set_customer_credit_status(uuid, text, text) to authenticated;

create or replace function change_customer_credit_type(p_customer_id uuid, p_new_type text, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_old_type text;
  v_company_id uuid;
begin
  if not has_permission('customer_credit:edit') then raise exception 'Not permitted'; end if;

  select credit_type, company_id into v_old_type, v_company_id from customer_credit_profiles where customer_id = p_customer_id;
  if v_old_type is null then raise exception 'Credit profile not found'; end if;

  update customer_credit_profiles set credit_type = p_new_type, updated_by = auth.uid() where customer_id = p_customer_id;

  insert into customer_credit_history (company_id, customer_id, field_name, old_value, new_value, reason, changed_by)
  values (v_company_id, p_customer_id, 'credit_type', v_old_type, p_new_type, p_reason, auth.uid());
end;
$$;

grant execute on function change_customer_credit_type(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- APPROVAL WORKFLOW — structured requests with typed old/new values, distinct
-- from the generic approval_history action log (Phase 3B.2): a credit
-- increase or temporary credit request needs an actual before/after number
-- to approve against, which that generic log was never designed to hold.
-- ---------------------------------------------------------------------------
create table customer_credit_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  request_type text not null check (request_type in ('credit_increase', 'temporary_credit', 'risk_change', 'customer_type_change')),
  old_value text,
  new_value text,
  reason text,
  expiry_date date, -- used for temporary_credit requests
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled', 'expired')),
  requested_by uuid references app_users(id),
  approved_by uuid references app_users(id),
  rejected_by uuid references app_users(id),
  decision_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index idx_customer_credit_approvals_customer on customer_credit_approvals(customer_id, status);
create index idx_customer_credit_approvals_company_status on customer_credit_approvals(company_id, status);

alter table customer_credit_approvals enable row level security;
create policy customer_credit_approvals_isolation on customer_credit_approvals for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Widen the existing approval_history entity_type (Phase 3B.2) so credit
-- approvals get logged into the same shared action-log table other
-- approval workflows already use, instead of a parallel log.
alter table approval_history drop constraint if exists approval_history_entity_type_check;
alter table approval_history add constraint approval_history_entity_type_check check (entity_type in
  ('van_loading', 'van_unloading', 'warehouse_transfer', 'van_transfer', 'customer_credit'));

create or replace function submit_credit_approval(
  p_customer_id uuid, p_request_type text, p_new_value text, p_reason text default null, p_expiry_date date default null
) returns uuid language plpgsql security definer as $$
declare
  v_company_id uuid := current_company_id();
  v_id uuid;
  v_old_value text;
begin
  if not has_permission('customer_credit:edit') then raise exception 'Not permitted'; end if;

  select case p_request_type
    when 'credit_increase' then credit_limit::text
    when 'temporary_credit' then temporary_credit_limit::text
    when 'risk_change' then risk_level_id::text
    when 'customer_type_change' then credit_type
  end into v_old_value
  from customer_credit_profiles where customer_id = p_customer_id;

  insert into customer_credit_approvals (company_id, customer_id, request_type, old_value, new_value, reason, expiry_date, status, requested_by)
  values (v_company_id, p_customer_id, p_request_type, v_old_value, p_new_value, p_reason, p_expiry_date, 'pending', auth.uid())
  returning id into v_id;

  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (v_company_id, 'customer_credit', v_id, 'submit', p_reason, auth.uid());

  return v_id;
end;
$$;

grant execute on function submit_credit_approval(uuid, text, text, text, date) to authenticated;

create or replace function decide_credit_approval(p_approval_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_approval customer_credit_approvals%rowtype;
begin
  if not has_permission('customer_credit:approve') then raise exception 'Not permitted'; end if;

  select * into v_approval from customer_credit_approvals where id = p_approval_id and status = 'pending';
  if not found then raise exception 'Approval request not found or already decided'; end if;

  if p_approve then
    if v_approval.request_type = 'credit_increase' then
      update customer_credit_profiles set credit_limit = v_approval.new_value::numeric, updated_by = auth.uid() where customer_id = v_approval.customer_id;
      insert into customer_credit_history (company_id, customer_id, field_name, old_value, new_value, reason, changed_by)
      values (v_approval.company_id, v_approval.customer_id, 'credit_limit', v_approval.old_value, v_approval.new_value, p_reason, auth.uid());
    elsif v_approval.request_type = 'temporary_credit' then
      update customer_credit_profiles set temporary_credit_limit = v_approval.new_value::numeric,
        temporary_credit_expiry = v_approval.expiry_date, updated_by = auth.uid()
      where customer_id = v_approval.customer_id;
      insert into customer_credit_history (company_id, customer_id, field_name, old_value, new_value, reason, changed_by)
      values (v_approval.company_id, v_approval.customer_id, 'temporary_credit_limit', v_approval.old_value, v_approval.new_value, p_reason, auth.uid());
    elsif v_approval.request_type = 'risk_change' then
      update customer_credit_profiles set risk_level_id = v_approval.new_value::uuid, updated_by = auth.uid() where customer_id = v_approval.customer_id;
      insert into customer_credit_history (company_id, customer_id, field_name, old_value, new_value, reason, changed_by)
      values (v_approval.company_id, v_approval.customer_id, 'risk_level_id', v_approval.old_value, v_approval.new_value, p_reason, auth.uid());
    elsif v_approval.request_type = 'customer_type_change' then
      update customer_credit_profiles set credit_type = v_approval.new_value, updated_by = auth.uid() where customer_id = v_approval.customer_id;
      insert into customer_credit_history (company_id, customer_id, field_name, old_value, new_value, reason, changed_by)
      values (v_approval.company_id, v_approval.customer_id, 'credit_type', v_approval.old_value, v_approval.new_value, p_reason, auth.uid());
    end if;
  end if;

  update customer_credit_approvals set
    status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = case when p_approve then auth.uid() else null end,
    rejected_by = case when not p_approve then auth.uid() else null end,
    decision_reason = p_reason, decided_at = now()
  where id = p_approval_id;

  insert into approval_history (company_id, entity_type, entity_id, action, notes, performed_by)
  values (v_approval.company_id, 'customer_credit', p_approval_id, case when p_approve then 'approve' else 'reject' end, p_reason, auth.uid());
end;
$$;

grant execute on function decide_credit_approval(uuid, boolean, text) to authenticated;

create or replace function cancel_credit_approval(p_approval_id uuid)
returns void language plpgsql security definer as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from customer_credit_approvals where id = p_approval_id and status = 'pending';
  if v_company_id is null then raise exception 'Approval request not found or already decided'; end if;

  update customer_credit_approvals set status = 'cancelled' where id = p_approval_id;
  insert into approval_history (company_id, entity_type, entity_id, action, performed_by)
  values (v_company_id, 'customer_credit', p_approval_id, 'cancel', auth.uid());
end;
$$;

grant execute on function cancel_credit_approval(uuid) to authenticated;

-- Expired pending requests (e.g. a temporary-credit request nobody actioned
-- before its own requested expiry date) — computed on demand, same honest
-- pattern as refresh_vehicle_alerts() from an earlier phase: there is no
-- background server here to run a real cron.
create or replace function expire_stale_credit_approvals()
returns integer language plpgsql security definer as $$
declare v_count integer;
begin
  update customer_credit_approvals set status = 'expired'
  where company_id = current_company_id() and status = 'pending' and expiry_date is not null and expiry_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function expire_stale_credit_approvals() to authenticated;

-- Automatically restores the original limit once a temporary credit expires.
create or replace function expire_temporary_credits()
returns integer language plpgsql security definer as $$
declare v_count integer;
begin
  update customer_credit_profiles set temporary_credit_limit = null, temporary_credit_expiry = null
  where company_id = current_company_id() and temporary_credit_expiry is not null and temporary_credit_expiry < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function expire_temporary_credits() to authenticated;

-- ---------------------------------------------------------------------------
-- AVAILABLE CREDIT + VALIDATION ENGINE — the reusable service every future
-- sales module must call rather than re-deriving these numbers itself.
-- pending_orders/reserved_credit resolve to 0 today (no Sales Orders module
-- exists yet — explicitly out of scope for this phase) but the function
-- shape already accounts for them so nothing has to change when that
-- module arrives; that's what "future modules must use this calculation,
-- do not hardcode values" means in practice.
-- ---------------------------------------------------------------------------
create or replace function customer_available_credit(p_customer_id uuid)
returns numeric language plpgsql stable as $$
declare
  v_profile customer_credit_profiles%rowtype;
  v_outstanding numeric;
  v_effective_limit numeric;
  v_pending_orders numeric := 0; -- no Sales Orders module yet — reserved for when one exists
  v_reserved_credit numeric := 0; -- no reservation concept yet — reserved for when one exists
begin
  select * into v_profile from customer_credit_profiles where customer_id = p_customer_id;
  if not found then return 0; end if;

  select outstanding_balance into v_outstanding from customers where id = p_customer_id;

  v_effective_limit := case
    when v_profile.temporary_credit_limit is not null and v_profile.temporary_credit_expiry >= current_date
    then greatest(v_profile.credit_limit, v_profile.temporary_credit_limit)
    else v_profile.credit_limit
  end;

  return v_effective_limit - coalesce(v_outstanding, 0) - v_pending_orders - v_reserved_credit;
end;
$$;

grant execute on function customer_available_credit(uuid) to authenticated;

-- Recomputes credit_status from live data (outstanding vs limit, overdue
-- balances, expired temporary credit) — called on demand from the Credit
-- Dashboard, same honest "no real cron" pattern used throughout this app.
create or replace function refresh_customer_credit_status(p_customer_id uuid)
returns text language plpgsql security definer as $$
declare
  v_profile customer_credit_profiles%rowtype;
  v_available numeric;
  v_has_overdue boolean;
  v_new_status text;
begin
  select * into v_profile from customer_credit_profiles where customer_id = p_customer_id;
  if not found then return null; end if;

  -- Manual/manager/admin blocks always take precedence over the computed status.
  if v_profile.is_manually_blocked then return v_profile.credit_status; end if;

  v_available := customer_available_credit(p_customer_id);

  select exists (
    select 1 from sales s
    join payment_terms pt on pt.id = v_profile.default_payment_term_id
    where s.customer_id = p_customer_id and s.balance_amount > 0
      and s.created_at::date + (pt.credit_days + pt.grace_days) < current_date
  ) into v_has_overdue;

  if v_has_overdue and v_profile.block_on_overdue then
    v_new_status := 'blocked';
  elsif v_available < 0 and v_profile.block_on_credit_limit then
    v_new_status := 'blocked';
  elsif v_available < 0 then
    v_new_status := 'over_limit';
  elsif v_profile.credit_limit > 0 and v_available <= v_profile.credit_limit * 0.1 then
    v_new_status := 'near_limit';
  elsif v_has_overdue then
    v_new_status := 'warning';
  else
    v_new_status := 'normal';
  end if;

  if v_new_status is distinct from v_profile.credit_status then
    update customer_credit_profiles set credit_status = v_new_status where customer_id = p_customer_id;
    insert into customer_credit_status_history (company_id, customer_id, old_status, new_status, reason, changed_by)
    values (v_profile.company_id, p_customer_id, v_profile.credit_status, v_new_status, 'Auto-calculated', null);
  end if;

  return v_new_status;
end;
$$;

grant execute on function refresh_customer_credit_status(uuid) to authenticated;

-- Bulk refresh for the whole company (Credit Dashboard load) — also expires
-- stale temporary credit and stale pending approvals in the same pass.
create or replace function refresh_all_customer_credit_statuses()
returns integer language plpgsql security definer as $$
declare
  v_customer_id uuid;
  v_count integer := 0;
begin
  perform expire_temporary_credits();
  perform expire_stale_credit_approvals();

  for v_customer_id in select customer_id from customer_credit_profiles where company_id = current_company_id() loop
    perform refresh_customer_credit_status(v_customer_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function refresh_all_customer_credit_statuses() to authenticated;

-- THE reusable validation service — every future sales module calls this
-- instead of re-deriving these checks. Returns one row per failed check;
-- an empty result means the sale is allowed to proceed.
create or replace function validate_customer_credit(p_customer_id uuid, p_order_amount numeric default 0)
returns table (check_name text, passed boolean, message text) language plpgsql stable as $$
declare
  v_customer customers%rowtype;
  v_profile customer_credit_profiles%rowtype;
  v_available numeric;
begin
  select * into v_customer from customers where id = p_customer_id;
  select * into v_profile from customer_credit_profiles where customer_id = p_customer_id;

  check_name := 'customer_active'; passed := (v_customer.status = 'active'); message := 'Customer is not active';
  return next;

  if v_profile.id is null then
    check_name := 'credit_profile'; passed := false; message := 'No credit profile found';
    return next;
    return;
  end if;

  check_name := 'credit_status';
  passed := v_profile.credit_status not in ('blocked', 'suspended');
  message := 'Customer credit status is ' || v_profile.credit_status;
  return next;

  if v_profile.credit_type != 'cash' and p_order_amount > 0 then
    v_available := customer_available_credit(p_customer_id);
    check_name := 'available_credit';
    passed := v_available >= p_order_amount;
    message := format('Available credit %.2f is less than order amount %.2f', v_available, p_order_amount);
    return next;
  end if;

  if v_profile.maximum_outstanding is not null then
    check_name := 'maximum_outstanding';
    passed := coalesce(v_customer.outstanding_balance, 0) + p_order_amount <= v_profile.maximum_outstanding;
    message := 'Maximum outstanding balance would be exceeded';
    return next;
  end if;

  if v_profile.temporary_credit_limit is not null then
    check_name := 'temporary_credit_valid';
    passed := v_profile.temporary_credit_expiry is null or v_profile.temporary_credit_expiry >= current_date;
    message := 'Temporary credit has expired';
    return next;
  end if;

  return;
end;
$$;

grant execute on function validate_customer_credit(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- PERMISSIONS — new 'customer_credit' module.
-- ---------------------------------------------------------------------------
insert into permissions (module, action, description)
select 'customer_credit', a, 'Customer credit: ' || a
from unnest(array[
  'view', 'edit', 'approve', 'reject', 'temporary_credit', 'override',
  'block', 'unblock', 'view_reports', 'export_reports'
]) as a
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.module = 'customer_credit'
where r.code in ('company_admin', 'super_admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- AUDIT LOG — reuse the generic trigger from Phase 4A.1, not a new one.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_audit_customer_credit_profiles on customer_credit_profiles;
create trigger trg_audit_customer_credit_profiles after insert or update or delete on customer_credit_profiles
  for each row execute function log_audit_change();

drop trigger if exists trg_audit_customer_credit_approvals on customer_credit_approvals;
create trigger trg_audit_customer_credit_approvals after insert or update or delete on customer_credit_approvals
  for each row execute function log_audit_change();
