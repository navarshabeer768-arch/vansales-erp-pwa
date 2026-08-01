-- ============================================================================
-- 0050_credit_validation_reservation.sql
-- Continues 0047-0049.
--
-- customer_available_credit() (4A.2 Part 1) has carried two placeholder
-- variables since it was written — v_pending_orders and v_reserved_credit,
-- both hardcoded to 0 with a comment reading "no Sales Orders module yet /
-- no reservation concept yet — reserved for when one exists". That module
-- and that concept both exist as of this phase. Wiring them in now rather
-- than leaving the comment stale.
-- ============================================================================

create or replace function customer_available_credit(p_customer_id uuid)
returns numeric language plpgsql stable as $$
declare
  v_profile customer_credit_profiles%rowtype;
  v_outstanding numeric;
  v_effective_limit numeric;
  v_pending_orders numeric := 0;
  v_reserved_credit numeric := 0;
begin
  select * into v_profile from customer_credit_profiles where customer_id = p_customer_id;
  if not found then return 0; end if;

  select outstanding_balance into v_outstanding from customers where id = p_customer_id;

  v_effective_limit := case
    when v_profile.temporary_credit_limit is not null and v_profile.temporary_credit_expiry >= current_date
    then greatest(v_profile.credit_limit, v_profile.temporary_credit_limit)
    else v_profile.credit_limit
  end;

  -- Approved credit-type orders not yet converted and not yet credit-reserved
  -- (once reserved, they move into v_reserved_credit instead, so a single
  -- order is never counted in both buckets at once).
  select coalesce(sum(so.net_amount), 0) into v_pending_orders
  from sales_orders so
  where so.customer_id = p_customer_id and so.payment_type = 'credit'
    and so.status in ('approved', 'submitted', 'pending_approval')
    and not exists (
      select 1 from sales_order_credit_reservations scr
      where scr.order_id = so.id and scr.status in ('pending', 'active', 'partially_released')
    );

  select coalesce(sum(remaining_amount), 0) into v_reserved_credit
  from sales_order_credit_reservations
  where customer_id = p_customer_id and status in ('pending', 'active', 'partially_released');

  return v_effective_limit - coalesce(v_outstanding, 0) - v_pending_orders - v_reserved_credit;
end;
$$;

grant execute on function customer_available_credit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- CREDIT VALIDATION RESULT — snapshot stored per order/validation run.
-- ---------------------------------------------------------------------------
create table sales_order_credit_validations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  validation_time timestamptz not null default now(),
  credit_limit numeric(14,2),
  temporary_limit numeric(14,2),
  outstanding_balance numeric(14,2),
  overdue_balance numeric(14,2),
  existing_reserved_credit numeric(14,2),
  current_order_credit_amount numeric(14,2),
  available_credit_before numeric(14,2),
  available_credit_after numeric(14,2),
  status text not null check (status in (
    'not_validated', 'valid', 'warning', 'near_limit', 'over_limit', 'blocked',
    'temporary_credit_expired', 'overdue_block', 'override_required', 'conflict'
  )),
  block_reason text,
  override_required boolean not null default false,
  validated_by uuid references app_users(id)
);
create index idx_sales_order_credit_validations_order on sales_order_credit_validations(order_id);

alter table sales_order_credit_validations enable row level security;
create policy sales_order_credit_validations_isolation on sales_order_credit_validations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

alter table sales_orders add column if not exists credit_validation_status text not null default 'not_validated' check (credit_validation_status in (
  'not_validated', 'valid', 'warning', 'near_limit', 'over_limit', 'blocked',
  'temporary_credit_expired', 'overdue_block', 'override_required', 'conflict'
));

-- Computes overdue balance from existing sales aging and combines it with
-- the existing validate_customer_credit()/customer_available_credit()
-- engine. Never a second parallel credit calculation.
create or replace function validate_order_credit(p_order_id uuid)
returns void language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_profile customer_credit_profiles%rowtype;
  v_before numeric;
  v_after numeric;
  v_overdue numeric;
  v_checks record;
  v_status text := 'valid';
  v_block_reason text;
  v_override_required boolean := false;
begin
  if not has_permission('sales_orders:view_credit_validation') and not has_permission('sales_orders:submit') then
    raise exception 'Not permitted';
  end if;

  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;
  select * into v_profile from customer_credit_profiles where customer_id = v_order.customer_id;

  if v_order.payment_type != 'credit' then
    update sales_orders set credit_validation_status = 'not_validated' where id = p_order_id;
    return;
  end if;

  v_before := customer_available_credit(v_order.customer_id);

  select coalesce(sum(s.balance_amount), 0) into v_overdue
  from sales s
  where s.customer_id = v_order.customer_id and s.status = 'completed'
    and s.balance_amount > 0
    and s.created_at < now() - (coalesce(v_profile.credit_days, 0) + coalesce(v_profile.grace_days, 0)) * interval '1 day';

  for v_checks in select * from validate_customer_credit(v_order.customer_id, v_order.net_amount) loop
    if not v_checks.passed then
      v_status := case v_checks.check_name
        when 'customer_active' then 'blocked'
        when 'credit_status' then 'blocked'
        when 'available_credit' then 'over_limit'
        when 'maximum_outstanding' then 'over_limit'
        when 'temporary_credit_valid' then 'temporary_credit_expired'
        else 'blocked'
      end;
      v_block_reason := v_checks.message;
    end if;
  end loop;

  if v_overdue > 0 and v_profile.block_on_overdue then
    v_status := 'overdue_block';
    v_block_reason := format('Customer has %.2f overdue beyond credit + grace days', v_overdue);
  end if;

  if v_status != 'valid' then
    v_override_required := has_permission('sales_orders:request_credit_override');
  end if;

  v_after := v_before - v_order.net_amount;

  insert into sales_order_credit_validations (
    company_id, order_id, customer_id, credit_limit, temporary_limit, outstanding_balance, overdue_balance,
    existing_reserved_credit, current_order_credit_amount, available_credit_before, available_credit_after,
    status, block_reason, override_required, validated_by
  ) values (
    v_order.company_id, p_order_id, v_order.customer_id, v_profile.credit_limit, v_profile.temporary_credit_limit,
    (select outstanding_balance from customers where id = v_order.customer_id), v_overdue,
    (select coalesce(sum(remaining_amount), 0) from sales_order_credit_reservations where customer_id = v_order.customer_id and status in ('pending', 'active', 'partially_released')),
    v_order.net_amount, v_before, v_after, v_status, v_block_reason, v_override_required, auth.uid()
  );

  update sales_orders set credit_validation_status = v_status where id = p_order_id;
end;
$$;
grant execute on function validate_order_credit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- CREDIT RESERVATION
-- ---------------------------------------------------------------------------
create table sales_order_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  reserved_amount numeric(14,2) not null check (reserved_amount >= 0),
  currency text not null default 'QAR',
  reservation_date timestamptz not null default now(),
  expiry_date timestamptz,
  status text not null default 'pending' check (status in (
    'pending', 'active', 'partially_released', 'released', 'consumed', 'expired', 'cancelled', 'conflict'
  )),
  created_by uuid references app_users(id),
  released_by uuid references app_users(id),
  release_reason text,
  converted_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  -- One active credit reservation per order — "do not add the same order
  -- to reserved credit twice" enforced at the DB level via a unique
  -- constraint rather than only an application check.
  unique (order_id)
);
create index idx_sales_order_credit_reservations_customer on sales_order_credit_reservations(customer_id, status);

alter table sales_order_credit_reservations enable row level security;
create policy sales_order_credit_reservations_isolation on sales_order_credit_reservations for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create table sales_order_credit_reservation_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  reservation_id uuid not null references sales_order_credit_reservations(id) on delete cascade,
  action text not null check (action in ('created', 'released', 'partially_released', 'consumed', 'expired', 'cancelled')),
  amount_change numeric(14,2),
  reason text,
  performed_by uuid references app_users(id),
  performed_at timestamptz not null default now()
);

alter table sales_order_credit_reservation_history enable row level security;
create policy sales_order_credit_reservation_history_isolation on sales_order_credit_reservation_history for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

-- Locks the customer's credit profile row before reserving, so two orders
-- being approved concurrently for the same customer serialize rather than
-- both computing available credit against the same stale snapshot.
create or replace function create_credit_reservation(p_order_id uuid, p_expiry timestamptz default null)
returns uuid language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_reservation_id uuid;
  v_available numeric;
begin
  if not has_permission('sales_orders:reserve_credit') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_type != 'credit' then return null; end if;

  perform 1 from customer_credit_profiles where customer_id = v_order.customer_id for update;

  v_available := customer_available_credit(v_order.customer_id);
  if v_available < v_order.net_amount and not has_permission('sales_orders:request_credit_override') then
    raise exception 'Insufficient available credit (% available, % required) and no override permission', v_available, v_order.net_amount;
  end if;

  insert into sales_order_credit_reservations (
    company_id, customer_id, order_id, reserved_amount, expiry_date, status, created_by, remaining_amount
  ) values (
    v_order.company_id, v_order.customer_id, p_order_id, v_order.net_amount, p_expiry, 'active', auth.uid(), v_order.net_amount
  )
  on conflict (order_id) do update set reserved_amount = excluded.reserved_amount, remaining_amount = excluded.remaining_amount
  returning id into v_reservation_id;

  insert into sales_order_credit_reservation_history (company_id, reservation_id, action, amount_change, performed_by)
  values (v_order.company_id, v_reservation_id, 'created', v_order.net_amount, auth.uid());

  return v_reservation_id;
end;
$$;
grant execute on function create_credit_reservation(uuid, timestamptz) to authenticated;

create or replace function release_credit_reservation(p_order_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare v_res sales_order_credit_reservations%rowtype;
begin
  if not has_permission('sales_orders:release_credit_reservation') then raise exception 'Not permitted'; end if;
  select * into v_res from sales_order_credit_reservations where order_id = p_order_id;
  if not found then return; end if;
  if v_res.status in ('released', 'cancelled', 'consumed') then return; end if;

  update sales_order_credit_reservations set status = 'released', released_by = auth.uid(), release_reason = p_reason, remaining_amount = 0
  where id = v_res.id;

  insert into sales_order_credit_reservation_history (company_id, reservation_id, action, amount_change, reason, performed_by)
  values (v_res.company_id, v_res.id, 'released', -v_res.remaining_amount, p_reason, auth.uid());
end;
$$;
grant execute on function release_credit_reservation(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- CREDIT OVERRIDE REQUEST — mirrors the existing customer_credit_approvals
-- (4A.2 Part 1) request/decision shape rather than inventing a new one.
-- ---------------------------------------------------------------------------
create table sales_order_credit_override_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  credit_limit numeric(14,2),
  available_credit numeric(14,2),
  order_credit_amount numeric(14,2),
  excess_amount numeric(14,2),
  outstanding_balance numeric(14,2),
  overdue_balance numeric(14,2),
  risk_level_id uuid references customer_risk_levels(id) on delete set null,
  reason text,
  requested_by uuid references app_users(id),
  requested_date timestamptz not null default now(),
  approval_level text not null default 'supervisor' check (approval_level in (
    'supervisor', 'branch_manager', 'credit_controller', 'accounts', 'admin'
  )),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  decided_by uuid references app_users(id),
  decision_reason text,
  decided_at timestamptz,
  expiry_date timestamptz
);
create index idx_sales_order_credit_override_requests_order on sales_order_credit_override_requests(order_id);
create index idx_sales_order_credit_override_requests_status on sales_order_credit_override_requests(company_id, status);

alter table sales_order_credit_override_requests enable row level security;
create policy sales_order_credit_override_requests_isolation on sales_order_credit_override_requests for all
  using (company_id = current_company_id()) with check (company_id = current_company_id());

create or replace function request_credit_override(p_order_id uuid, p_reason text, p_approval_level text default 'supervisor')
returns uuid language plpgsql security definer as $$
declare
  v_order sales_orders%rowtype;
  v_profile customer_credit_profiles%rowtype;
  v_available numeric;
  v_request_id uuid;
begin
  if not has_permission('sales_orders:request_credit_override') then raise exception 'Not permitted'; end if;
  select * into v_order from sales_orders where id = p_order_id and company_id = current_company_id();
  if not found then raise exception 'Order not found'; end if;
  select * into v_profile from customer_credit_profiles where customer_id = v_order.customer_id;
  v_available := customer_available_credit(v_order.customer_id);

  insert into sales_order_credit_override_requests (
    company_id, order_id, customer_id, credit_limit, available_credit, order_credit_amount, excess_amount,
    outstanding_balance, overdue_balance, risk_level_id, reason, requested_by, approval_level
  ) values (
    v_order.company_id, p_order_id, v_order.customer_id, v_profile.credit_limit, v_available, v_order.net_amount,
    greatest(v_order.net_amount - v_available, 0), (select outstanding_balance from customers where id = v_order.customer_id),
    0, v_profile.risk_level_id, p_reason, auth.uid(), p_approval_level
  ) returning id into v_request_id;

  update sales_orders set credit_validation_status = 'override_required' where id = p_order_id;

  return v_request_id;
end;
$$;
grant execute on function request_credit_override(uuid, text, text) to authenticated;

-- Separation-of-duties: an employee may not approve their own request
-- when the company has that restriction enabled — checked here rather
-- than assumed at the UI layer only.
create or replace function decide_credit_override(p_request_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer as $$
declare
  v_request sales_order_credit_override_requests%rowtype;
  v_requires_separation boolean;
begin
  if not has_permission('sales_orders:approve_credit_override') then raise exception 'Not permitted'; end if;
  select * into v_request from sales_order_credit_override_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  select require_manager_approval into v_requires_separation from customer_credit_profiles where customer_id = v_request.customer_id;
  if v_requires_separation and v_request.requested_by = auth.uid() then
    raise exception 'Separation of duties: you cannot approve your own credit override request';
  end if;

  update sales_order_credit_override_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decision_reason = p_reason, decided_at = now()
  where id = p_request_id;

  if p_approve then
    update sales_orders set credit_validation_status = 'valid' where id = v_request.order_id;
  end if;
end;
$$;
grant execute on function decide_credit_override(uuid, boolean, text) to authenticated;
